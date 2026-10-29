"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const HyperCore = require("../hypervisor-core.js");

/** One VM on its own host; long quantum unless a test cares about the timer. */
function solo(source, { options = {}, vm = {} } = {}) {
  const hv = HyperCore.createHypervisor({ pcpus: 1, scheduler: "round-robin", quantum: 50, ...options });
  const id = hv.createVM({ name: "guest", source, memoryPages: 4, ...vm });
  return { hv, id };
}

function runUntilHalted(hv, id, limit = 5000) {
  const events = [];
  for (let i = 0; i < limit; i++) {
    for (const e of hv.step()) events.push(e);
    const vm = hv.snapshot().vms.find((v) => v.id === id);
    if (vm.state === "halted") return events;
  }
  assert.fail(`VM ${id} did not halt within ${limit} ticks`);
}

function exitReasons(events, vm) {
  return events.filter((e) => e.type === "exit" && (vm === undefined || e.vm === vm)).map((e) => e.reason);
}

function vmSnap(hv, id) {
  return hv.snapshot().vms.find((v) => v.id === id);
}

// ---------- Assembler ----------

test("assembler accepts every instruction form, labels, comments and hex/negative immediates", () => {
  const src = `
    start: MOV r0, 0x1F      ; hex
           MOV r1, -3        ; negative
           ADD r0, r1
           SUB r0, 1
           MUL r1, r0
           AND r1, 0xFF
           XOR r1, r1
           INC r2
           DEC r2
           LOAD r3, [16]
           STORE r3, [r0]
           STORE r3, [r0+4]
           LOAD r3, [r1-2]
           JZ r1, start
           JNZ r1, done
           NOP
           OUT 1, r0
           IN r2, 3
           CLI
           STI
           CPUID r3
           VMCALL 2
           PAUSE
           WRPT 1, r2
    done:  HLT
  `;
  const out = HyperCore.assemble(src);
  assert.deepEqual(out.errors, []);
  assert.equal(out.program.length, 25);
  assert.deepEqual(out.program[0].args, [{ kind: "reg", r: 0 }, { kind: "imm", value: 31 }]);
  assert.equal(out.program[1].args[1].value, -3);
  assert.deepEqual(out.program[11].args[1], { kind: "mem", base: 0, offset: 4 });
  assert.deepEqual(out.program[12].args[1], { kind: "mem", base: 1, offset: -2 });
  assert.equal(out.program[14].args[1].target, 24);
  assert.equal(out.labels.start, 0);
  assert.ok(out.program[16].privileged && !out.program[2].privileged);
});

test("assembler reports each kind of error with its line number", () => {
  const out = HyperCore.assemble(["MOV r0, 1", "FLY r1", "ADD r9, 1", "JMP nowhere", "x: NOP", "x: NOP", "LOAD r0, 16", "INC"].join("\n"));
  assert.equal(out.ok, false);
  const byLine = Object.fromEntries(out.errors.map((e) => [e.line, e.message]));
  assert.match(byLine[2], /unknown instruction "FLY"/);
  assert.match(byLine[3], /expected a register/);
  assert.match(byLine[4], /undefined label "nowhere"/);
  assert.match(byLine[6], /duplicate label "x"/);
  assert.match(byLine[7], /memory operand/);
  assert.match(byLine[8], /expects 1 operand/);
  assert.throws(() => HyperCore.createHypervisor().createVM({ name: "bad", source: "FLY" }), (err) => err instanceof HyperCore.HyperError && err.errors.length === 1);
});

test("every sample program assembles", () => {
  for (const [id, p] of Object.entries(HyperCore.SAMPLE_PROGRAMS)) {
    assert.deepEqual(HyperCore.assemble(p.source).errors, [], id);
  }
});

// ---------- Execution semantics ----------

