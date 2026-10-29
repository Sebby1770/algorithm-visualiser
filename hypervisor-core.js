/* ============================================================
   Hypervisor Lab — a small virtual machine monitor (VMM) simulator
   Works in the browser (global HyperCore) and Node (CJS).

   Guests run real programs written in HV-ASM, a tiny instruction set,
   on virtual CPUs. The hypervisor:
     · runs ordinary instructions directly and traps privileged ones
       (trap-and-emulate — the Popek–Goldberg recipe);
     · translates guest addresses in two stages, guest-virtual →
       guest-physical → host-physical, with hardware nested paging (EPT)
       or software shadow page tables;
     · schedules vCPUs onto physical CPUs (round-robin, Xen-style credit,
       or CFS-style fair share);
     · overcommits memory with lazy allocation, page sharing (KSM),
       ballooning and host swap;
     · live-migrates a VM with iterative pre-copy.

   Time is discrete: one tick = one instruction slot per physical CPU.
   Handling a VM exit keeps that pCPU busy in the VMM for a few ticks.
   Everything is deterministic for a given seed, and every step appends
   plain-object events so the UI can replay and narrate it.
   ============================================================ */

(function (root) {
  // ---------- Errors & small helpers ----------

  class HyperError extends Error {
    constructor(message, errors = []) {
      super(message);
      this.name = "HyperError";
      this.errors = errors;
    }
  }

  /** mulberry32 — tiny seeded PRNG so runs and tests are reproducible. */
  function createRng(seed = 1) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  // ---------- HV-ASM assembler ----------
  /*
    Registers r0–r3 (32-bit, wrapping), a program counter, and a virtual
    interrupt flag. Operands:
      reg   r0..r3
      imm   42, -7, 0x1F
      src   reg or imm
      mem   [imm] · [rN] · [rN+imm] · [rN-imm]   (word address)
      label a name defined as "name:" at the start of a line
    Code lives outside data memory (Harvard style) so a program can't
    overwrite itself — it keeps the toy small and the listings honest.
  */

  const ISA = {
    MOV: ["reg", "src"],
    ADD: ["reg", "src"],
    SUB: ["reg", "src"],
    MUL: ["reg", "src"],
    AND: ["reg", "src"],
    XOR: ["reg", "src"],
    INC: ["reg"],
    DEC: ["reg"],
    LOAD: ["reg", "mem"],
    STORE: ["reg", "mem"],
    JMP: ["label"],
    JZ: ["reg", "label"],
    JNZ: ["reg", "label"],
    NOP: [],
    // Sensitive / privileged: each one traps to the hypervisor (a VM exit).
    OUT: ["imm", "src"],
    IN: ["reg", "imm"],
    HLT: [],
    CLI: [],
    STI: [],
    CPUID: ["reg"],
    VMCALL: ["imm"],
    PAUSE: [],
    WRPT: ["src", "src"],
  };

  const PRIVILEGED = new Set(["OUT", "IN", "HLT", "CLI", "STI", "CPUID", "VMCALL", "PAUSE", "WRPT"]);

  const OPERAND_HELP = {
    reg: "a register r0–r3",
    imm: "a number",
    src: "a register or a number",
    mem: "a memory operand like [16], [r1] or [r1+4]",
    label: "a label",
  };

  const REG_RE = /^r([0-3])$/i;
  const IMM_RE = /^-?(0x[0-9a-f]+|\d+)$/i;
  const MEM_RE = /^\[\s*(?:(r[0-3])\s*(?:([+-])\s*(0x[0-9a-f]+|\d+))?|(-?(?:0x[0-9a-f]+|\d+)))\s*\]$/i;
  const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

  function parseImm(text) {
    const neg = text.startsWith("-");
    const body = neg ? text.slice(1) : text;
    const v = body.toLowerCase().startsWith("0x") ? parseInt(body, 16) : parseInt(body, 10);
    return neg ? -v : v;
  }

  function parseOperand(kind, text) {
    const reg = text.match(REG_RE);
    if (kind === "reg") return reg ? { kind: "reg", r: Number(reg[1]) } : null;
    if (kind === "imm") return IMM_RE.test(text) ? { kind: "imm", value: parseImm(text) } : null;
    if (kind === "src") {
      if (reg) return { kind: "reg", r: Number(reg[1]) };
      return IMM_RE.test(text) ? { kind: "imm", value: parseImm(text) } : null;
    }
    if (kind === "mem") {
      const m = text.match(MEM_RE);
      if (!m) return null;
      if (m[4] !== undefined) return { kind: "mem", base: null, offset: parseImm(m[4]) };
      const offset = m[3] ? parseImm(m[3]) * (m[2] === "-" ? -1 : 1) : 0;
      return { kind: "mem", base: Number(m[1].slice(1)), offset };
    }
    if (kind === "label") return LABEL_RE.test(text) && !REG_RE.test(text) ? { kind: "label", name: text } : null;
    return null;
  }

  function splitOperands(text) {
    if (!text.trim()) return [];
    const parts = [];
    let depth = 0;
    let cur = "";
    for (const ch of text) {
      if (ch === "[") depth++;
      if (ch === "]") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    parts.push(cur.trim());
    return parts;
  }

  /**
   * Two passes: the first collects labels and instructions, the second
   * resolves operands and label targets. Errors carry 1-based line numbers.
   */
  function assemble(source) {
    const lines = String(source === undefined || source === null ? "" : source).split(/\r?\n/);
    const labels = {};
    const pending = [];
    const errors = [];
    lines.forEach((raw, i) => {
      const line = i + 1;
      let text = raw.replace(/;.*$/, "").trim();
      for (;;) {
        const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
        if (!m) break;
        const name = m[1];
        if (REG_RE.test(name)) errors.push({ line, message: `"${name}" is a register name and can't be a label` });
        else if (Object.prototype.hasOwnProperty.call(labels, name.toLowerCase())) errors.push({ line, message: `duplicate label "${name}"` });
        else labels[name.toLowerCase()] = pending.length;
        text = text.slice(m[0].length).trim();
      }
      if (!text) return;
      const m = text.match(/^([A-Za-z]+)\b\s*(.*)$/);
      if (!m) {
        errors.push({ line, message: `can't read "${text}"` });
        return;
      }
      const op = m[1].toUpperCase();
      if (!ISA[op]) {
        errors.push({ line, message: `unknown instruction "${m[1]}"` });
        return;
      }
      pending.push({ op, rawArgs: splitOperands(m[2]), line, text: text.replace(/\s+/g, " ") });
    });

    const program = pending.map((ins) => {
      const spec = ISA[ins.op];
      const out = { op: ins.op, args: [], line: ins.line, text: ins.text, privileged: PRIVILEGED.has(ins.op) };
      if (ins.rawArgs.length !== spec.length) {
        const want = spec.length ? spec.map((k) => OPERAND_HELP[k]).join(", ") : "no operands";
        errors.push({ line: ins.line, message: `${ins.op} expects ${spec.length} operand${spec.length === 1 ? "" : "s"} (${want}), got ${ins.rawArgs.length}` });
        return out;
      }
      spec.forEach((kind, j) => {
        const parsed = parseOperand(kind, ins.rawArgs[j]);
        if (!parsed) {
          errors.push({ line: ins.line, message: `${ins.op} operand ${j + 1}: expected ${OPERAND_HELP[kind]}, got "${ins.rawArgs[j]}"` });
          return;
        }
        if (parsed.kind === "label") {
          const target = labels[parsed.name.toLowerCase()];
          if (target === undefined) {
            errors.push({ line: ins.line, message: `undefined label "${parsed.name}"` });
            return;
          }
          parsed.target = target;
        }
        out.args.push(parsed);
      });
      return out;
    });
    errors.sort((a, b) => a.line - b.line);
    return { ok: errors.length === 0, program, labels, errors };
  }

  // ---------- Hypervisor: configuration ----------

  const DEFAULT_EXIT_COSTS = {
    IO: 3, // emulate a device register access
    HLT: 1,
    PRIV: 1, // CLI / STI: flip the virtual interrupt flag
    CPUID: 1,
    HYPERCALL: 2,
    PAUSE: 1, // pause-loop exiting
    PT_WRITE: 2, // shadow paging: sync the shadow table
    SHADOW_PF: 2, // shadow paging: fill a missing shadow entry
    EPT_VIOLATION: 2, // nested paging: back a guest-physical page
    SWAP_IN: 4, // extra on top of a fault when the page must come back from swap
    COW: 2, // copy a shared page before the guest may write it
    EXTINT: 1, // timer interrupt: the quantum is over
    GUEST_PF: 1,
  };

  const DEFAULT_OPTIONS = {
    pcpus: 2,
    hostFrames: 32,
    pageSize: 16,
    scheduler: "credit",
    quantum: 4,
    paging: "ept",
    ksm: false,
    ksmInterval: 20,
    creditPeriod: 30,
    seed: 1,
    exitCosts: {},
  };

  const SCHEDULERS = ["round-robin", "credit", "fair"];
  const TLB_SIZE = 4;
  const TIMELINE_TICKS = 240;
  const CONSOLE_CAP = 20;
  // In EPT mode a TLB miss walks two tables. With a one-level toy table that is
  // 3 references (guest PTE's own address translation + the PTE + the data
  // page's p2m entry). Real x86 4-level × 4-level walks can take 24.
  const WALK_REFS = { ept: 3, shadow: 1 };

  function normalizeOptions(opts = {}) {
    const o = { ...DEFAULT_OPTIONS, ...opts };
    return {
      pcpus: clamp(Math.floor(Number(o.pcpus) || 2), 1, 4),
      hostFrames: clamp(Math.floor(Number(o.hostFrames) || 32), 4, 128),
      pageSize: clamp(Math.floor(Number(o.pageSize) || 16), 4, 64),
      scheduler: SCHEDULERS.includes(o.scheduler) ? o.scheduler : "credit",
      quantum: clamp(Math.floor(Number(o.quantum) || 4), 1, 50),
      paging: o.paging === "shadow" ? "shadow" : "ept",
      ksm: !!o.ksm,
      ksmInterval: clamp(Math.floor(Number(o.ksmInterval) || 20), 1, 1000),
      creditPeriod: clamp(Math.floor(Number(o.creditPeriod) || 30), 5, 1000),
      seed: Math.floor(Number(o.seed) || 1),
      exitCosts: { ...DEFAULT_EXIT_COSTS, ...(o.exitCosts || {}) },
    };
  }

  function ref(vcpu) {
    return vcpu ? { vm: vcpu.vm, vcpu: vcpu.id } : null;
  }

  // ---------- Hypervisor ----------
  /*
    Host memory: frames[hfn] = { content, refCount, owners: [{ vm, gpfn }], cow }
    Per VM:
      gpt[vpage]  → gpfn      the guest's own page table (guest-virtual → guest-physical)
      p2m[gpfn]   → { hfn, state, swapSlot, lastTouch }
                               the VMM's table (guest-physical → host frame), i.e. the EPT
        state: "unbacked" (never touched) · "mapped" · "shared" (KSM, copy-on-write)
               · "swapped" (contents in host swap) · "ballooned" (given back by the guest)
      shadow: vpage → hfn      shadow paging only: the composed mapping the VMM maintains
    Every change to a p2m entry shoots down matching TLB and shadow entries,
    so cached translations can never point at a stale frame.
  */

  class Hypervisor {
    constructor(options = {}) {
      this.options = normalizeOptions(options);
      this.rng = createRng(this.options.seed);
      this.tick = 0;
      this.events = [];
      this.vms = [];
      this.nextVmId = 1;
      this.frames = Array.from({ length: this.options.hostFrames }, () => this.blankFrame());
      this.swap = new Map();
      this.nextSwapSlot = 0;
      this.clockHand = 0;
      this.runq = [];
      this.pcpus = Array.from({ length: this.options.pcpus }, (_, id) => ({
        id,
        mode: "idle",
        current: null,
        prev: null,
        sliceLeft: 0,
        vmmLeft: 0,
        exitReason: null,
        after: null,
      }));
      this.timeline = [];
      this.actions = [];
      this.migration = null;
      this.migrationQueue = [];
      this.completedMigrations = [];
      this.lastTranslation = null;
    }

    blankFrame() {
      return { content: new Array(this.options.pageSize).fill(0), refCount: 0, owners: [], cow: false };
    }

    emit(type, data = {}) {
      const event = { tick: this.tick, type, ...data };
      this.events.push(event);
      return event;
    }

    /** Runs fn outside step() and returns just the events it produced. */
    capture(fn) {
      const saved = this.events;
      this.events = [];
      try {
        fn();
        return this.events;
      } finally {
        this.events = saved;
      }
    }

    vm(id) {
      return this.vms.find((v) => v.id === id) || null;
    }

    vmByName(name) {
      return this.vms.find((v) => v.name === name) || null;
    }

    requireVm(id) {
      const vm = typeof id === "string" ? this.vmByName(id) : this.vm(id);
      if (!vm) throw new HyperError(`no such VM: ${id}`);
      return vm;
    }

    // ----- VM lifecycle -----

    createVM({ name, source, vcpus = 1, memoryPages = 4, weight = 256, cap = 0 } = {}) {
      const asm = assemble(source);
      if (!asm.ok) {
        throw new HyperError(`program for ${name || "VM"} does not assemble: ${asm.errors.map((e) => `line ${e.line}: ${e.message}`).join("; ")}`, asm.errors);
      }
      const id = this.nextVmId++;
      const pages = clamp(Math.floor(memoryPages) || 4, 1, 32);
      const live = this.vms.filter((v) => this.isActive(v));
      const vm = {
        id,
        name: String(name || `vm${id}`),
        host: "host-a",
        state: "running",
        weight: clamp(Math.floor(weight) || 256, 1, 65535),
        cap: clamp(Math.floor(cap) || 0, 0, 100),
        credit: 0,
        // A newcomer starts level with the least-served VM so it can't starve anyone.
        vruntime: live.length ? Math.min(...live.map((v) => v.vruntime)) : 0,
        periodTicks: 0,
        memoryPages: pages,
        balloon: 0,
        source: String(source),
        program: asm.program,
        gpt: Array.from({ length: pages }, (_, i) => i),
        p2m: Array.from({ length: pages }, () => ({ hfn: null, state: "unbacked", swapSlot: null, lastTouch: -1 })),
        shadow: new Map(),
        console: [],
        migrated: false,
        stats: { instructions: 0, ticksRun: 0, vmmTicks: 0, exits: {}, tlbHits: 0, tlbMisses: 0, walkRefs: 0, migration: null },
        vcpus: [],
      };
      const count = clamp(Math.floor(vcpus) || 1, 1, 4);
      for (let i = 0; i < count; i++) {
        const vcpu = { vm: id, id: i, pc: 0, regs: [0, 0, 0, i], IF: 1, state: "runnable", ticksRun: 0, tlb: [], tlbClock: 0 };
        vm.vcpus.push(vcpu);
        this.runq.push(vcpu);
      }
      this.vms.push(vm);
      this.emit("vm-created", { vm: id, name: vm.name, vcpus: count, memoryPages: pages });
      return id;
    }

    isActive(vm) {
      return vm.state === "running" || vm.state === "migrating";
    }

    pauseVM(id) {
      return this.capture(() => this.setPaused(this.requireVm(id), true));
    }

    resumeVM(id) {
      return this.capture(() => this.setPaused(this.requireVm(id), false));
    }

    setPaused(vm, paused) {
      if (paused) {
        if (!this.isActive(vm)) return;
        vm.resumeState = vm.state;
        vm.state = "paused";
        vm.vcpus.forEach((v) => this.parkVcpu(v, "VM paused"));
        this.emit("vm-paused", { vm: vm.id });
      } else {
        if (vm.state !== "paused") return;
        vm.state = vm.resumeState || "running";
        vm.vcpus.forEach((v) => this.unparkVcpu(v));
        this.emit("vm-resumed", { vm: vm.id });
      }
    }

    /** Takes a vCPU off its pCPU (abandoning any exit in progress) and out of the run queue. */
    parkVcpu(vcpu, reason) {
      const pcpu = this.pcpus.find((p) => p.current === vcpu);
      if (pcpu) {
        pcpu.current = null;
        pcpu.prev = vcpu;
        pcpu.mode = "idle";
        pcpu.vmmLeft = 0;
        pcpu.exitReason = null;
        this.emit("schedule", { pcpu: pcpu.id, from: ref(vcpu), to: null, reason });
      }
      const at = this.runq.indexOf(vcpu);
      if (at >= 0) this.runq.splice(at, 1);
      if (vcpu.state === "running" || vcpu.state === "runnable") vcpu.state = "paused";
    }

    unparkVcpu(vcpu) {
      if (vcpu.state !== "paused") return;
      vcpu.state = "runnable";
      if (!this.runq.includes(vcpu)) this.runq.push(vcpu);
    }

    destroyVM(id) {
      return this.capture(() => {
        const vm = this.requireVm(id);
        vm.vcpus.forEach((v) => {
          this.parkVcpu(v, "VM destroyed");
          v.state = "halted";
        });
        for (let g = 0; g < vm.memoryPages; g++) this.releaseGpfn(vm, g);
        vm.state = "destroyed";
        this.migrationQueue = this.migrationQueue.filter((m) => m.vm !== vm.id);
        if (this.migration && this.migration.vm === vm.id) this.migration = null;
        this.emit("vm-destroyed", { vm: vm.id });
      });
    }

    // ----- host memory -----

    freeFrameIndex(exclude) {
      for (let h = 0; h < this.frames.length; h++) {
        if (this.frames[h].refCount === 0 && h !== exclude) return h;
      }
      return -1;
    }

    /** A zeroed frame for (vm, gpfn); swaps a victim out when memory is full. */
    allocFrame(vm, gpfn, exclude = -1) {
      let hfn = this.freeFrameIndex(exclude);
      if (hfn < 0) hfn = this.swapOutVictim(exclude);
      const frame = this.frames[hfn];
      frame.content.fill(0);
      frame.refCount = 1;
      frame.owners = [{ vm: vm.id, gpfn }];
      frame.cow = false;
      return hfn;
    }

    /**
     * Host swap: a clock hand sweeps frames looking for a victim, preferring
     * frames that only one guest page uses (evicting a shared frame would
     * need one swap slot per sharer).
     */
    swapOutVictim(exclude) {
      const n = this.frames.length;
      let victim = -1;
      for (let pass = 0; pass < 2 && victim < 0; pass++) {
        for (let step = 0; step < n; step++) {
          const h = (this.clockHand + step) % n;
          const f = this.frames[h];
          if (h === exclude || f.refCount === 0) continue;
          if (pass === 0 && f.refCount > 1) continue;
          victim = h;
          break;
        }
      }
      if (victim < 0) throw new HyperError("host memory exhausted: no frame can be swapped out");
      this.clockHand = (victim + 1) % n;
      const frame = this.frames[victim];
      for (const owner of frame.owners.slice()) {
        const vm = this.vm(owner.vm);
        const slot = this.nextSwapSlot++;
        this.swap.set(slot, { vm: owner.vm, gpfn: owner.gpfn, content: frame.content.slice() });
        const p = vm.p2m[owner.gpfn];
        p.hfn = null;
        p.state = "swapped";
        p.swapSlot = slot;
        this.invalidate(vm, owner.gpfn);
        this.emit("swap-out", { vm: owner.vm, gpfn: owner.gpfn, hfn: victim, slot });
      }
      Object.assign(frame, this.blankFrame());
      return victim;
    }

    /** Drops the guest page's claim on its frame or swap slot. */
    releaseGpfn(vm, gpfn) {
      const p = vm.p2m[gpfn];
      if (p.hfn !== null) {
        const frame = this.frames[p.hfn];
        frame.owners = frame.owners.filter((o) => !(o.vm === vm.id && o.gpfn === gpfn));
        frame.refCount = frame.owners.length;
        if (frame.refCount === 0) {
          Object.assign(frame, this.blankFrame());
          this.emit("free", { vm: vm.id, gpfn, hfn: p.hfn });
        } else if (frame.refCount === 1) {
          // The last sharer may write freely again.
          frame.cow = false;
          const last = frame.owners[0];
          this.vm(last.vm).p2m[last.gpfn].state = "mapped";
        }
      }
      if (p.state === "swapped") this.swap.delete(p.swapSlot);
      this.invalidate(vm, gpfn);
      p.hfn = null;
      p.swapSlot = null;
      if (p.state !== "ballooned") p.state = "unbacked";
    }

    /** TLB shootdown + shadow invalidation for every mapping of this guest page. */
    invalidate(vm, gpfn) {
      for (const vcpu of vm.vcpus) vcpu.tlb = vcpu.tlb.filter((e) => e.gpfn !== gpfn);
      vm.gpt.forEach((g, vpage) => {
        if (g === gpfn) vm.shadow.delete(vpage);
      });
    }

    /** Gives a guest page a host frame. Returns the extra exit cost (swap-in). */
    backPage(vm, gpfn) {
      const p = vm.p2m[gpfn];
      if (p.state === "mapped" || p.state === "shared") return 0;
      if (p.state === "swapped") {
        const saved = this.swap.get(p.swapSlot);
        const hfn = this.allocFrame(vm, gpfn);
        this.frames[hfn].content = saved.content.slice();
        this.swap.delete(p.swapSlot);
        p.swapSlot = null;
        p.hfn = hfn;
        p.state = "mapped";
        this.emit("swap-in", { vm: vm.id, gpfn, hfn });
        this.noteDirty(vm, gpfn);
        return this.options.exitCosts.SWAP_IN;
      }
      if (p.state === "ballooned") {
        // The guest touched a page it had given away: the balloon deflates by one.
        vm.balloon--;
        this.emit("balloon-out", { vm: vm.id, gpfn, hfn: null });
      }
      p.hfn = this.allocFrame(vm, gpfn);
      p.state = "mapped";
      this.emit("alloc", { vm: vm.id, gpfn, hfn: p.hfn });
      this.noteDirty(vm, gpfn);
      return 0;
    }

    /** Copy-on-write: give this guest page a private copy of a shared frame. */
    breakCow(vm, gpfn) {
      const p = vm.p2m[gpfn];
      const shared = this.frames[p.hfn];
      if (shared.refCount <= 1) {
        shared.cow = false;
        p.state = "mapped";
        return;
      }
      const from = p.hfn;
      const hfn = this.allocFrame(vm, gpfn, from);
      this.frames[hfn].content = this.frames[from].content.slice();
      const old = this.frames[from];
      old.owners = old.owners.filter((o) => !(o.vm === vm.id && o.gpfn === gpfn));
      old.refCount = old.owners.length;
      if (old.refCount === 1) {
        old.cow = false;
        const last = old.owners[0];
        this.vm(last.vm).p2m[last.gpfn].state = "mapped";
      }
      p.hfn = hfn;
      p.state = "mapped";
      this.invalidate(vm, gpfn);
      this.emit("cow-copy", { vm: vm.id, gpfn, hfn, from });
    }

    noteDirty(vm, gpfn) {
      const m = this.migration;
      if (m && m.vm === vm.id && m.phase === "round") m.dirtied.add(gpfn);
    }

    // ----- address translation -----

    tlbLookup(vcpu, vpage) {
      const entry = vcpu.tlb.find((e) => e.vpage === vpage);
      if (entry) entry.lastUsed = ++vcpu.tlbClock;
      return entry || null;
    }

    tlbInsert(vcpu, vpage, gpfn, hfn) {
      if (vcpu.tlb.length >= TLB_SIZE) {
        let oldest = 0;
        vcpu.tlb.forEach((e, i) => {
          if (e.lastUsed < vcpu.tlb[oldest].lastUsed) oldest = i;
        });
        vcpu.tlb.splice(oldest, 1);
      }
      vcpu.tlb.push({ vpage, gpfn, hfn, lastUsed: ++vcpu.tlbClock });
    }

    /**
     * gva → hpa. Returns { hfn, offset, gpfn } or { exit } when the VMM has to
     * step in first; the faulting instruction then re-executes after resume.
     */
    translate(pcpu, vm, vcpu, gva, write) {
      const size = this.options.pageSize;
      const vpage = Math.floor(gva / size);
      const offset = gva - vpage * size;
      if (gva < 0 || vpage >= vm.memoryPages) {
        return { exit: { reason: "GUEST_PF", detail: `address ${gva} is outside the guest's ${vm.memoryPages} pages`, after: "fault" } };
      }
      let entry = this.tlbLookup(vcpu, vpage);
      let walkRefs = 0;
      const mode = this.options.paging;
      if (!entry) {
        const gpfn = vm.gpt[vpage];
        if (gpfn === null || gpfn === undefined || gpfn < 0 || gpfn >= vm.memoryPages) {
          return { exit: { reason: "GUEST_PF", detail: `virtual page ${vpage} maps to invalid guest page ${gpfn}`, after: "fault" } };
        }
        if (mode === "shadow") {
          // Hardware walks only the shadow table; a missing entry is a hidden
          // page fault the VMM fills from the guest table + its own p2m.
          if (!vm.shadow.has(vpage)) {
            const extra = this.backPage(vm, gpfn);
            vm.shadow.set(vpage, vm.p2m[gpfn].hfn);
            return { exit: { reason: "SHADOW_PF", detail: `fill shadow entry for virtual page ${vpage} → host frame ${vm.p2m[gpfn].hfn}`, extraCost: extra } };
          }
        } else {
          const p = vm.p2m[gpfn];
          if (p.state !== "mapped" && p.state !== "shared") {
            const was = p.state;
            const extra = this.backPage(vm, gpfn);
            return {
              exit: {
                reason: "EPT_VIOLATION",
                detail: `guest page ${gpfn} was ${was}: ${was === "swapped" ? "swapped in to" : "backed by"} host frame ${p.hfn}`,
                extraCost: extra,
              },
            };
          }
        }
        const hfn = mode === "shadow" ? vm.shadow.get(vpage) : vm.p2m[gpfn].hfn;
        walkRefs = WALK_REFS[mode];
        vm.stats.tlbMisses++;
        vm.stats.walkRefs += walkRefs;
        this.tlbInsert(vcpu, vpage, gpfn, hfn);
        entry = vcpu.tlb[vcpu.tlb.length - 1];
      } else {
        vm.stats.tlbHits++;
      }
      const { gpfn, hfn } = entry;
      vm.p2m[gpfn].lastTouch = this.tick;
      if (write && this.frames[hfn].cow) {
        this.breakCow(vm, gpfn);
        return { exit: { reason: "COW", detail: `write to shared guest page ${gpfn}: copied to private host frame ${vm.p2m[gpfn].hfn}` } };
      }
      const t = { vm: vm.id, vcpu: vcpu.id, gva, vpage, gpfn, hfn, hpa: hfn * size + offset, tlb: walkRefs ? "miss" : "hit", walkRefs, mode, write: !!write };
      this.lastTranslation = { tick: this.tick, ...t };
      this.emit("translate", t);
      return { hfn, offset, gpfn };
    }

    // ----- guest execution -----

    value(vcpu, operand) {
      return operand.kind === "reg" ? vcpu.regs[operand.r] : operand.value;
    }

    address(vcpu, operand) {
      return (operand.base === null ? 0 : vcpu.regs[operand.base]) + operand.offset;
    }

    /** Executes one instruction. Returns an exit description, or null if the guest keeps running. */
    runInstruction(pcpu, vcpu, vm) {
      const ins = vm.program[vcpu.pc];
      if (!ins) {
        return { reason: "HLT", detail: "ran past the last instruction — the vCPU halts", after: "halt" };
      }
      this.emit("exec", { pcpu: pcpu.id, vm: vm.id, vcpu: vcpu.id, pc: vcpu.pc, text: ins.text, line: ins.line });
      vm.stats.instructions++;
      const a = ins.args;
      const r = vcpu.regs;
      const wrap = (x) => x | 0; // 32-bit two's complement registers
      switch (ins.op) {
        case "MOV":
          r[a[0].r] = wrap(this.value(vcpu, a[1]));
          break;
        case "ADD":
          r[a[0].r] = wrap(r[a[0].r] + this.value(vcpu, a[1]));
          break;
        case "SUB":
          r[a[0].r] = wrap(r[a[0].r] - this.value(vcpu, a[1]));
          break;
        case "MUL":
          r[a[0].r] = Math.imul(r[a[0].r], this.value(vcpu, a[1]));
          break;
        case "AND":
          r[a[0].r] = r[a[0].r] & this.value(vcpu, a[1]);
          break;
        case "XOR":
          r[a[0].r] = r[a[0].r] ^ this.value(vcpu, a[1]);
          break;
        case "INC":
          r[a[0].r] = wrap(r[a[0].r] + 1);
          break;
        case "DEC":
          r[a[0].r] = wrap(r[a[0].r] - 1);
          break;
        case "LOAD": {
          const t = this.translate(pcpu, vm, vcpu, this.address(vcpu, a[1]), false);
          if (t.exit) return t.exit;
          r[a[0].r] = this.frames[t.hfn].content[t.offset];
          break;
        }
        case "STORE": {
          const t = this.translate(pcpu, vm, vcpu, this.address(vcpu, a[1]), true);
          if (t.exit) return t.exit;
          this.frames[t.hfn].content[t.offset] = r[a[0].r];
          this.noteDirty(vm, t.gpfn);
          break;
        }
        case "JMP":
          vcpu.pc = a[0].target;
          return null;
        case "JZ":
        case "JNZ":
          if ((r[a[0].r] === 0) === (ins.op === "JZ")) {
            vcpu.pc = a[1].target;
            return null;
          }
          break;
        case "NOP":
          break;
        default:
          return this.privileged(pcpu, vcpu, vm, ins);
      }
      vcpu.pc++;
      return null;
    }

    /** Trap-and-emulate: the VMM performs the instruction's effect on the guest's behalf. */
    privileged(pcpu, vcpu, vm, ins) {
      const a = ins.args;
      vcpu.pc++;
      switch (ins.op) {
        case "OUT": {
          const port = a[0].value;
          const v = this.value(vcpu, a[1]);
          if (port === 1) {
            vm.console.push(v);
            if (vm.console.length > CONSOLE_CAP) vm.console.shift();
            this.emit("console", { vm: vm.id, vcpu: vcpu.id, value: v });
          }
          return { reason: "IO", detail: `OUT port ${port} ← ${v}${port === 1 ? " (console)" : ""}` };
        }
        case "IN": {
          const port = a[1].value;
          let v = 0;
          if (port === 2) v = this.tick;
          else if (port === 3) v = Math.floor(this.rng() * 256);
          vcpu.regs[a[0].r] = v;
          return { reason: "IO", detail: `IN port ${port} → ${v}` };
        }
        case "HLT":
          return { reason: "HLT", detail: "guest halted its vCPU", after: "halt" };
        case "CLI":
        case "STI":
          vcpu.IF = ins.op === "STI" ? 1 : 0;
          return { reason: "PRIV", detail: `${ins.op}: virtual interrupt flag = ${vcpu.IF}` };
        case "CPUID":
          vcpu.regs[a[0].r] = vcpu.id;
          return { reason: "CPUID", detail: `CPUID → vCPU ${vcpu.id}` };
        case "VMCALL": {
          const n = a[0].value;
          if (n === 1) {
            this.inflateBalloon(vm, vm.balloon + 1);
            return { reason: "HYPERCALL", detail: "VMCALL 1: guest balloon driver returns a page" };
          }
          if (n === 2) return { reason: "HYPERCALL", detail: "VMCALL 2: yield", after: "yield" };
          return { reason: "HYPERCALL", detail: `VMCALL ${n}: unknown hypercall (ignored)` };
        }
        case "PAUSE":
          return { reason: "PAUSE", detail: "spin-loop hint: give the pCPU to someone else", after: "yield" };
        case "WRPT": {
          const vpage = this.value(vcpu, a[0]);
          const gpfn = this.value(vcpu, a[1]);
          if (vpage < 0 || vpage >= vm.memoryPages) {
            return { reason: "GUEST_PF", detail: `WRPT to virtual page ${vpage} outside the address space`, after: "fault" };
          }
          vm.gpt[vpage] = gpfn;
          // The guest kernel's INVLPG / TLB shootdown that follows a PTE change.
          for (const v of vm.vcpus) v.tlb = v.tlb.filter((e) => e.vpage !== vpage);
          if (this.options.paging === "shadow") {
            vm.shadow.delete(vpage);
            return { reason: "PT_WRITE", detail: `guest PTE ${vpage} → ${gpfn}: shadow entry dropped` };
          }
          // EPT: the guest owns its page table outright — no exit at all.
          return null;
        }
        default:
          return null;
      }
    }

    // ----- scheduling -----

    capped(vm) {
      return this.options.scheduler === "credit" && vm.cap > 0 && vm.periodTicks >= (vm.cap / 100) * this.options.creditPeriod;
    }

    isRunnable(vcpu) {
      const vm = this.vm(vcpu.vm);
      return vcpu.state === "runnable" && this.isActive(vm) && !this.capped(vm);
    }

    /**
     *   round-robin — FIFO run queue, everyone gets the same quantum.
     *   credit      — Xen credit1: credits refill each period in proportion to
     *                 weight; vCPUs with credit left (UNDER) run before those
     *                 that overspent (OVER); a cap limits a VM's CPU share.
     *   fair        — CFS-like: run the VM with the least weighted virtual runtime.
     */
    pick(pcpu) {
      const candidates = this.runq.filter((v) => this.isRunnable(v));
      if (!candidates.length) return null;
      let choice = candidates[0];
      if (this.options.scheduler === "credit") {
        choice = candidates.find((v) => this.vm(v.vm).credit > 0) || candidates[0];
      } else if (this.options.scheduler === "fair") {
        for (const v of candidates) {
          if (this.vm(v.vm).vruntime < this.vm(choice.vm).vruntime) choice = v;
        }
      }
      this.runq.splice(this.runq.indexOf(choice), 1);
      choice.state = "running";
      pcpu.current = choice;
      pcpu.sliceLeft = this.options.quantum;
      const vm = this.vm(choice.vm);
      let reason = "next in the run queue";
      if (this.options.scheduler === "credit") reason = vm.credit > 0 ? `UNDER: ${Math.round(vm.credit)} credits left` : "OVER: nobody has credit left";
      if (this.options.scheduler === "fair") reason = `lowest virtual runtime (${vm.vruntime.toFixed(1)})`;
      this.emit("schedule", { pcpu: pcpu.id, from: ref(pcpu.prev), to: ref(choice), reason });
      return choice;
    }

    deschedule(pcpu, reason) {
      const vcpu = pcpu.current;
      if (!vcpu) return;
      pcpu.current = null;
      pcpu.prev = vcpu;
      pcpu.mode = "idle";
      if (vcpu.state === "running") {
        vcpu.state = "runnable";
        this.runq.push(vcpu);
      }
      this.emit("schedule", { pcpu: pcpu.id, from: ref(vcpu), to: null, reason });
    }

    /** Time on a pCPU — guest or VMM on the guest's behalf — is charged to the VM. */
    charge(vm, kind) {
      if (!vm) return;
      vm.periodTicks++;
      vm.credit -= 1;
      vm.vruntime += 1024 / vm.weight;
      if (kind === "guest") vm.stats.ticksRun++;
      else vm.stats.vmmTicks++;
    }

    refillCredits() {
      const active = this.vms.filter((vm) => this.isActive(vm) && vm.vcpus.some((v) => v.state !== "halted" && v.state !== "faulted"));
      const total = this.options.creditPeriod * this.options.pcpus;
      const sumW = active.reduce((s, vm) => s + vm.weight, 0) || 1;
      const credits = {};
      for (const vm of this.vms) vm.periodTicks = 0;
      for (const vm of active) {
        const share = (total * vm.weight) / sumW;
        // Credits don't pile up beyond one period's share (no hoarding).
        vm.credit = clamp(vm.credit + share, -share, share);
        credits[vm.id] = Math.round(vm.credit * 10) / 10;
      }
      this.emit("credit-refill", { credits });
    }

    recordTimeline(pcpu, kind, vcpu, reason = null) {
      this.timeline.push({ tick: this.tick, pcpu: pcpu.id, kind, vm: vcpu ? vcpu.vm : null, vcpu: vcpu ? vcpu.id : null, reason });
      const cap = TIMELINE_TICKS * this.pcpus.length;
      if (this.timeline.length > cap) this.timeline.splice(0, this.timeline.length - cap);
    }

    beginExit(pcpu, exit) {
      const vcpu = pcpu.current;
      const vm = this.vm(vcpu.vm);
      const cost = Math.max(1, (this.options.exitCosts[exit.reason] || 1) + (exit.extraCost || 0));
      pcpu.mode = "vmm";
      pcpu.vmmLeft = cost;
      pcpu.exitReason = exit.reason;
      pcpu.after = exit.after || "resume";
      vm.stats.exits[exit.reason] = (vm.stats.exits[exit.reason] || 0) + 1;
      this.emit("exit", { pcpu: pcpu.id, vm: vm.id, vcpu: vcpu.id, reason: exit.reason, detail: exit.detail, cost });
    }

    completeExit(pcpu) {
      const vcpu = pcpu.current;
      const after = pcpu.after;
      pcpu.exitReason = null;
      pcpu.after = null;
      pcpu.mode = "guest";
      if (!vcpu) return;
      const vm = this.vm(vcpu.vm);
      if (after === "halt" || after === "fault") {
        vcpu.state = after === "halt" ? "halted" : "faulted";
        pcpu.current = null;
        pcpu.prev = vcpu;
        pcpu.mode = "idle";
        this.emit("halt", { vm: vm.id, vcpu: vcpu.id, reason: after === "halt" ? "HLT" : "guest page fault (no fault handler)" });
        this.emit("schedule", { pcpu: pcpu.id, from: ref(vcpu), to: null, reason: after === "halt" ? "vCPU halted" : "vCPU faulted" });
        if (vm.vcpus.every((v) => v.state === "halted" || v.state === "faulted")) vm.state = "halted";
      } else if (after === "yield") {
        this.deschedule(pcpu, "guest yielded");
      } else if (after === "preempt" || pcpu.sliceLeft <= 0) {
        this.deschedule(pcpu, "quantum expired");
      } else {
        this.emit("resume", { pcpu: pcpu.id, vm: vm.id, vcpu: vcpu.id });
      }
    }

    stepPcpu(pcpu) {
      if (pcpu.mode === "vmm" && pcpu.current) {
        pcpu.vmmLeft--;
        this.charge(this.vm(pcpu.current.vm), "vmm");
        this.recordTimeline(pcpu, "vmm", pcpu.current, pcpu.exitReason);
        if (pcpu.vmmLeft <= 0) this.completeExit(pcpu);
        return;
      }
      if (pcpu.current) {
        const vm = this.vm(pcpu.current.vm);
        if (!this.isActive(vm)) this.parkVcpu(pcpu.current, "VM not running");
        else if (this.capped(vm)) this.deschedule(pcpu, `cap reached (${vm.cap}% of a pCPU)`);
      }
      if (!pcpu.current) this.pick(pcpu);
      if (!pcpu.current) {
        pcpu.mode = "idle";
        this.recordTimeline(pcpu, "idle", null);
        return;
      }
      pcpu.mode = "guest";
      const vcpu = pcpu.current;
      const vm = this.vm(vcpu.vm);
      const exit = this.runInstruction(pcpu, vcpu, vm);
      this.charge(vm, "guest");
      vcpu.ticksRun++;
      this.recordTimeline(pcpu, "guest", vcpu);
      pcpu.sliceLeft--;
      if (exit) this.beginExit(pcpu, exit);
      else if (pcpu.sliceLeft <= 0) this.beginExit(pcpu, { reason: "EXTINT", detail: "timer interrupt: quantum used up", after: "preempt" });
    }

    // ----- the clock -----

    step() {
      const events = (this.events = []);
      this.fireActions();
      if (this.options.scheduler === "credit" && this.tick % this.options.creditPeriod === 0) this.refillCredits();
      if (this.options.ksm && this.tick > 0 && this.tick % this.options.ksmInterval === 0) this.ksmScan();
      if (this.migration) this.migrationStep();
      else if (this.migrationQueue.length) this.beginMigration(this.migrationQueue.shift());
      for (const pcpu of this.pcpus) this.stepPcpu(pcpu);
      this.tick++;
      this.events = [];
      return events;
    }

    run(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const events = this.step();
        for (const e of events) out.push(e);
      }
      return out;
    }

    fireActions() {
      for (const action of this.actions) {
        if (action.fired || action.atTick !== this.tick) continue;
        action.fired = true;
        const vm = this.vmByName(action.vm);
        if (!vm) continue;
        this.emit("action", { action: { atTick: action.atTick, type: action.type, vm: action.vm, pages: action.pages } });
        if (action.type === "balloon") this.inflateBalloon(vm, action.pages || 1);
        else if (action.type === "migrate") this.queueMigration(vm, action.opts || {});
      }
    }

    setOption(key, value) {
      return this.capture(() => {
        if (key === "scheduler") {
          if (!SCHEDULERS.includes(value)) throw new HyperError(`unknown scheduler ${value}`);
          this.options.scheduler = value;
        } else if (key === "paging") {
          this.options.paging = value === "shadow" ? "shadow" : "ept";
          // Switching translation schemes throws away every cached translation.
          for (const vm of this.vms) {
            vm.shadow.clear();
            vm.vcpus.forEach((v) => (v.tlb = []));
          }
        } else if (key === "ksm") {
          this.options.ksm = !!value;
        } else if (key === "quantum" || key === "ksmInterval" || key === "creditPeriod") {
          const n = normalizeOptions({ [key]: value })[key];
          this.options[key] = n;
        } else {
          throw new HyperError(`${key} can't change while the host runs — rebuild the scenario`);
        }
        this.emit("option", { key, value: this.options[key] });
      });
    }

    // ----- page sharing (KSM) -----

    /** Merges frames with identical contents into one copy-on-write frame. */
    ksmScan() {
      const byContent = new Map();
      let merged = 0;
      this.frames.forEach((frame, hfn) => {
        if (frame.refCount === 0) return;
        const key = frame.content.join(",");
        if (!byContent.has(key)) {
          byContent.set(key, hfn);
          return;
        }
        const keep = byContent.get(key);
        const target = this.frames[keep];
        for (const owner of frame.owners) {
          const vm = this.vm(owner.vm);
          const p = vm.p2m[owner.gpfn];
          p.hfn = keep;
          p.state = "shared";
          target.owners.push(owner);
          this.invalidate(vm, owner.gpfn);
          this.emit("share", { vm: owner.vm, gpfn: owner.gpfn, hfn: keep, from: hfn });
        }
        target.refCount = target.owners.length;
        target.cow = true;
        for (const o of target.owners) this.vm(o.vm).p2m[o.gpfn].state = "shared";
        Object.assign(frame, this.blankFrame());
        merged++;
      });
      this.emit("ksm-scan", { merged, freeFrames: this.frames.filter((f) => f.refCount === 0).length });
      return merged;
    }

    // ----- ballooning -----

    setBalloon(id, pages) {
      return this.capture(() => this.inflateBalloon(this.requireVm(id), pages));
    }

    /**
     * Moves the balloon to `target` pages. Inflating asks the guest's balloon
     * driver for pages it can spare (least recently touched first) and frees
     * their host frames; deflating hands pages back, to be backed lazily.
     */
    inflateBalloon(vm, target) {
      const goal = clamp(Math.floor(target) || 0, 0, vm.memoryPages - 1);
      while (vm.balloon < goal) {
        let victim = -1;
        vm.p2m.forEach((p, g) => {
          if (p.state === "ballooned") return;
          const pick = vm.p2m[victim];
          if (victim < 0 || p.lastTouch < pick.lastTouch || (p.lastTouch === pick.lastTouch && g > victim)) victim = g;
        });
        if (victim < 0) break;
        const hfn = vm.p2m[victim].hfn;
        this.releaseGpfn(vm, victim);
        vm.p2m[victim].state = "ballooned";
        vm.balloon++;
        this.emit("balloon-in", { vm: vm.id, gpfn: victim, hfn });
      }
      while (vm.balloon > goal) {
        const g = vm.p2m.findIndex((p) => p.state === "ballooned");
        if (g < 0) break;
        vm.p2m[g].state = "unbacked";
        vm.balloon--;
        this.emit("balloon-out", { vm: vm.id, gpfn: g, hfn: null });
      }
    }

    // ----- live migration (pre-copy) -----

    startMigration(id, opts = {}) {
      return this.capture(() => this.queueMigration(this.requireVm(id), opts));
    }

    queueMigration(vm, opts) {
      if (!this.isActive(vm) || vm.host !== "host-a") throw new HyperError(`${vm.name} can't be migrated (state ${vm.state})`);
      if ((this.migration && this.migration.vm === vm.id) || this.migrationQueue.some((m) => m.vm === vm.id)) return;
      const request = {
        vm: vm.id,
        bandwidth: clamp(Number(opts.bandwidth) || 0.5, 0.05, 16),
        maxRounds: clamp(Math.floor(opts.maxRounds) || 6, 1, 30),
        stopThreshold: clamp(Math.floor(opts.stopThreshold === undefined ? 2 : opts.stopThreshold), 0, 64),
      };
      if (this.migration) {
        this.migrationQueue.push(request);
        this.emit("migration", { vm: vm.id, phase: "queued" });
      } else {
        this.beginMigration(request);
      }
    }

    beginMigration(request) {
      const vm = this.vm(request.vm);
      if (!vm || !this.isActive(vm)) return;
      const backed = vm.p2m.map((p, g) => (p.state === "mapped" || p.state === "shared" || p.state === "swapped" ? g : -1)).filter((g) => g >= 0);
      vm.state = "migrating";
      this.migration = {
        ...request,
        round: 0,
        phase: "round",
        toSend: backed,
        dirtied: new Set(),
        budget: 0,
        sent: 0,
        roundSent: 0,
        roundTicks: 0,
        ticks: 0,
        downtime: 0,
        stateSent: false,
        history: [],
      };
      this.emit("migration", { vm: vm.id, phase: "start", round: 0, pagesToSend: backed.length, bandwidth: request.bandwidth });
    }

    /** One tick of copying: the VM keeps running (and dirtying pages) until stop-and-copy. */
    migrationStep() {
      const m = this.migration;
      const vm = this.vm(m.vm);
      m.ticks++;
      m.roundTicks++;
      if (m.phase === "stop-and-copy") m.downtime++;
      m.budget += m.bandwidth;
      let sentNow = 0;
      while (m.budget >= 1 && m.toSend.length) {
        m.toSend.shift();
        m.budget -= 1;
        m.sent++;
        m.roundSent++;
        sentNow++;
      }
      if (m.toSend.length) return;
      if (m.phase === "round") {
        const dirty = [...m.dirtied].sort((x, y) => x - y);
        m.history.push({ round: m.round, pagesSent: m.roundSent, dirtied: dirty.length, ticks: m.roundTicks });
        this.emit("migration", { vm: vm.id, phase: "round", round: m.round, pagesSent: m.roundSent, dirtied: dirty.length, ticks: m.roundTicks });
        m.dirtied = new Set();
        m.toSend = dirty;
        m.roundSent = 0;
        m.roundTicks = 0;
        m.budget = 0;
        if (dirty.length <= m.stopThreshold || m.round + 1 >= m.maxRounds) {
          // Stop-and-copy: pause the guest so nothing new gets dirty.
          m.phase = "stop-and-copy";
          vm.vcpus.forEach((v) => this.parkVcpu(v, "stop-and-copy"));
          this.emit("migration", {
            vm: vm.id,
            phase: "stop-and-copy",
            round: m.round + 1,
            pages: dirty.length,
            converged: dirty.length <= m.stopThreshold,
          });
        } else {
          m.round++;
        }
        return;
      }
      // Registers, pc and device state need one more tick of the link once the
      // last dirty page is out — downtime = ⌈pages ÷ bandwidth⌉ + 1.
      if (!m.stateSent && sentNow) {
        m.stateSent = true;
        return;
      }
      for (let g = 0; g < vm.memoryPages; g++) {
        if (vm.p2m[g].state !== "ballooned") this.releaseGpfn(vm, g);
      }
      vm.host = "host-b";
      vm.state = "migrated";
      vm.migrated = true;
      vm.vcpus.forEach((v) => {
        if (v.state === "paused") v.state = "runnable";
      });
      vm.stats.migration = { rounds: m.history.length, downtime: m.downtime, pagesSent: m.sent, ticks: m.ticks, history: m.history.slice() };
      this.completedMigrations.push({ vm: vm.id, name: vm.name, ...clone(vm.stats.migration) });
      this.emit("migration", { vm: vm.id, phase: "switchover", rounds: m.history.length, pagesSent: m.sent, downtime: m.downtime, ticks: m.ticks });
      this.migration = null;
    }

    // ----- inspection -----

    /**
     * The guest's physical memory as it would read it, page by page, without
     * any translation side effects. Unbacked and ballooned pages read as null.
     */
    guestMemory(id) {
      const vm = this.requireVm(id);
      return vm.p2m.map((p) => {
        if (p.state === "mapped" || p.state === "shared") return this.frames[p.hfn].content.slice();
        if (p.state === "swapped") return this.swap.get(p.swapSlot).content.slice();
        return null;
      });
    }

    snapshot() {
      return {
        tick: this.tick,
        options: clone(this.options),
        pcpus: this.pcpus.map((p) => ({
          id: p.id,
          mode: p.mode,
          current: ref(p.current),
          sliceLeft: p.sliceLeft,
          vmmLeft: p.vmmLeft,
          exitReason: p.exitReason,
        })),
        vms: this.vms.map((vm) => ({
          id: vm.id,
          name: vm.name,
          host: vm.host,
          state: vm.state,
          weight: vm.weight,
          cap: vm.cap,
          credit: Math.round(vm.credit * 10) / 10,
          vruntime: Math.round(vm.vruntime * 10) / 10,
          memoryPages: vm.memoryPages,
          balloon: vm.balloon,
          program: vm.program.map((ins) => ({ text: ins.text, line: ins.line, privileged: ins.privileged })),
          source: vm.source,
          vcpus: vm.vcpus.map((v) => ({
            id: v.id,
            pc: v.pc,
            regs: v.regs.slice(),
            IF: v.IF,
            state: v.state,
            ticksRun: v.ticksRun,
            tlb: v.tlb.map((e) => ({ vpage: e.vpage, gpfn: e.gpfn, hfn: e.hfn })),
          })),
          gpt: vm.gpt.slice(),
          shadow: [...vm.shadow].map(([vpage, hfn]) => ({ vpage, hfn })),
          p2m: vm.p2m.map((p, gpfn) => ({ gpfn, hfn: p.hfn, state: p.state, swapSlot: p.swapSlot })),
          console: vm.console.slice(),
          stats: clone(vm.stats),
        })),
        frames: this.frames.map((f, hfn) => ({
          hfn,
          free: f.refCount === 0,
          refCount: f.refCount,
          cow: f.cow,
          owners: f.owners.map((o) => ({ ...o })),
          preview: f.content.slice(0, 4),
        })),
        swap: [...this.swap].map(([slot, s]) => ({ slot, vm: s.vm, gpfn: s.gpfn })),
        migration: this.migration
          ? {
              vm: this.migration.vm,
              round: this.migration.round,
              phase: this.migration.phase,
              toSend: this.migration.toSend.length,
              dirty: this.migration.dirtied.size,
              sent: this.migration.sent,
              ticks: this.migration.ticks,
              downtime: this.migration.downtime,
              bandwidth: this.migration.bandwidth,
              history: clone(this.migration.history),
            }
          : null,
        migrationQueue: this.migrationQueue.map((m) => m.vm),
        completedMigrations: clone(this.completedMigrations),
        timeline: this.timeline.slice(),
        lastTranslation: this.lastTranslation ? { ...this.lastTranslation } : null,
      };
    }

    /** Cross-checks every table against every other. Empty array = consistent. */
    checkInvariants() {
      const errors = [];
      const vmById = new Map(this.vms.map((v) => [v.id, v]));
      this.frames.forEach((f, hfn) => {
        if (f.refCount !== f.owners.length) errors.push(`frame ${hfn}: refCount ${f.refCount} but ${f.owners.length} owners`);
        if (f.refCount === 0 && f.cow) errors.push(`free frame ${hfn} is marked copy-on-write`);
        if (f.cow && f.refCount < 2) errors.push(`frame ${hfn} is copy-on-write with ${f.refCount} owner(s)`);
        for (const o of f.owners) {
          const vm = vmById.get(o.vm);
          const p = vm && vm.p2m[o.gpfn];
          if (!p || p.hfn !== hfn) errors.push(`frame ${hfn} lists vm ${o.vm} page ${o.gpfn}, whose p2m says ${p ? p.hfn : "missing"}`);
          else if (p.state !== (f.refCount > 1 ? "shared" : "mapped")) errors.push(`vm ${o.vm} page ${o.gpfn} state ${p.state} vs frame refCount ${f.refCount}`);
        }
      });
      for (const vm of this.vms) {
        let ballooned = 0;
        vm.p2m.forEach((p, g) => {
          if (p.state === "ballooned") ballooned++;
          if (p.state === "mapped" || p.state === "shared") {
            const f = this.frames[p.hfn];
            if (!f || !f.owners.some((o) => o.vm === vm.id && o.gpfn === g)) errors.push(`vm ${vm.id} page ${g} → frame ${p.hfn} which doesn't list it`);
          } else if (p.hfn !== null) {
            errors.push(`vm ${vm.id} page ${g} is ${p.state} but still has frame ${p.hfn}`);
          }
          if (p.state === "swapped") {
            const s = this.swap.get(p.swapSlot);
            if (!s || s.vm !== vm.id || s.gpfn !== g) errors.push(`vm ${vm.id} page ${g} swap slot ${p.swapSlot} is wrong`);
          }
        });
        if (ballooned !== vm.balloon) errors.push(`vm ${vm.id} balloon count ${vm.balloon} vs ${ballooned} ballooned pages`);
        if ((vm.state === "migrated" || vm.state === "destroyed") && vm.p2m.some((p) => p.hfn !== null)) errors.push(`vm ${vm.id} is ${vm.state} but still owns frames`);
        for (const v of vm.vcpus) {
          for (const e of v.tlb) {
            const p = vm.p2m[e.gpfn];
            if (vm.gpt[e.vpage] !== e.gpfn || !p || p.hfn !== e.hfn) errors.push(`vm ${vm.id} vCPU ${v.id} TLB entry ${e.vpage}→${e.hfn} is stale`);
          }
        }
        for (const [vpage, hfn] of vm.shadow) {
          const p = vm.p2m[vm.gpt[vpage]];
          if (!p || p.hfn !== hfn) errors.push(`vm ${vm.id} shadow entry ${vpage}→${hfn} is stale`);
        }
      }
      for (const [slot, s] of this.swap) {
        const vm = vmById.get(s.vm);
        const p = vm && vm.p2m[s.gpfn];
        if (!p || p.state !== "swapped" || p.swapSlot !== slot) errors.push(`swap slot ${slot} is orphaned`);
      }
      const seen = new Set();
      for (const p of this.pcpus) {
        if (!p.current) continue;
        const key = `${p.current.vm}:${p.current.id}`;
        if (seen.has(key)) errors.push(`vCPU ${key} is on two pCPUs`);
        seen.add(key);
        if (p.current.state !== "running") errors.push(`pCPU ${p.id} holds vCPU ${key} in state ${p.current.state}`);
        if (this.runq.includes(p.current)) errors.push(`running vCPU ${key} is also queued`);
      }
      for (const vm of this.vms) {
        for (const v of vm.vcpus) {
          if (v.state === "running" && !seen.has(`${vm.id}:${v.id}`)) errors.push(`vCPU ${vm.id}:${v.id} is "running" on no pCPU`);
        }
      }
      return errors;
    }
  }

  // ---------- Sample programs ----------
  // Memory-touching programs assume the default 16-word pages and 8 guest pages.

  const SAMPLE_PROGRAMS = {
    "cpu-bound": {
      title: "CPU-bound loop",
      description: "Pure arithmetic and one memory write per loop. Never traps by itself — only the timer interrupts it.",
      source: `; Pure computation: no privileged instructions, so the only
; VM exits are timer interrupts at the end of each quantum.
        MOV r0, 0        ; running total
        MOV r1, 1
loop:   ADD r0, r1
        MUL r1, 3
        AND r1, 0xFF
        INC r1
        STORE r0, [0]    ; keep the total in guest page 0
        JMP loop`,
    },
    "io-chatty": {
      title: "Chatty I/O",
      description: "Writes a counter to the console port every few instructions; every OUT is a VM exit.",
      source: `; Device access is privileged: each OUT traps to the hypervisor,
; which emulates the console and resumes the guest.
        MOV r0, 0
loop:   INC r0
        OUT 1, r0        ; VM exit: IO
        ADD r1, r0
        JMP loop`,
    },
    "pt-thrash": {
      title: "Page-table thrash",
      description: "A guest kernel remapping its own page table 60 times, then halting. Shadow paging traps every WRPT; EPT doesn't.",
      source: `; Like a kernel doing fork/exec or a JIT mapping fresh pages:
; it keeps rewriting its own page table entries.
        MOV r2, 60       ; iterations
loop:   MOV r0, r2
        AND r0, 1
        ADD r0, 2        ; alternate between guest pages 2 and 3
        WRPT 1, r0       ; virtual page 1 → guest page r0
        LOAD r1, [16]    ; read through the new mapping
        ADD r1, r2
        STORE r1, [16]
        DEC r2
        JNZ r2, loop
        HLT`,
    },
    "memory-hog": {
      title: "Memory hog",
      description: "Writes distinct values across all 8 of its pages, forever — nothing to share, everything stays hot.",
      source: `; Touches every page with ever-changing values, so KSM can't
; merge anything and swap has to work for every frame it takes.
        MOV r0, 0        ; address
        MOV r1, 7        ; value
loop:   STORE r1, [r0]
        ADD r1, 13
        ADD r0, 4        ; four writes per 16-word page
        MOV r2, r0
        SUB r2, 128      ; 8 pages × 16 words
        JNZ r2, loop
        MOV r0, 0
        JMP loop`,
    },
    "zero-reader": {
      title: "Zero reader",
      description: "Only reads its 8 pages, so they stay all-zero — KSM can back all of them with one shared frame.",
      source: `; Reads but never writes: every page it touches is a zero page.
        MOV r0, 0
loop:   LOAD r1, [r0]
        ADD r0, 16       ; next page
        MOV r2, r0
        SUB r2, 128
        JNZ r2, loop
        MOV r0, 0
        PAUSE            ; be polite between sweeps
        JMP loop`,
    },
    "boot-then-idle": {
      title: "Boot, then idle",
      description: "Fills 6 pages once at boot, then only uses page 0 — the cold pages are perfect for the balloon.",
      source: `; "Boot": initialise pages 0–5 with distinct values once.
        MOV r0, 0
        MOV r1, 100
boot:   STORE r1, [r0]
        INC r1
        ADD r0, 16
        MOV r2, r0
        SUB r2, 96       ; 6 pages
        JNZ r2, boot
; Steady state: a small working set on page 0, mostly idle.
idle:   LOAD r1, [0]
        INC r1
        STORE r1, [0]
        PAUSE
        JMP idle`,
    },
    idle: {
      title: "Mostly idle",
      description: "Yields with PAUSE almost every instruction — a light, latency-sensitive guest.",
      source: `; Mostly idle: PAUSE hands the pCPU back to the hypervisor.
        MOV r0, 0
loop:   INC r0
        PAUSE
        JMP loop`,
    },
    "dirty-writer": {
      title: "Dirty writer",
      description: "Rewrites every page in a tight loop — pages get dirty again faster than migration can copy them.",
      source: `; Unrolled: 8 page writes every 10 instructions — far more
; dirty pages per tick than a slow migration link can copy.
        MOV r1, 1
loop:   STORE r1, [0]
        STORE r1, [16]
        STORE r1, [32]
        STORE r1, [48]
        STORE r1, [64]
        STORE r1, [80]
        STORE r1, [96]
        STORE r1, [112]
        INC r1
        JMP loop`,
    },
    "spin-lock": {
      title: "Spin lock (2 vCPUs)",
      description: "vCPU 0 holds a lock word; vCPU 1 spins with PAUSE, so pause-loop exiting gives its pCPU away.",
      source: `; Run with 2 vCPUs. r3 starts as the vCPU index.
        CPUID r3          ; ask who we are (a VM exit too)
        JNZ r3, waiter
holder: MOV r0, 1
        STORE r0, [0]     ; take the lock
        MOV r1, 12
work:   DEC r1
        JNZ r1, work
        MOV r0, 0
        STORE r0, [0]     ; release it
        MOV r1, 12
rest:   DEC r1
        JNZ r1, rest
        JMP holder
waiter: LOAD r0, [0]
        JZ r0, got
        PAUSE             ; lock busy: spin politely
        JMP waiter
got:    OUT 1, r3         ; report a successful acquire
        JMP waiter`,
    },
    "cpuid-probe": {
      title: "CPUID & interrupts",
      description: "CPUID, CLI and STI — the classic sensitive instructions that must trap for virtualization to work.",
      source: `; Sensitive instructions (Popek–Goldberg): the hypervisor must
; trap each one so the guest only ever sees virtual state.
loop:   CPUID r0          ; VM exit: CPUID
        CLI               ; VM exit: PRIV (virtual IF = 0)
        ADD r1, r0
        INC r1
        STI               ; VM exit: PRIV (virtual IF = 1)
        OUT 1, r1         ; VM exit: IO
        JMP loop`,
    },
  };

  // ---------- Scenarios ----------

  const SCENARIOS = {
    "trap-and-emulate": {
      title: "Trap-and-emulate",
      description: "A compute VM runs untouched while an I/O-heavy VM and a CPUID prober trap on every sensitive instruction.",
      options: { pcpus: 1, scheduler: "round-robin", paging: "ept" },
      vms: [
        { name: "compute", program: "cpu-bound", memoryPages: 2 },
        { name: "chatty", program: "io-chatty", memoryPages: 2 },
        { name: "probe", program: "cpuid-probe", memoryPages: 2 },
      ],
      actions: [],
    },
    "shadow-vs-ept": {
      title: "Shadow paging vs EPT",
      description: "A guest kernel rewrites its page table. Toggle the paging mode: shadow traps every write and fills shadow entries; EPT walks longer but never exits.",
      options: { pcpus: 1, scheduler: "round-robin", paging: "shadow" },
      vms: [
        { name: "kernel", program: "pt-thrash", memoryPages: 4 },
        { name: "compute", program: "cpu-bound", memoryPages: 2 },
      ],
      actions: [],
    },
    "credit-scheduler": {
      title: "Credit scheduler",
      description: "Three identical CPU-bound VMs with weights 512 / 256 / 256 share one pCPU — watch the 2 : 1 : 1 split.",
      options: { pcpus: 1, scheduler: "credit" },
      vms: [
        { name: "gold", program: "cpu-bound", memoryPages: 1, weight: 512 },
        { name: "silver", program: "cpu-bound", memoryPages: 1, weight: 256 },
        { name: "bronze", program: "cpu-bound", memoryPages: 1, weight: 256 },
      ],
      actions: [],
    },
    "memory-overcommit": {
      title: "Memory overcommit",
      description: "24 guest pages on 12 host frames: lazy allocation, KSM merging zero pages, swap once the hog has touched everything, then a balloon reclaiming the booted VM's cold pages at tick 450.",
      options: { pcpus: 2, hostFrames: 12, ksm: true, ksmInterval: 20 },
      vms: [
        { name: "hog", program: "memory-hog", memoryPages: 8 },
        { name: "booted", program: "boot-then-idle", memoryPages: 8 },
        { name: "reader", program: "zero-reader", memoryPages: 8 },
      ],
      actions: [{ atTick: 450, type: "balloon", vm: "booted", pages: 7 }],
    },
    "live-migration": {
      title: "Live migration",
      description: "Pre-copy migration of a read-mostly VM (converges, tiny downtime) and a dirty writer (never converges, long stop-and-copy).",
      options: { pcpus: 2, scheduler: "credit" },
      vms: [
        { name: "web", program: "zero-reader", memoryPages: 8 },
        { name: "db", program: "dirty-writer", memoryPages: 8 },
      ],
      actions: [
        { atTick: 40, type: "migrate", vm: "web", opts: { bandwidth: 0.25, maxRounds: 6, stopThreshold: 2 } },
        { atTick: 41, type: "migrate", vm: "db", opts: { bandwidth: 0.25, maxRounds: 6, stopThreshold: 2 } },
      ],
    },
    "noisy-neighbour": {
      title: "Noisy neighbour",
      description: "A CPU hog capped at 30% of the pCPU next to a light I/O VM. Remove the cap (or switch to round-robin) to see the hog take more.",
      options: { pcpus: 1, scheduler: "credit" },
      vms: [
        { name: "hog", program: "cpu-bound", memoryPages: 1, weight: 256, cap: 30 },
        { name: "latency", program: "io-chatty", memoryPages: 1, weight: 256 },
      ],
      actions: [],
    },
    "spin-lock": {
      title: "Spin lock & PAUSE",
      description: "A two-vCPU guest where one vCPU spins on a lock; PAUSE exits let the hypervisor run a neighbour instead.",
      options: { pcpus: 2, scheduler: "credit" },
      vms: [
        { name: "smp", program: "spin-lock", vcpus: 2, memoryPages: 1 },
        { name: "batch", program: "cpu-bound", memoryPages: 1 },
      ],
      actions: [],
    },
  };

  /** Builds a host from a scenario; its timed actions fire inside step(). */
  function loadScenario(id, overrides = {}) {
    const scenario = SCENARIOS[id];
    if (!scenario) throw new HyperError(`unknown scenario: ${id}`);
    const hv = new Hypervisor({ ...scenario.options, ...overrides });
    for (const spec of scenario.vms) {
      const program = SAMPLE_PROGRAMS[spec.program];
      hv.createVM({
        name: spec.name,
        source: program ? program.source : spec.source,
        vcpus: spec.vcpus || 1,
        memoryPages: spec.memoryPages || 4,
        weight: spec.weight || 256,
        cap: spec.cap || 0,
      });
    }
    hv.actions = (scenario.actions || []).map((a) => ({ ...clone(a), fired: false }));
    hv.scenario = id;
    hv.events = [];
    return hv;
  }

  const api = {
    createHypervisor: (options) => new Hypervisor(options),
    Hypervisor,
    HyperError,
    assemble,
    loadScenario,
    createRng,
    ISA: Object.keys(ISA),
    PRIVILEGED: [...PRIVILEGED],
    DEFAULT_OPTIONS: clone(DEFAULT_OPTIONS),
    DEFAULT_EXIT_COSTS: { ...DEFAULT_EXIT_COSTS },
    SAMPLE_PROGRAMS,
    SCENARIOS,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HyperCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