test("ALU, branch and memory instructions compute the right values", () => {
  const { hv, id } = solo(`
        MOV r0, 6
        MOV r1, 7
        MUL r0, r1        ; 42
        MOV r2, 0xF0
        AND r2, 0x3C      ; 0x30 = 48
        XOR r2, 0xFF      ; 207
        MOV r1, 3
  loop: ADD r3, 2         ; r3 starts at 0 (vCPU 0) → 6
        DEC r1
        JNZ r1, loop
        STORE r0, [17]    ; page 1, offset 1
        LOAD r1, [17]
        SUB r1, 50        ; -8
        JZ r1, never
        HLT
  never: MOV r0, 999
        HLT`);
  runUntilHalted(hv, id);
  const vm = vmSnap(hv, id);
  assert.deepEqual(vm.vcpus[0].regs, [42, -8, 207, 6]);
  assert.equal(hv.guestMemory(id)[1][1], 42);
  assert.equal(hv.guestMemory(id)[0], null, "page 0 was never touched, so it was never backed");
});

test("registers wrap at 32 bits", () => {
  const { hv, id } = solo("MOV r0, 0x7FFFFFFF\nINC r0\nHLT");
  runUntilHalted(hv, id);
  assert.equal(vmSnap(hv, id).vcpus[0].regs[0], -2147483648);
});

// ---------- Trap-and-emulate ----------

test("unprivileged code only exits for the timer and first-touch faults", () => {
  const { hv, id } = solo(HyperCore.SAMPLE_PROGRAMS["cpu-bound"].source, { options: { quantum: 5 } });
  const events = hv.run(300);
  const reasons = new Set(exitReasons(events, id));
  assert.deepEqual([...reasons].sort(), ["EPT_VIOLATION", "EXTINT"]);
  assert.equal(exitReasons(events, id).filter((r) => r === "EPT_VIOLATION").length, 1);
});

test("each privileged instruction exits with its own reason and is emulated", () => {
  const { hv, id } = solo("OUT 1, 7\nIN r1, 2\nCLI\nCPUID r2\nSTI\nVMCALL 9\nHLT");
  const events = runUntilHalted(hv, id);
  assert.deepEqual(exitReasons(events, id), ["IO", "IO", "PRIV", "CPUID", "PRIV", "HYPERCALL", "HLT"]);
  assert.deepEqual(events.filter((e) => e.type === "console").map((e) => e.value), [7]);
  const vm = vmSnap(hv, id);
  assert.equal(vm.vcpus[0].IF, 1);
  assert.equal(vm.vcpus[0].regs[2], 0, "CPUID returns the vCPU index");
  assert.ok(vm.vcpus[0].regs[1] > 0, "IN port 2 reads the tick counter");
  assert.equal(vm.state, "halted");
});

test("an exit keeps the pCPU in the VMM for exactly its cost", () => {
  const { hv } = solo("OUT 1, 1\nNOP\nHLT");
  hv.run(10);
  const lane = hv.snapshot().timeline.map((t) => t.kind);
  // OUT (guest), 3 VMM ticks of I/O emulation, NOP, HLT, 1 VMM tick, then idle.
  assert.deepEqual(lane.slice(0, 8), ["guest", "vmm", "vmm", "vmm", "guest", "guest", "vmm", "idle"]);
  const custom = solo("OUT 1, 1\nHLT", { options: { exitCosts: { IO: 5 } } });
  custom.hv.run(8);
  assert.equal(custom.hv.snapshot().timeline.filter((t) => t.reason === "IO").length, 5);
});

test("PAUSE and VMCALL 2 yield, HLT halts, and a bad address faults", () => {
  const two = HyperCore.createHypervisor({ pcpus: 1, scheduler: "round-robin", quantum: 50 });
  const a = two.createVM({ name: "a", source: "loop: PAUSE\nJMP loop", memoryPages: 1 });
  const b = two.createVM({ name: "b", source: "loop: VMCALL 2\nJMP loop", memoryPages: 1 });
  const events = two.run(60);
  const yields = events.filter((e) => e.type === "schedule" && e.reason === "guest yielded");
  assert.ok(yields.some((e) => e.from.vm === a) && yields.some((e) => e.from.vm === b));

  const { hv, id } = solo("LOAD r0, [9999]\nHLT");
  const ev = hv.run(5);
  assert.deepEqual(exitReasons(ev, id), ["GUEST_PF"]);
  assert.equal(vmSnap(hv, id).vcpus[0].state, "faulted");
});

// ---------- Memory virtualization ----------

test("EPT vs shadow paging: different exits and walk costs, identical guest results", () => {
  const program = HyperCore.SAMPLE_PROGRAMS["pt-thrash"].source;
  const runMode = (paging) => {
    const { hv, id } = solo(program, { options: { paging } });
    const events = runUntilHalted(hv, id);
    const vm = vmSnap(hv, id);
    return { hv, id, vm, reasons: exitReasons(events, id), memory: hv.guestMemory(id) };
  };
  const ept = runMode("ept");
  const shadow = runMode("shadow");
  assert.equal(ept.reasons.filter((r) => r === "PT_WRITE").length, 0, "EPT: the guest edits its page table freely");
  assert.equal(shadow.reasons.filter((r) => r === "PT_WRITE").length, 60, "shadow: one trap per WRPT");
  assert.ok(shadow.reasons.includes("SHADOW_PF"));
  assert.equal(ept.vm.stats.walkRefs / ept.vm.stats.tlbMisses, 3);
  assert.equal(shadow.vm.stats.walkRefs / shadow.vm.stats.tlbMisses, 1);
  assert.deepEqual(ept.vm.vcpus[0].regs, shadow.vm.vcpus[0].regs);
  assert.deepEqual(ept.memory, shadow.memory);
  assert.ok(ept.vm.stats.vmmTicks < shadow.vm.stats.vmmTicks);
});

test("host frames are allocated lazily, once per first-touched guest page", () => {
  const { hv, id } = solo("STORE r0, [0]\nSTORE r0, [16]\nLOAD r1, [32]\nSTORE r0, [1]\nLOAD r1, [17]\nHLT");
  const events = runUntilHalted(hv, id);
  assert.equal(exitReasons(events, id).filter((r) => r === "EPT_VIOLATION").length, 3);
  assert.equal(events.filter((e) => e.type === "alloc").length, 3);
  assert.equal(hv.snapshot().frames.filter((f) => !f.free).length, 3);
});

test("the TLB caches translations and changing paging mode flushes it", () => {
  const { hv, id } = solo("loop: LOAD r0, [0]\nLOAD r0, [16]\nJMP loop", { options: { quantum: 100 } });
  hv.run(40);
  let vm = vmSnap(hv, id);
  assert.ok(vm.stats.tlbHits > vm.stats.tlbMisses * 5);
  assert.equal(vm.vcpus[0].tlb.length, 2);
  hv.setOption("paging", "shadow");
  vm = vmSnap(hv, id);
  assert.equal(vm.vcpus[0].tlb.length, 0);
  assert.throws(() => hv.setOption("pcpus", 4), /rebuild/);
});

test("KSM merges zero pages and copy-on-write keeps sharers apart", () => {
  const hv = HyperCore.createHypervisor({ pcpus: 2, ksm: true, ksmInterval: 10, quantum: 50 });
  const reader = hv.createVM({ name: "reader", source: HyperCore.SAMPLE_PROGRAMS["zero-reader"].source, memoryPages: 8 });
  const writer = hv.createVM({
    name: "writer",
    source: "LOAD r0, [0]\nLOAD r0, [16]\nMOV r1, 40\nw: DEC r1\nJNZ r1, w\nMOV r0, 42\nSTORE r0, [16]\nloop: PAUSE\nJMP loop",
    memoryPages: 2,
  });
  const events = hv.run(200);
  assert.ok(events.some((e) => e.type === "share"));
  const cows = events.filter((e) => e.type === "exit" && e.reason === "COW");
  assert.equal(cows.length, 1);
  assert.equal(cows[0].vm, writer);
  assert.deepEqual(hv.guestMemory(writer)[1].slice(0, 2), [42, 0]);
  assert.ok(hv.guestMemory(reader).every((page) => page === null || page.every((w) => w === 0)), "sharers still read zeros");
  const used = hv.snapshot().frames.filter((f) => !f.free).length;
  assert.ok(used <= 3, `10 guest pages fit in ${used} frames`);
  assert.deepEqual(hv.checkInvariants(), []);
});

test("overcommit with swap keeps guest data intact", () => {
  // Write a distinct value to each of 8 pages, read them all back, print them.
  const src = `
        MOV r0, 0
        MOV r1, 1
  fill: STORE r1, [r0]
        ADD r1, 10
        ADD r0, 16
        MOV r2, r0
        SUB r2, 128
        JNZ r2, fill
        MOV r0, 0
  dump: LOAD r1, [r0]
        OUT 1, r1
        ADD r0, 16
        MOV r2, r0
        SUB r2, 128
        JNZ r2, dump
        HLT`;
  const { hv, id } = solo(src, { options: { hostFrames: 4 }, vm: { memoryPages: 8 } });
  const events = runUntilHalted(hv, id);
  assert.ok(events.filter((e) => e.type === "swap-out").length >= 4);
  assert.ok(events.some((e) => e.type === "swap-in"));
  assert.deepEqual(vmSnap(hv, id).console, [1, 11, 21, 31, 41, 51, 61, 71]);
  assert.deepEqual(hv.checkInvariants(), []);
});

test("ballooning frees host frames and re-touching a ballooned page deflates it", () => {
  const { hv, id } = solo(HyperCore.SAMPLE_PROGRAMS["boot-then-idle"].source, { vm: { memoryPages: 8 } });
  hv.run(150);
  const usedBefore = hv.snapshot().frames.filter((f) => !f.free).length;
  assert.equal(usedBefore, 6);
  hv.setBalloon(id, 7);
  const snap = hv.snapshot();
  assert.equal(vmSnap(hv, id).balloon, 7);
  assert.equal(snap.frames.filter((f) => !f.free).length, 1, "only the hot page 0 stays backed");
  hv.run(100);
  assert.equal(vmSnap(hv, id).balloon, 7, "the idle loop never touches the cold pages");

  const hog = solo(HyperCore.SAMPLE_PROGRAMS["memory-hog"].source, { vm: { memoryPages: 8 } });
  hog.hv.run(400);
  hog.hv.setBalloon(hog.id, 4);
  const ev = hog.hv.run(400);
  assert.ok(ev.some((e) => e.type === "balloon-out"), "a busy guest faults its pages back");
  assert.ok(vmSnap(hog.hv, hog.id).balloon < 4);
  assert.deepEqual(hog.hv.checkInvariants(), []);
});

// ---------- Scheduling ----------

function shares(hv) {
  return Object.fromEntries(hv.snapshot().vms.map((v) => [v.name, v.stats.ticksRun]));
}

function twoVms(scheduler, weights, caps = [0, 0]) {
  const hv = HyperCore.createHypervisor({ pcpus: 1, scheduler, quantum: 4 });
  const src = HyperCore.SAMPLE_PROGRAMS["cpu-bound"].source;
  hv.createVM({ name: "a", source: src, memoryPages: 1, weight: weights[0], cap: caps[0] });
  hv.createVM({ name: "b", source: src, memoryPages: 1, weight: weights[1], cap: caps[1] });
  hv.run(900);
  return shares(hv);
}

test("credit and fair schedulers split CPU by weight; round-robin splits it evenly", () => {
  const credit = twoVms("credit", [512, 256]);
  const fair = twoVms("fair", [512, 256]);
  const rr = twoVms("round-robin", [512, 256]);
  assert.ok(Math.abs(credit.a / credit.b - 2) <= 0.25, `credit ratio ${credit.a / credit.b}`);
  assert.ok(Math.abs(fair.a / fair.b - 2) <= 0.25, `fair ratio ${fair.a / fair.b}`);
  assert.ok(Math.abs(rr.a / rr.b - 1) <= 0.1, `round-robin ratio ${rr.a / rr.b}`);
});

test("a credit cap bounds a VM's share even when the CPU would be idle", () => {
  const hv = HyperCore.createHypervisor({ pcpus: 1, scheduler: "credit", quantum: 4 });
  const id = hv.createVM({ name: "capped", source: HyperCore.SAMPLE_PROGRAMS["cpu-bound"].source, memoryPages: 1, cap: 25 });
  hv.run(900);
  const vm = vmSnap(hv, id);
  const share = (vm.stats.ticksRun + vm.stats.vmmTicks) / 900;
  assert.ok(share <= 0.3, `capped share ${share}`);
  assert.ok(hv.snapshot().timeline.some((t) => t.kind === "idle"));
});

test("a vCPU never runs on two pCPUs and the run queue stays consistent", () => {
  const hv = HyperCore.loadScenario("spin-lock");
  for (let i = 0; i < 600; i++) {
    hv.step();
    const errors = hv.checkInvariants();
    assert.deepEqual(errors, [], `tick ${i}: ${errors.join("; ")}`);
  }
  const smp = hv.snapshot().vms.find((v) => v.name === "smp");
  assert.ok(smp.console.length > 0, "the waiter eventually got the lock");
  assert.ok(smp.stats.exits.PAUSE > 0);
});

// ---------- Live migration ----------

test("pre-copy migration converges for a read-mostly VM and not for a dirty writer", () => {
  const hv = HyperCore.loadScenario("live-migration");
  const events = hv.run(800);
  const snap = hv.snapshot();
  const web = snap.completedMigrations.find((m) => m.name === "web");
  const db = snap.completedMigrations.find((m) => m.name === "db");
  assert.ok(web && db, "both migrations finished");
  assert.ok(web.rounds <= 2 && web.downtime <= 10, JSON.stringify(web));
  assert.equal(db.rounds, 6, "the dirty writer hits maxRounds");
  assert.ok(db.history.every((r) => r.dirtied === 8), "every page is dirty again each round");
  assert.equal(db.downtime, Math.ceil(8 / 0.25) + 1);
  for (const name of ["web", "db"]) {
    const vm = snap.vms.find((v) => v.name === name);
    assert.equal(vm.host, "host-b");
    assert.ok(vm.p2m.every((p) => p.hfn === null), `${name}'s frames are freed`);
    const switchTick = events.find((e) => e.type === "migration" && e.phase === "switchover" && e.vm === vm.id).tick;
    assert.ok(!events.some((e) => e.type === "exec" && e.vm === vm.id && e.tick > switchTick), `${name} isn't scheduled after switchover`);
  }
  assert.equal(snap.frames.filter((f) => !f.free).length, 0);
});

// ---------- Whole-system checks ----------

test("every scenario stays internally consistent for 1500 ticks", () => {
  for (const id of Object.keys(HyperCore.SCENARIOS)) {
    const hv = HyperCore.loadScenario(id);
    for (let i = 0; i < 1500; i++) {
      hv.step();
      if (i % 50 === 0 || i === 1499) {
        const errors = hv.checkInvariants();
        assert.deepEqual(errors, [], `${id} tick ${i}: ${errors.join("; ")}`);
      }
    }
  }
});

test("the memory-overcommit scenario exercises lazy allocation, KSM, swap and ballooning", () => {
  const hv = HyperCore.loadScenario("memory-overcommit");
  const types = new Set(hv.run(1200).map((e) => e.type));
  for (const t of ["alloc", "share", "swap-out", "swap-in", "balloon-in", "ksm-scan", "action"]) assert.ok(types.has(t), `missing ${t}`);
});

test("the same scenario and seed produce identical event traces", () => {
  const trace = () => JSON.stringify(HyperCore.loadScenario("memory-overcommit", { seed: 7 }).run(500));
  assert.equal(trace(), trace());
  const io = (seed) => {
    const { hv } = solo("loop: IN r0, 3\nOUT 1, r0\nJMP loop", { options: { seed } });
    hv.run(60);
    return hv.snapshot().vms[0].console.join(",");
  };
  assert.equal(io(3), io(3));
  assert.notEqual(io(3), io(4));
});

test("snapshots are JSON-safe and pausing a VM takes it off the CPU", () => {
  const hv = HyperCore.loadScenario("trap-and-emulate");
  hv.run(30);
  const snap = JSON.parse(JSON.stringify(hv.snapshot()));
  assert.equal(snap.vms.length, 3);
  const id = snap.vms[0].id;
  hv.pauseVM(id);
  const ev = hv.run(40);
  assert.ok(!ev.some((e) => e.type === "exec" && e.vm === id));
  hv.resumeVM(id);
  assert.ok(hv.run(40).some((e) => e.type === "exec" && e.vm === id));
  hv.destroyVM(id);
  assert.ok(vmSnap(hv, id).p2m.every((p) => p.hfn === null));
  assert.deepEqual(hv.checkInvariants(), []);
});
