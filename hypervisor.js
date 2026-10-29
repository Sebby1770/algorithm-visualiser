/* ============================================================
   Hypervisor Lab — UI
   Vanilla JS. The simulator lives in hypervisor-core.js (HyperCore);
   shared chrome (theme, sound, cheat sheet, toast, storage) in
   lab-common.js. Ticks run in requestAnimationFrame batches and the
   panes redraw at most once per frame.

   localStorage keys:
     theme, sound           — shared with the other labs
     hypervisorLabHistory   — last 8 runs
     hypervisorLabPrefs     — speed + teaching mode
   ============================================================ */

const HISTORY_KEY = "hypervisorLabHistory";
const PREFS_KEY = "hypervisorLabPrefs";
const MAX_HISTORY = 8;
const TIMELINE_WINDOW = 200;
const EXIT_LOG_CAP = 80;
const VM_COLORS = 8;

const CONCEPTS = {
  popek: {
    title: "Trap-and-emulate (Popek & Goldberg)",
    trivia: "A CPU is efficiently virtualizable when every sensitive instruction is privileged — then the hypervisor can run guests directly and trap only what matters. Classic x86 broke this rule (POPF silently ignored interrupt-flag changes).",
    useCase: "That gap is why early VMware used binary translation. Intel VT-x and AMD-V (2005–06) added a guest mode so sensitive instructions trap cleanly — the basis of KVM, Xen, Hyper-V and VMware today.",
  },
  exits: {
    title: "VM exits",
    trivia: "Every exit saves the guest's state, runs hypervisor code and re-enters the guest — hundreds to thousands of cycles. Much of hypervisor tuning is about avoiding exits.",
    useCase: "KVM reports exits per reason (perf kvm stat); virtio devices, posted interrupts and pause-loop exiting all exist to cut exit rates.",
  },
  paging: {
    title: "EPT vs shadow paging",
    trivia: "Shadow paging traps guest page-table writes to keep a composed table in sync — painful for fork-heavy guests. EPT lets hardware walk both tables, at the price of longer walks on a TLB miss.",
    useCase: "Modern hypervisors use Intel EPT or AMD NPT by default; large pages shorten the two-dimensional walk, which can take 24 memory references with 4-level tables.",
  },
  tlb: {
    title: "Tagged TLBs (VPID / ASID)",
    trivia: "Tagging TLB entries with a VM id means switching VMs needn't flush the TLB, so a vCPU that comes back finds its translations still warm.",
    useCase: "Intel VPID and AMD ASID provide these tags; without them every VM switch starts with a cold TLB.",
  },
  credit: {
    title: "Proportional-share scheduling",
    trivia: "Each VM earns credits in proportion to its weight; VMs with credit left (UNDER) run before those that overspent (OVER). A cap limits a VM even when the CPU would otherwise sit idle.",
    useCase: "Xen's credit schedulers and VMware's shares / limits / reservations work this way; KVM vCPUs are Linux threads scheduled by CFS with weights.",
  },
  balloon: {
    title: "Memory ballooning",
    trivia: "A driver inside the guest “inflates” by allocating memory it promises not to use and hands those pages to the hypervisor — the guest's own memory manager chooses what to give up.",
    useCase: "VMware Tools, virtio-balloon (KVM) and Hyper-V Dynamic Memory reclaim memory this way before the host resorts to swapping.",
  },
  ksm: {
    title: "Page sharing (KSM)",
    trivia: "Identical pages — zero pages above all — are merged into one read-only copy; the first write triggers copy-on-write.",
    useCase: "Linux KSM (used by KVM) and VMware's transparent page sharing. Some clouds disable it because shared pages can leak information between VMs through timing side channels.",
  },
  migration: {
    title: "Pre-copy live migration",
    trivia: "Copy memory while the VM runs, re-copy whatever it dirtied, repeat — and pause only for the last small set. A VM that dirties memory faster than the link can carry never converges.",
    useCase: "vMotion, QEMU/KVM and Xen all use iterative pre-copy, with auto-converge (throttling the guest) or post-copy as fall-backs.",
  },
};

const SCENARIO_CONCEPT = {
  "trap-and-emulate": "popek",
  "shadow-vs-ept": "paging",
  "credit-scheduler": "credit",
  "memory-overcommit": "ksm",
  "live-migration": "migration",
  "noisy-neighbour": "credit",
  "spin-lock": "exits",
};

const EXIT_EXPLAIN = {
  IO: "device I/O is privileged, so the CPU exits to the hypervisor, which emulates the device",
  HLT: "HLT would stop a real CPU; the hypervisor parks this vCPU instead",
  PRIV: "touching the real interrupt flag would affect the host, so the VMM flips the guest's virtual IF instead",
  CPUID: "CPUID always traps under VT-x, so the hypervisor decides what CPU the guest believes it has",
  HYPERCALL: "VMCALL is a deliberate call into the hypervisor — paravirtualization",
  PAUSE: "PAUSE inside a spin loop triggers pause-loop exiting, so the hypervisor runs someone useful instead",
  PT_WRITE: "shadow paging write-protects the guest's page table, so this write traps and the VMM fixes its shadow copy — EPT would not exit here",
  SHADOW_PF: "there is no shadow entry for this page yet: a hidden page fault the VMM fills by composing the guest table with its p2m",
  EPT_VIOLATION: "the guest page has no host frame yet (or was swapped or ballooned), so the VMM backs it and re-runs the instruction",
  COW: "the page is shared by KSM, so this write gets a private copy first (copy-on-write)",
  EXTINT: "the timer fired: this vCPU's quantum is used up and the scheduler takes over",
  GUEST_PF: "the address isn't mapped and this toy guest has no fault handler, so the vCPU stops",
};

const $ = (id) => document.getElementById(id);
const esc = LabCommon.escapeHtml;

const dom = {
  scenarioSelect: $("scenarioSelect"),
  scenarioDescription: $("scenarioDescription"),
  loadScenarioBtn: $("loadScenarioBtn"),
  playBtn: $("playBtn"),
  stepBtn: $("stepBtn"),
  step10Btn: $("step10Btn"),
  resetBtn: $("resetBtn"),
  speed: $("speed"),
  speedValue: $("speedValue"),
  teachingMode: $("teachingMode"),
  scheduler: $("scheduler"),
  quantum: $("quantum"),
  quantumValue: $("quantumValue"),
  ksmToggle: $("ksmToggle"),
  pcpus: $("pcpus"),
  pcpusValue: $("pcpusValue"),
  hostFrames: $("hostFrames"),
  hostFramesValue: $("hostFramesValue"),
  addVmForm: $("addVmForm"),
  vmName: $("vmName"),
  vmProgram: $("vmProgram"),
  customSourceField: $("customSourceField"),
  vmSource: $("vmSource"),
  vmVcpus: $("vmVcpus"),
  vmPages: $("vmPages"),
  vmWeight: $("vmWeight"),
  vmCap: $("vmCap"),
  asmErrors: $("asmErrors"),
  conceptSelect: $("conceptSelect"),
  conceptTitle: $("conceptTitle"),
  learningCard: $("learningCard"),
  learningTrivia: $("learningTrivia"),
  learningUseCase: $("learningUseCase"),
  historyList: $("historyList"),
  statusText: $("statusText"),
  teachingPanel: $("teachingPanel"),
  teachingText: $("teachingText"),
  hostMetrics: $("hostMetrics"),
  timeline: $("timeline"),
  timelineReadout: $("timelineReadout"),
  timelineLegend: $("timelineLegend"),
  vmCards: $("vmCards"),
  memMeta: $("memMeta"),
  frameGrid: $("frameGrid"),
  swapArea: $("swapArea"),
  p2mView: $("p2mView"),
  xlateMeta: $("xlateMeta"),
  xlateView: $("xlateView"),
  tlbTable: $("tlbTable"),
  exitFilter: $("exitFilter"),
  exitSpark: $("exitSpark"),
  exitTotals: $("exitTotals"),
  exitLog: $("exitLog"),
  fairMeta: $("fairMeta"),
  fairView: $("fairView"),
  migMeta: $("migMeta"),
  migView: $("migView"),
  shareUrlBtn: $("shareUrlBtn"),
  soundToggle: $("soundToggle"),
  themeToggle: $("themeToggle"),
  cheatSheet: $("cheatSheet"),
  cheatSheetBtn: $("cheatSheetBtn"),
  cheatSheetClose: $("cheatSheetClose"),
  toast: $("toast"),
  a11yAnnouncer: $("a11yAnnouncer"),
};

// ---------- Helpers ----------

function vmColor(id) {
  return `var(--hv-vm-${(id - 1) % VM_COLORS})`;
}

function ticksPerSecond(speed) {
  return Math.max(1, Math.round(Number(speed) * 0.6));
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

const CUSTOM_TEMPLATE = `; Your own guest. r3 starts as the vCPU index.
; Privileged instructions (OUT, IN, HLT, CLI, STI, CPUID,
; VMCALL, PAUSE, WRPT) trap to the hypervisor.
        MOV r0, 0
loop:   INC r0
        STORE r0, [0]
        OUT 1, r0
        JMP loop`;

// ---------- Narration ----------

/** Plain-English description of one event, plus how much it matters (higher = more interesting). */
function describeEvent(ev, name) {
  switch (ev.type) {
    case "exit":
      return {
        weight: ev.reason === "EXTINT" ? 3 : 6,
        text: `${name(ev.vm)} vCPU ${ev.vcpu} → VM exit ${ev.reason}: ${EXIT_EXPLAIN[ev.reason] || "the hypervisor steps in"}. ${ev.detail ? ev.detail + ". " : ""}The pCPU spends ${plural(ev.cost, "tick")} in the VMM.`,
      };
    case "migration": {
      const vm = name(ev.vm);
      if (ev.phase === "start") return { weight: 9, text: `Live migration of ${vm} begins: round 0 copies all ${plural(ev.pagesToSend, "backed page")} while the VM keeps running (${ev.bandwidth} pages per tick).` };
      if (ev.phase === "queued") return { weight: 8, text: `${vm} waits its turn — one migration at a time over the link.` };
      if (ev.phase === "round") return { weight: 9, text: `${vm}: round ${ev.round} sent ${plural(ev.pagesSent, "page")} in ${plural(ev.ticks, "tick")}; meanwhile ${plural(ev.dirtied, "page")} got dirty again and must be re-sent.` };
      if (ev.phase === "stop-and-copy") {
        return {
          weight: 9,
          text: ev.converged
            ? `${vm} converged: only ${plural(ev.pages, "dirty page")} left, so the VM pauses briefly for stop-and-copy.`
            : `${vm} did not converge after ${plural(ev.round, "round")} — it dirties memory faster than the link copies it. Forced stop-and-copy of ${plural(ev.pages, "page")}.`,
        };
      }
      if (ev.phase === "switchover") return { weight: 9, text: `${vm} now runs on host B. Downtime: ${plural(ev.downtime, "tick")} after ${plural(ev.rounds, "round")} and ${plural(ev.pagesSent, "page")} sent. Its frames here are freed.` };
      return { weight: 5, text: `${vm}: migration ${ev.phase}.` };
    }
    case "action":
      return {
        weight: 8,
        text: ev.action.type === "balloon"
          ? `Scenario event: the hypervisor asks ${ev.action.vm}'s balloon driver for ${plural(ev.action.pages, "page")}.`
          : `Scenario event: live-migrate ${ev.action.vm} to host B.`,
      };
    case "halt":
      return { weight: 7, text: `${name(ev.vm)} vCPU ${ev.vcpu} stopped (${ev.reason}).` };
    case "ksm-scan":
      return ev.merged ? { weight: 5, text: `KSM scan merged ${plural(ev.merged, "duplicate frame")} into shared copy-on-write frames — ${plural(ev.freeFrames, "frame")} now free.` } : null;
    case "swap-out":
      return { weight: 5, text: `Host memory is full: ${name(ev.vm)}'s guest page ${ev.gpfn} (frame ${ev.hfn}) is swapped out to make room.` };
    case "swap-in":
      return { weight: 5, text: `${name(ev.vm)} touched swapped-out page ${ev.gpfn}; it comes back from swap into frame ${ev.hfn} — a slow exit.` };
    case "balloon-in":
      return { weight: 5, text: `Balloon inflates: ${name(ev.vm)} gives up guest page ${ev.gpfn}${ev.hfn === null ? " (it was never backed)" : `, freeing host frame ${ev.hfn}`}.` };
    case "balloon-out":
      return { weight: 5, text: `Balloon deflates: ${name(ev.vm)} gets guest page ${ev.gpfn} back.` };
    case "cow-copy":
      return { weight: 4, text: `Copy-on-write: ${name(ev.vm)} page ${ev.gpfn} gets a private copy in frame ${ev.hfn}.` };
    case "credit-refill":
      return { weight: 2, text: "Credit scheduler: a new accounting period — every VM's credits refill in proportion to its weight." };
    case "schedule":
      if (!ev.to) return null;
      return { weight: 2, text: `pCPU ${ev.pcpu} switches to ${name(ev.to.vm)} vCPU ${ev.to.vcpu} (${ev.reason}).` };
    case "exec":
      return { weight: 1, text: `${name(ev.vm)} vCPU ${ev.vcpu} runs “${ev.text}” directly on pCPU ${ev.pcpu} — no hypervisor involved.` };
    default:
      return null;
  }
}

// ---------- App ----------

class HypervisorLabApp {
  constructor() {
    this.audio = new LabCommon.AudioManager();
    const prefs = LabCommon.loadJSON(PREFS_KEY, {});
    this.prefs = { speed: Number(prefs.speed) || 20, teaching: prefs.teaching !== false };
    this.hv = null;
    this.scenarioId = "trap-and-emulate";
    this.playing = false;
    this.raf = null;
    this.lastFrame = 0;
    this.budget = 0;
    this.exitLog = [];
    this.exitsPerTick = [];
    this.seenReasons = new Set();
    this.cards = new Map();
    this.colors = null;
    this.stripe = null;
    this.lastNarration = 0;
    this.history = LabCommon.loadJSON(HISTORY_KEY, []);
    if (!Array.isArray(this.history)) this.history = [];
    this.cheat = null;
  }

  init() {
    LabCommon.initTheme(dom.themeToggle);
    LabCommon.initSound(dom.soundToggle, this.audio);
    this.cheat = LabCommon.initCheatSheet({ dialog: dom.cheatSheet, openBtn: dom.cheatSheetBtn, closeBtn: dom.cheatSheetClose });
    dom.speed.value = String(this.prefs.speed);
    dom.speedValue.textContent = String(ticksPerSecond(this.prefs.speed));
    dom.teachingMode.checked = this.prefs.teaching;
    this.updateTeachingPanel();
    this.populateScenarios();
    this.populatePrograms();
    this.populateConcepts();
    this.bindEvents();
    this.renderHistory();
    // Colours come from CSS variables, so re-read them whenever the theme flips.
    new MutationObserver(() => {
      this.colors = null;
      this.stripe = null;
      this.render();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", () => this.drawTimeline());
    const { id, overrides } = this.readUrl();
    this.loadScenario(id, overrides);
    LabCommon.registerServiceWorker();
  }

  savePrefs() {
    this.prefs = { speed: Number(dom.speed.value), teaching: dom.teachingMode.checked };
    LabCommon.saveJSON(PREFS_KEY, this.prefs);
  }

  populateScenarios() {
    dom.scenarioSelect.innerHTML = Object.entries(HyperCore.SCENARIOS)
      .map(([id, s]) => `<option value="${esc(id)}">${esc(s.title)}</option>`)
      .join("");
  }

  populatePrograms() {
    dom.vmProgram.innerHTML =
      Object.entries(HyperCore.SAMPLE_PROGRAMS)
        .map(([id, p]) => `<option value="${esc(id)}">${esc(p.title)}</option>`)
        .join("") + '<option value="custom">Custom program…</option>';
    dom.vmSource.value = CUSTOM_TEMPLATE;
  }

  populateConcepts() {
    dom.conceptSelect.innerHTML = Object.entries(CONCEPTS)
      .map(([id, c]) => `<option value="${id}">${esc(c.title)}</option>`)
      .join("");
  }

  showConcept(id) {
    const c = CONCEPTS[id];
    if (!c) return;
    dom.conceptSelect.value = id;
    dom.conceptTitle.textContent = c.title;
    dom.learningTrivia.textContent = c.trivia;
    dom.learningUseCase.textContent = c.useCase;
    dom.learningCard.classList.remove("flipped");
  }

  bindEvents() {
    dom.scenarioSelect.addEventListener("change", () => {
      dom.scenarioDescription.textContent = HyperCore.SCENARIOS[dom.scenarioSelect.value].description;
    });
    dom.loadScenarioBtn.addEventListener("click", () => this.loadScenario(dom.scenarioSelect.value));
    dom.playBtn.addEventListener("click", () => this.togglePlay());
    dom.stepBtn.addEventListener("click", () => this.stepTicks(1));
    dom.step10Btn.addEventListener("click", () => this.stepTicks(10));
    dom.resetBtn.addEventListener("click", () => this.loadScenario(this.scenarioId, this.liveOverrides()));
    dom.speed.addEventListener("input", () => {
      dom.speedValue.textContent = String(ticksPerSecond(dom.speed.value));
      this.savePrefs();
    });
    dom.teachingMode.addEventListener("change", () => {
      this.savePrefs();
      this.updateTeachingPanel();
    });
    dom.scheduler.addEventListener("change", () => this.setLive("scheduler", dom.scheduler.value, `Scheduler: ${dom.scheduler.selectedOptions[0].textContent}`));
    document.querySelectorAll('input[name="paging"]').forEach((radio) =>
      radio.addEventListener("change", () => {
        if (radio.checked) this.setPaging(radio.value);
      })
    );
    dom.quantum.addEventListener("input", () => {
      dom.quantumValue.textContent = dom.quantum.value;
    });
    dom.quantum.addEventListener("change", () => this.setLive("quantum", Number(dom.quantum.value), `Quantum: ${dom.quantum.value} ticks`));
    dom.ksmToggle.addEventListener("change", () => {
      this.setLive("ksm", dom.ksmToggle.checked, dom.ksmToggle.checked ? "KSM on: identical pages will be merged" : "KSM off");
      if (dom.ksmToggle.checked) this.showConcept("ksm");
    });
    const rebuild = (input, label) => {
      input.addEventListener("input", () => {
        label.textContent = input.value;
      });
      input.addEventListener("change", () => {
        this.loadScenario(this.scenarioId, this.liveOverrides());
        LabCommon.toast(dom.toast, "Host rebuilt — scenario restarted");
      });
    };
    rebuild(dom.pcpus, dom.pcpusValue);
    rebuild(dom.hostFrames, dom.hostFramesValue);
    dom.vmProgram.addEventListener("change", () => {
      dom.customSourceField.hidden = dom.vmProgram.value !== "custom";
      dom.asmErrors.hidden = true;
    });
    dom.addVmForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.addVm();
    });
    dom.vmCards.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (btn) this.vmAction(Number(btn.dataset.vm), btn.dataset.action);
    });
    dom.exitFilter.addEventListener("change", () => this.renderExits(this.hv.snapshot()));
    dom.conceptSelect.addEventListener("change", () => this.showConcept(dom.conceptSelect.value));
    dom.learningCard.addEventListener("click", () => dom.learningCard.classList.toggle("flipped"));
    dom.learningCard.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        dom.learningCard.classList.toggle("flipped");
      }
    });
    dom.shareUrlBtn.addEventListener("click", () => this.copyShareUrl());
    dom.timeline.addEventListener("mousemove", (e) => this.inspectTimeline(e));
    dom.timeline.addEventListener("mouseleave", () => {
      dom.timelineReadout.textContent = "Hover the timeline to inspect a tick.";
    });
    document.addEventListener("keydown", (e) => this.handleKeyboard(e));
  }

  handleKeyboard(e) {
    if (LabCommon.isTypingTarget(e.target)) return;
    if (LabCommon.isCheatSheetKey(e)) {
      e.preventDefault();
      this.cheat.toggle();
      return;
    }
    if (this.cheat.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Space") {
      e.preventDefault();
      this.togglePlay();
    } else if (e.code === "KeyN" || e.code === "Period") {
      this.stepTicks(1);
    } else if (e.code === "KeyR") {
      this.loadScenario(this.scenarioId, this.liveOverrides());
    } else if (e.code === "KeyP") {
      this.setPaging(this.hv.options.paging === "ept" ? "shadow" : "ept");
    }
  }

  updateTeachingPanel() {
    dom.teachingPanel.classList.toggle("hidden", !dom.teachingMode.checked);
  }

  setStatus(text) {
    dom.statusText.textContent = text;
  }

  // ----- scenario lifecycle -----

  liveOverrides() {
    return {
      pcpus: Number(dom.pcpus.value),
      hostFrames: Number(dom.hostFrames.value),
      scheduler: dom.scheduler.value,
      quantum: Number(dom.quantum.value),
      paging: document.querySelector('input[name="paging"]:checked').value,
      ksm: dom.ksmToggle.checked,
    };
  }

  loadScenario(id, overrides = {}) {
    if (!HyperCore.SCENARIOS[id]) id = "trap-and-emulate";
    this.pause();
    this.recordRun();
    this.scenarioId = id;
    this.hv = HyperCore.loadScenario(id, overrides);
    this.exitLog = [];
    this.exitsPerTick = [];
    this.seenReasons = new Set();
    this.cards.clear();
    dom.vmCards.innerHTML = "";
    this.syncControls();
    dom.scenarioSelect.value = id;
    dom.scenarioDescription.textContent = HyperCore.SCENARIOS[id].description;
    this.showConcept(SCENARIO_CONCEPT[id] || "popek");
    this.render();
    this.setStatus(`Loaded “${HyperCore.SCENARIOS[id].title}” — press Play or Step`);
    dom.teachingText.textContent = HyperCore.SCENARIOS[id].description;
  }

  syncControls() {
    const o = this.hv.options;
    dom.scheduler.value = o.scheduler;
    dom.quantum.value = String(o.quantum);
    dom.quantumValue.textContent = String(o.quantum);
    dom.ksmToggle.checked = o.ksm;
    dom.pcpus.value = String(o.pcpus);
    dom.pcpusValue.textContent = String(o.pcpus);
    dom.hostFrames.value = String(o.hostFrames);
    dom.hostFramesValue.textContent = String(o.hostFrames);
    document.querySelectorAll('input[name="paging"]').forEach((r) => {
      r.checked = r.value === o.paging;
    });
  }

  setLive(key, value, message) {
    this.hv.setOption(key, value);
    this.render();
    this.setStatus(message);
  }

  setPaging(mode) {
    this.hv.setOption("paging", mode);
    this.syncControls();
    this.showConcept("paging");
    this.render();
    const msg =
      mode === "shadow"
        ? "Shadow paging: the VMM keeps its own composed page table — every guest page-table write now traps"
        : "EPT: hardware walks the guest table and the nested table — no traps on page-table writes, longer TLB-miss walks";
    this.setStatus(msg);
    LabCommon.toast(dom.toast, mode === "shadow" ? "Shadow paging" : "EPT (nested paging)");
  }

  // ----- the clock -----

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  play() {
    if (this.playing || this.allStopped()) {
      if (this.allStopped()) this.setStatus("Every VM has stopped — load or reset a scenario, or add a VM");
      return;
    }
    this.playing = true;
    this.lastFrame = 0;
    this.budget = 0;
    dom.playBtn.textContent = "⏸ Pause";
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  pause() {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    dom.playBtn.textContent = "▶ Play";
  }

  allStopped() {
    if (!this.hv) return true;
    const snap = this.hv.snapshot();
    return !snap.migration && !snap.vms.some((v) => v.state === "running" || v.state === "migrating" || v.state === "paused");
  }

  frame(now) {
    if (!this.playing) return;
    const dt = this.lastFrame ? Math.min(250, now - this.lastFrame) : 16;
    this.lastFrame = now;
    const tps = LabCommon.prefersReducedMotion() ? 60 : ticksPerSecond(dom.speed.value);
    this.budget += (dt / 1000) * tps;
    const n = Math.min(30, Math.floor(this.budget));
    if (n > 0) {
      this.budget -= n;
      this.advance(n);
      if (this.allStopped()) {
        this.pause();
        this.setStatus("Every VM has stopped (halted, faulted or migrated away)");
        return;
      }
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  stepTicks(n) {
    this.pause();
    this.advance(n, true);
  }

  advance(n, stepping = false) {
    let best = null;
    for (let i = 0; i < n; i++) {
      const events = this.hv.step();
      const candidate = this.processEvents(events);
      if (candidate && (!best || candidate.weight >= best.weight)) best = candidate;
    }
    this.render();
    this.narrate(best, stepping);
    this.setStatus(`Tick ${this.hv.tick}${this.playing ? ` · ${ticksPerSecond(dom.speed.value)} ticks/s` : ""}`);
  }

  /** Logs exits, counts them per tick, and returns the most interesting description. */
  processEvents(events) {
    const name = (id) => this.vmName(id);
    let exits = 0;
    let best = null;
    let soundPlayed = false;
    for (const ev of events) {
      if (ev.type === "exit") {
        exits++;
        this.seenReasons.add(ev.reason);
        this.exitLog.unshift(ev);
        if (this.exitLog.length > EXIT_LOG_CAP) this.exitLog.pop();
        if (!soundPlayed && ev.reason !== "EXTINT") {
          this.audio.beep(ev.reason === "IO" ? 520 : ev.reason === "EPT_VIOLATION" || ev.reason === "SHADOW_PF" ? 340 : 680, 0.02, 0.025);
          soundPlayed = true;
        }
      }
      if (ev.type === "migration" && ev.phase === "switchover") this.audio.success();
      const d = describeEvent(ev, name);
      if (d && (!best || d.weight > best.weight)) best = d;
    }
    this.exitsPerTick.push(exits);
    if (this.exitsPerTick.length > TIMELINE_WINDOW) this.exitsPerTick.shift();
    return best;
  }

  narrate(candidate, stepping) {
    if (!candidate || !dom.teachingMode.checked) return;
    const now = performance.now();
    // While playing, hold each sentence long enough to read unless something bigger happens.
    if (!stepping && candidate.weight < 6 && now - this.lastNarration < 1400) return;
    this.lastNarration = now;
    dom.teachingText.textContent = candidate.text;
    if (stepping || candidate.weight >= 8) LabCommon.announce(dom.a11yAnnouncer, candidate.text);
  }

  vmName(id) {
    const vm = this.hv.vms.find((v) => v.id === id);
    return vm ? vm.name : `vm${id}`;
  }

  // ----- VM management -----

  addVm() {
    const programId = dom.vmProgram.value;
    const source = programId === "custom" ? dom.vmSource.value : HyperCore.SAMPLE_PROGRAMS[programId].source;
    const asm = HyperCore.assemble(source);
    if (!asm.ok) {
      dom.asmErrors.hidden = false;
      dom.asmErrors.innerHTML = asm.errors.map((e) => `<li>line ${e.line}: ${esc(e.message)}</li>`).join("");
      return;
    }
    dom.asmErrors.hidden = true;
    const name = (dom.vmName.value.trim() || "guest").slice(0, 16);
    try {
      this.hv.createVM({
        name,
        source,
        vcpus: Number(dom.vmVcpus.value),
        memoryPages: Number(dom.vmPages.value),
        weight: Number(dom.vmWeight.value),
        cap: Number(dom.vmCap.value),
      });
    } catch (err) {
      LabCommon.toast(dom.toast, err.message);
      return;
    }
    this.render();
    LabCommon.toast(dom.toast, `Added VM “${name}”`);
    this.setStatus(`Added ${name} — it joins the run queue on the next tick`);
  }

  vmAction(id, action) {
    const vm = this.hv.vms.find((v) => v.id === id);
    if (!vm) return;
    try {
      if (action === "pause") this.hv.pauseVM(id);
      else if (action === "resume") this.hv.resumeVM(id);
      else if (action === "balloon-up") this.hv.setBalloon(id, vm.balloon + 1);
      else if (action === "balloon-down") this.hv.setBalloon(id, vm.balloon - 1);
      else if (action === "migrate") {
        this.hv.startMigration(id, { bandwidth: 0.5, maxRounds: 6, stopThreshold: 2 });
        this.showConcept("migration");
      } else if (action === "destroy") this.hv.destroyVM(id);
    } catch (err) {
      LabCommon.toast(dom.toast, err.message);
      return;
    }
    if (action.startsWith("balloon")) this.showConcept("balloon");
    this.render();
    const verbs = { pause: "paused", resume: "resumed", "balloon-up": "balloon inflated by one page", "balloon-down": "balloon deflated by one page", migrate: "queued for live migration", destroy: "destroyed" };
    this.setStatus(`${vm.name} ${verbs[action]}`);
  }

  buildCard(vm) {
    const root = document.createElement("article");
    root.className = "hv-vm";
    root.style.setProperty("--vm-color", vmColor(vm.id));
    root.setAttribute("aria-label", `VM ${vm.name}`);
    root.innerHTML = `
      <header class="hv-vm-head">
        <span class="hv-vm-name">${esc(vm.name)}</span>
        <span class="hv-pill" data-role="state"></span>
        <span class="hv-pill" data-role="host"></span>
      </header>
      <div class="hv-vm-body">
        <div class="hv-sched" data-role="sched"></div>
        <div class="hv-vcpus" data-role="vcpus"></div>
        <div>
          <div class="hv-subtitle">Program — privileged instructions in colour</div>
          <ol class="hv-listing" data-role="listing">${vm.program
            .map((ins, i) => `<li class="${ins.privileged ? "is-priv" : ""}"><span class="hv-ln">${i}</span><span class="hv-marker"></span><span class="hv-src">${esc(ins.text)}</span></li>`)
            .join("")}</ol>
        </div>
        <div>
          <div class="hv-subtitle">VM exits by reason</div>
          <div class="hv-exitbars" data-role="exits"></div>
        </div>
        <div>
          <div class="hv-subtitle">Console (port 1)</div>
          <div class="hv-console" data-role="console"></div>
        </div>
      </div>
      <div class="hv-vm-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="pause" data-vm="${vm.id}">Pause</button>
        <button class="btn btn-secondary btn-sm" type="button" data-action="balloon-up" data-vm="${vm.id}" title="Inflate the balloon by one page">Balloon +</button>
        <button class="btn btn-secondary btn-sm" type="button" data-action="balloon-down" data-vm="${vm.id}" title="Deflate the balloon by one page">Balloon −</button>
        <button class="btn btn-accent btn-sm" type="button" data-action="migrate" data-vm="${vm.id}">Migrate →</button>
        <button class="btn btn-danger btn-sm" type="button" data-action="destroy" data-vm="${vm.id}">Destroy</button>
      </div>`;
    const part = (role) => root.querySelector(`[data-role="${role}"]`);
    const card = {
      root,
      state: part("state"),
      host: part("host"),
      sched: part("sched"),
      vcpus: part("vcpus"),
      listing: part("listing"),
      items: [...part("listing").children],
      exits: part("exits"),
      console: part("console"),
      buttons: [...root.querySelectorAll("button[data-action]")],
      current: [],
    };
    dom.vmCards.appendChild(root);
    this.cards.set(vm.id, card);
    return card;
  }

  updateCard(vm, snap) {
    const card = this.cards.get(vm.id) || this.buildCard(vm);
    const running = vm.state === "running" || vm.state === "migrating";
    card.state.textContent = vm.state;
    card.state.className = `hv-pill ${running ? "is-running" : vm.state === "paused" ? "is-warn" : vm.state === "halted" || vm.state === "destroyed" ? "is-bad" : ""}`;
    card.host.textContent = vm.host;
    card.root.classList.toggle("is-gone", vm.state === "migrated" || vm.state === "destroyed");
    const sched =
      snap.options.scheduler === "credit"
        ? `credit ${vm.credit}`
        : snap.options.scheduler === "fair"
        ? `vruntime ${vm.vruntime}`
        : "round-robin";
    card.sched.textContent = `weight ${vm.weight}${vm.cap ? ` · cap ${vm.cap}%` : ""} · ${sched} · ${vm.memoryPages} pages${vm.balloon ? ` · balloon ${vm.balloon}` : ""}`;
    const onCpu = new Set(snap.pcpus.filter((p) => p.current && p.current.vm === vm.id).map((p) => p.current.vcpu));
    card.vcpus.innerHTML = vm.vcpus
      .map((v) => {
        const tlb = v.tlb.map((e) => `${e.vpage}→${e.hfn}`).join(" ") || "empty";
        return `<div class="hv-vcpu${onCpu.has(v.id) ? " is-running" : ""}">
          <strong>vCPU ${v.id}</strong><span>pc ${v.pc}</span><span>r0–r3 [${v.regs.join(", ")}]</span><span>IF ${v.IF}</span>
          <span title="TLB entries: virtual page → host frame">TLB ${esc(tlb)}</span><span class="hv-vcpu-state">${v.state}</span></div>`;
      })
      .join("");
    // Move the "current instruction" markers without rebuilding the listing.
    card.current.forEach((i) => {
      if (card.items[i]) {
        card.items[i].classList.remove("is-current");
        card.items[i].querySelector(".hv-marker").textContent = "";
      }
    });
    card.current = [];
    vm.vcpus.forEach((v) => {
      const item = card.items[v.pc];
      if (!item || v.state === "halted" || v.state === "faulted") return;
      item.classList.add("is-current");
      const marker = item.querySelector(".hv-marker");
      marker.textContent = marker.textContent ? marker.textContent + "," + v.id : `▶${v.id}`;
      card.current.push(v.pc);
    });
    if (card.current.length) {
      const item = card.items[card.current[0]];
      const list = card.listing;
      if (item.offsetTop < list.scrollTop || item.offsetTop > list.scrollTop + list.clientHeight - 20) {
        list.scrollTop = item.offsetTop - list.clientHeight / 3;
      }
    }
    const exits = Object.entries(vm.stats.exits).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = exits.length ? exits[0][1] : 1;
    card.exits.innerHTML = exits.length
      ? exits
          .map(([reason, n]) => `<div class="hv-exitbar"><span class="hv-exitbar-label">${esc(reason)}</span>
            <span class="hv-exitbar-track"><span class="hv-exitbar-fill" style="width:${(n / max) * 100}%"></span></span>
            <span class="hv-exitbar-n">${n}</span></div>`)
          .join("")
      : '<span class="hv-sched">no exits yet</span>';
    card.console.textContent = vm.console.length ? vm.console.slice(-14).join("  ") : "—";
    const gone = vm.state === "migrated" || vm.state === "destroyed";
    card.buttons.forEach((btn) => {
      const action = btn.dataset.action;
      if (action === "pause" || action === "resume") {
        btn.dataset.action = vm.state === "paused" ? "resume" : "pause";
        btn.textContent = vm.state === "paused" ? "Resume" : "Pause";
        btn.disabled = gone || vm.state === "halted" || vm.state === "migrating";
      } else if (action === "migrate") {
        btn.disabled = gone || !running || vm.state === "migrating" || snap.migrationQueue.includes(vm.id);
      } else if (action === "balloon-down") {
        btn.disabled = gone || vm.balloon === 0;
      } else {
        btn.disabled = gone;
      }
    });
  }

  // ----- rendering -----

  render() {
    if (!this.hv) return;
    const snap = this.hv.snapshot();
    this.lastSnap = snap;
    snap.vms.forEach((vm) => this.updateCard(vm, snap));
    this.drawTimeline(snap);
    this.renderLegend(snap);
    this.renderHostMetrics(snap);
    this.renderMemory(snap);
    this.renderTranslation(snap);
    this.renderExits(snap);
    this.renderFairness(snap);
    this.renderMigration(snap);
  }

  palette() {
    if (this.colors) return this.colors;
    const cs = getComputedStyle(document.documentElement);
    const get = (v) => cs.getPropertyValue(v).trim();
    this.colors = {
      vms: Array.from({ length: VM_COLORS }, (_, i) => get(`--hv-vm-${i}`)),
      idle: get("--hv-idle"),
      stripe: get("--hv-vmm-stripe"),
      text: get("--text-muted"),
      grid: get("--hv-grid-line"),
      now: get("--accent"),
    };
    return this.colors;
  }

  stripePattern(ctx) {
    if (this.stripe) return this.stripe;
    const tile = document.createElement("canvas");
    tile.width = 6;
    tile.height = 6;
    const g = tile.getContext("2d");
    g.strokeStyle = this.palette().stripe;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-1, 7);
    g.lineTo(7, -1);
    g.moveTo(5, 7);
    g.lineTo(7, 5);
    g.moveTo(-1, 1);
    g.lineTo(1, -1);
    g.stroke();
    this.stripe = ctx.createPattern(tile, "repeat");
    return this.stripe;
  }

  /** One lane per pCPU: VM colour for guest time, striped for VMM time, grey for idle. */
  drawTimeline(snap = this.lastSnap) {
    if (!snap) return;
    const canvas = dom.timeline;
    const lanes = snap.pcpus.length;
    const laneH = 26;
    const gap = 6;
    const labelW = 58;
    const axisH = 18;
    const cssW = canvas.clientWidth || 600;
    const cssH = lanes * (laneH + gap) + axisH;
    canvas.style.height = `${cssH}px`;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const colors = this.palette();
    const end = snap.tick;
    const start = Math.max(0, end - TIMELINE_WINDOW);
    const colW = (cssW - labelW - 8) / TIMELINE_WINDOW;
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textBaseline = "middle";
    for (let p = 0; p < lanes; p++) {
      const y = gap / 2 + p * (laneH + gap);
      ctx.fillStyle = colors.text;
      ctx.fillText(`pCPU ${p}`, 6, y + laneH / 2);
      ctx.fillStyle = colors.idle;
      ctx.fillRect(labelW, y, colW * (end - start), laneH);
    }
    const pattern = this.stripePattern(ctx);
    for (const e of snap.timeline) {
      if (e.tick < start || e.kind === "idle") continue;
      const x = labelW + (e.tick - start) * colW;
      const y = gap / 2 + e.pcpu * (laneH + gap);
      const w = Math.max(1, colW + 0.4);
      ctx.fillStyle = colors.vms[(e.vm - 1) % VM_COLORS];
      ctx.fillRect(x, y, w, laneH);
      if (e.kind === "vmm") {
        ctx.fillStyle = pattern;
        ctx.fillRect(x, y, w, laneH);
      }
    }
    const axisY = lanes * (laneH + gap) + 4;
    ctx.fillStyle = colors.text;
    ctx.font = "500 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    for (let t = Math.ceil(start / 50) * 50; t <= end; t += 50) {
      const x = labelW + (t - start) * colW;
      ctx.fillRect(x, axisY - 4, 1, 4);
      ctx.fillText(String(t), x + 2, axisY + 6);
    }
    const nowX = labelW + (end - start) * colW;
    ctx.fillStyle = colors.now;
    ctx.fillRect(nowX, 0, 2, lanes * (laneH + gap));
    this.geom = { start, end, labelW, colW, laneH, gap, lanes };
    if (snap.tick % 20 === 0 || !canvas.getAttribute("aria-label").includes("tick")) {
      const busy = snap.timeline.filter((e) => e.tick >= start && e.kind !== "idle").length;
      const cap = Math.max(1, (end - start) * lanes);
      canvas.setAttribute("aria-label", `pCPU timeline, ticks ${start}–${end}: physical CPUs busy ${pct(busy / cap)} of the time`);
    }
  }

  inspectTimeline(e) {
    const g = this.geom;
    const snap = this.lastSnap;
    if (!g || !snap) return;
    const rect = dom.timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tick = g.start + Math.floor((x - g.labelW) / g.colW);
    const lane = Math.floor((y - g.gap / 2) / (g.laneH + g.gap));
    if (x < g.labelW || tick < g.start || tick >= g.end || lane < 0 || lane >= g.lanes) return;
    const entry = snap.timeline.find((t) => t.tick === tick && t.pcpu === lane);
    if (!entry) return;
    const who = entry.kind === "idle" ? "idle — nothing runnable" : `${this.vmName(entry.vm)} vCPU ${entry.vcpu} — ${entry.kind === "vmm" ? `hypervisor handling ${entry.reason}` : "guest code running natively"}`;
    dom.timelineReadout.textContent = `tick ${tick} · pCPU ${lane}: ${who}`;
  }

  renderLegend(snap) {
    const key = snap.vms.map((v) => v.id + v.name).join("|");
    if (key === this.legendKey) return;
    this.legendKey = key;
    dom.timelineLegend.innerHTML =
      snap.vms.map((v) => `<span class="hv-chip"><span class="hv-dot" style="--vm-color:${vmColor(v.id)}"></span>${esc(v.name)}</span>`).join("") +
      '<span class="hv-chip"><span class="hv-dot is-vmm"></span>striped = VMM handling an exit</span>' +
      '<span class="hv-chip"><span class="hv-dot is-idle"></span>idle</span>';
  }

  renderHostMetrics(snap) {
    const start = Math.max(0, snap.tick - TIMELINE_WINDOW);
    const window = snap.timeline.filter((e) => e.tick >= start);
    const cap = Math.max(1, window.length);
    const guest = window.filter((e) => e.kind === "guest").length / cap;
    const vmm = window.filter((e) => e.kind === "vmm").length / cap;
    const used = snap.frames.filter((f) => !f.free).length;
    const recent = this.exitsPerTick.reduce((a, b) => a + b, 0) / Math.max(1, this.exitsPerTick.length);
    dom.hostMetrics.innerHTML = `
      <span class="metric">tick <strong>${snap.tick}</strong></span>
      <span class="metric"><strong>${pct(guest)}</strong> guest</span>
      <span class="metric"><strong>${pct(vmm)}</strong> VMM</span>
      <span class="metric"><strong>${recent.toFixed(2)}</strong> exits/tick</span>
      <span class="metric"><strong>${used}/${snap.frames.length}</strong> frames</span>
      <span class="metric"><strong>${snap.options.paging.toUpperCase()}</strong> · ${esc(snap.options.scheduler)}</span>`;
  }

  renderMemory(snap) {
    const name = (id) => (snap.vms.find((v) => v.id === id) || { name: `vm${id}` }).name;
    dom.frameGrid.innerHTML = snap.frames
      .map((f) => {
        if (f.free) return `<div class="hv-frame" role="listitem" title="host frame ${f.hfn}: free">${f.hfn}</div>`;
        const owner = f.owners[0];
        const shared = f.refCount > 1;
        const who = f.owners.map((o) => `${name(o.vm)} page ${o.gpfn}`).join(", ");
        const title = `host frame ${f.hfn}: ${who}${f.cow ? " — shared copy-on-write" : ""}; first words [${f.preview.join(", ")}]`;
        return `<div class="hv-frame is-used${shared ? " is-shared" : ""}" role="listitem" style="--vm-color:${vmColor(owner.vm)}" title="${esc(title)}" aria-label="${esc(title)}">g${owner.gpfn}${shared ? `<span class="hv-frame-badge">×${f.refCount}</span>` : ""}</div>`;
      })
      .join("");
    dom.swapArea.innerHTML = snap.swap.length
      ? `<strong>Swap:</strong> ${snap.swap.map((s) => `<span class="hv-swap-slot" style="--vm-color:${vmColor(s.vm)}">${esc(name(s.vm))}:g${s.gpfn}</span>`).join("")}`
      : "<strong>Swap:</strong> empty";
    const stateLetter = { mapped: "", shared: "s", swapped: "S", ballooned: "B", unbacked: "·" };
    dom.p2mView.innerHTML =
      '<div class="hv-subtitle">Guest-physical pages → host frames (p2m / EPT)</div>' +
      snap.vms
        .filter((vm) => vm.state !== "destroyed")
        .map((vm) => {
          const cells =
            vm.host === "host-b"
              ? '<span class="hv-sched">running on host B</span>'
              : vm.p2m
                  .map((p) => {
                    const label = p.state === "mapped" ? p.hfn : p.state === "shared" ? `${p.hfn}s` : stateLetter[p.state];
                    return `<span class="hv-p2m-cell st-${p.state}" title="${esc(`${vm.name} guest page ${p.gpfn}: ${p.state}${p.hfn !== null ? " → frame " + p.hfn : ""}`)}">${label}</span>`;
                  })
                  .join("");
          return `<div class="hv-p2m-row" style="--vm-color:${vmColor(vm.id)}"><span class="hv-p2m-name">${esc(vm.name)}</span><span class="hv-p2m-cells">${cells}</span></div>`;
        })
        .join("");
    const used = snap.frames.filter((f) => !f.free).length;
    const saved = snap.frames.reduce((n, f) => n + Math.max(0, f.refCount - 1), 0);
    const ballooned = snap.vms.reduce((n, v) => n + v.balloon, 0);
    dom.memMeta.innerHTML = `
      <span class="metric"><strong>${used}/${snap.frames.length}</strong> frames used</span>
      <span class="metric"><strong>${saved}</strong> saved by sharing</span>
      <span class="metric"><strong>${snap.swap.length}</strong> swapped</span>
      <span class="metric"><strong>${ballooned}</strong> ballooned</span>`;
  }

  renderTranslation(snap) {
    const t = snap.lastTranslation;
    const size = snap.options.pageSize;
    if (!t) {
      dom.xlateView.innerHTML = '<p class="hv-empty">No memory access yet — LOAD and STORE instructions translate addresses.</p>';
    } else {
      const box = (label, value, sub) => `<div class="hv-xlate-box"><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
      const step = (label) => `<div class="hv-xlate-step">${label}</div>`;
      const offset = t.gva - t.vpage * size;
      const gva = box("Guest virtual", t.gva, `page ${t.vpage} + ${offset}`);
      const hpa = box("Host physical", t.hpa, `frame ${t.hfn} + ${offset}`);
      const chain =
        t.mode === "ept"
          ? gva + step("guest page table") + box("Guest physical", t.gpfn * size + offset, `page ${t.gpfn} + ${offset}`) + step("EPT (p2m)") + hpa
          : gva + step("shadow table<br />(built by the VMM)") + hpa;
      const tlb =
        t.tlb === "hit"
          ? "TLB hit — the cached translation is used, no table walk at all."
          : `TLB miss — ${plural(t.walkRefs, "memory reference")} to walk ${t.mode === "ept" ? "both tables (a two-dimensional walk; with real 4-level tables it can be 24)" : "the shadow table directly"}.`;
      const note =
        t.mode === "shadow"
          ? " The guest still keeps its own page table (virtual page → guest page), but hardware never reads it: the VMM composes it with its p2m into the shadow table and traps guest writes to stay in sync."
          : "";
      dom.xlateView.innerHTML = `${chain}<p class="hv-xlate-note"><strong>${esc(this.vmName(t.vm))} vCPU ${t.vcpu}</strong> ${t.write ? "STORE" : "LOAD"} at tick ${t.tick}. ${tlb}${note}</p>`;
    }
    const rows = snap.vms
      .filter((v) => v.stats.tlbHits + v.stats.tlbMisses > 0)
      .map((v) => {
        const s = v.stats;
        const total = s.tlbHits + s.tlbMisses;
        return `<tr><td>${esc(v.name)}</td><td>${s.tlbHits}</td><td>${s.tlbMisses}</td><td>${pct(s.tlbHits / total)}</td><td>${s.walkRefs}</td><td>${s.tlbMisses ? (s.walkRefs / s.tlbMisses).toFixed(1) : "—"}</td></tr>`;
      })
      .join("");
    dom.tlbTable.innerHTML = rows
      ? `<table class="data-table"><thead><tr><th scope="col">VM</th><th scope="col">TLB hits</th><th scope="col">misses</th><th scope="col">hit rate</th><th scope="col">walk refs</th><th scope="col">refs / miss</th></tr></thead><tbody>${rows}</tbody></table>`
      : "";
    dom.xlateMeta.innerHTML = `<span class="metric"><strong>${snap.options.paging === "ept" ? "EPT" : "Shadow"}</strong> · ${snap.options.paging === "ept" ? "3" : "1"} refs per TLB miss</span>`;
  }

  renderExits(snap) {
    if (dom.exitFilter.options.length - 1 !== this.seenReasons.size) {
      const current = dom.exitFilter.value;
      dom.exitFilter.innerHTML = '<option value="">All reasons</option>' + [...this.seenReasons].sort().map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
      dom.exitFilter.value = current;
    }
    const totals = {};
    snap.vms.forEach((v) => Object.entries(v.stats.exits).forEach(([r, n]) => (totals[r] = (totals[r] || 0) + n)));
    dom.exitTotals.innerHTML = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `<span class="hv-pill" title="${esc(EXIT_EXPLAIN[r] || "")}">${esc(r)} ${n}</span>`)
      .join("");
    const filter = dom.exitFilter.value;
    const shown = this.exitLog.filter((e) => !filter || e.reason === filter).slice(0, 40);
    dom.exitLog.innerHTML = shown.length
      ? shown
          .map((e) => `<li style="--vm-color:${vmColor(e.vm)}"><span>t${e.tick}</span><span class="hv-exit-vm">${esc(this.vmName(e.vm))}</span><span class="hv-exit-reason">${esc(e.reason)} · ${e.cost}t</span><span class="hv-exit-detail" title="${esc(e.detail || "")}">${esc(e.detail || "")}</span></li>`)
          .join("")
      : '<li class="hv-empty">No exits yet.</li>';
    const buckets = [];
    for (let i = 0; i < this.exitsPerTick.length; i += 10) buckets.push(this.exitsPerTick.slice(i, i + 10).reduce((a, b) => a + b, 0));
    if (buckets.length > 1) {
      const max = Math.max(1, ...buckets);
      const pts = buckets.map((v, i) => `${(i / (buckets.length - 1)) * 200},${34 - (v / max) * 30}`).join(" ");
      dom.exitSpark.innerHTML = `<polyline points="${pts}" />`;
    } else {
      dom.exitSpark.innerHTML = "";
    }
  }

  renderFairness(snap) {
    const window = Math.min(TIMELINE_WINDOW, snap.tick);
    if (!window) {
      dom.fairView.innerHTML = '<p class="hv-empty">Run a few ticks to compare CPU shares.</p>';
      dom.fairMeta.innerHTML = "";
      return;
    }
    const start = snap.tick - window;
    const capacity = window * snap.pcpus.length;
    const used = new Map();
    let idle = 0;
    for (const e of snap.timeline) {
      if (e.tick < start) continue;
      if (e.kind === "idle") idle++;
      else used.set(e.vm, (used.get(e.vm) || 0) + 1);
    }
    const active = snap.vms.filter((v) => v.state === "running" || v.state === "migrating");
    const sumW = active.reduce((n, v) => n + v.weight, 0) || 1;
    const rr = snap.options.scheduler === "round-robin";
    const rows = snap.vms
      .filter((v) => v.host === "host-a" && v.state !== "destroyed")
      .map((v) => {
        const share = (used.get(v.id) || 0) / capacity;
        const isActive = active.includes(v);
        const fairShare = rr ? 1 / Math.max(1, active.length) : v.weight / sumW;
        const entitled = isActive ? Math.min(fairShare, v.vcpus.length / snap.pcpus.length) : 0;
        const capLine = v.cap && snap.options.scheduler === "credit" ? v.cap / 100 / snap.pcpus.length : null;
        return `<div class="hv-fair-row" style="--vm-color:${vmColor(v.id)}">
          <span class="hv-fair-name">${esc(v.name)}</span>
          <span class="hv-fair-track" role="img" aria-label="${esc(`${v.name}: ${pct(share)} of host CPU, entitled to ${pct(entitled)}`)}">
            <span class="hv-fair-fill" style="width:${Math.min(100, share * 100)}%; display:block"></span>
            ${isActive ? `<span class="hv-fair-mark" style="left:${Math.min(100, entitled * 100)}%" title="entitlement"></span>` : ""}
            ${capLine !== null ? `<span class="hv-fair-cap" style="left:${Math.min(100, capLine * 100)}%" title="cap"></span>` : ""}
          </span>
          <span class="hv-fair-num">${pct(share)} / ${isActive ? pct(entitled) : "—"}</span>
        </div>`;
      })
      .join("");
    const note = rr
      ? '<p class="hv-note">Round-robin ignores weights: every runnable vCPU takes equal turns. Bars show actual share; the tick mark is an equal split.</p>'
      : '<p class="hv-note">Bar = actual share of all host CPU over the last ticks (guest + VMM time). Black mark = weight-based entitlement; red mark = cap.</p>';
    dom.fairView.innerHTML = rows + note;
    dom.fairMeta.innerHTML = `<span class="metric">last <strong>${window}</strong> ticks</span><span class="metric"><strong>${pct(idle / capacity)}</strong> idle</span>`;
  }

  renderMigration(snap) {
    const m = snap.migration;
    const name = (id) => this.vmName(id);
    let live;
    if (m) {
      const all = m.history.concat([{ round: m.round, pagesSent: null, dirtied: m.dirty, current: true }]);
      const max = Math.max(1, ...m.history.map((r) => Math.max(r.pagesSent, r.dirtied)), m.dirty, m.toSend);
      const bars = all
        .map((r) => {
          const sent = r.current ? m.toSend : r.pagesSent;
          return `<div class="hv-mig-round"><div class="hv-mig-bars">
              <span class="hv-mig-bar" style="height:${(sent / max) * 80}px" title="${r.current ? "still to send" : "sent"}: ${sent}"></span>
              <span class="hv-mig-bar is-dirty" style="height:${(r.dirtied / max) * 80}px" title="dirtied: ${r.dirtied}"></span>
            </div>${r.current ? "now" : "R" + r.round}</div>`;
        })
        .join("");
      live = `<div class="hv-mig-live">
          <p class="hv-note"><strong>${esc(name(m.vm))}</strong> · ${m.phase === "stop-and-copy" ? "stop-and-copy (VM paused)" : `pre-copy round ${m.round}`} · ${m.toSend} pages to send · ${m.dirty} dirtied this round · ${m.sent} sent in ${m.ticks} ticks · link ${m.bandwidth} pages/tick${m.phase === "stop-and-copy" ? ` · downtime so far ${m.downtime}` : ""}</p>
          <div class="hv-mig-rounds" role="img" aria-label="Pages sent (blue) and dirtied (orange) per round">${bars}</div>
          <p class="hv-note">Blue = pages sent in the round (or still to send now) · orange = pages the guest dirtied meanwhile.</p>
        </div>`;
    } else {
      live = `<div class="hv-mig-live"><p class="hv-empty">No migration running. Press “Migrate →” on a VM card, or load the Live migration scenario.</p>${
        snap.migrationQueue.length ? `<p class="hv-note">Queued: ${snap.migrationQueue.map((id) => esc(name(id))).join(", ")}</p>` : ""
      }</div>`;
    }
    const done = snap.completedMigrations;
    const hostB = `<div class="hv-mig-hostb"><div class="hv-subtitle">Host B</div>${
      done.length
        ? `<ul class="hv-mig-list">${done
            .map((d) => `<li style="--vm-color:${vmColor(d.vm)}"><strong>${esc(d.name)}</strong> — ${plural(d.rounds, "round")}, ${plural(d.pagesSent, "page")} sent, downtime <strong>${plural(d.downtime, "tick")}</strong>${d.rounds && d.history[d.history.length - 1].dirtied > 2 ? " (did not converge)" : ""}</li>`)
            .join("")}</ul>`
        : '<p class="hv-empty">Empty — migrated VMs land here.</p>'
    }</div>`;
    dom.migView.innerHTML = live + hostB;
    dom.migMeta.innerHTML = m ? `<span class="metric">phase <strong>${esc(m.phase)}</strong></span>` : `<span class="metric"><strong>${done.length}</strong> completed</span>`;
  }

  // ----- sharing & history -----

  readUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("scenario");
    const overrides = {};
    if (params.get("paging") === "ept" || params.get("paging") === "shadow") overrides.paging = params.get("paging");
    if (["round-robin", "credit", "fair"].includes(params.get("scheduler"))) overrides.scheduler = params.get("scheduler");
    const pcpus = parseInt(params.get("pcpus"), 10);
    if (pcpus >= 1 && pcpus <= 4) overrides.pcpus = pcpus;
    return { id: id && HyperCore.SCENARIOS[id] ? id : "trap-and-emulate", overrides };
  }

  copyShareUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("scenario", this.scenarioId);
    url.searchParams.set("paging", this.hv.options.paging);
    url.searchParams.set("scheduler", this.hv.options.scheduler);
    url.searchParams.set("pcpus", String(this.hv.options.pcpus));
    LabCommon.copyText(url.toString()).then(() => LabCommon.toast(dom.toast, "Share URL copied"));
    history.replaceState(null, "", url.search);
  }

  recordRun() {
    if (!this.hv || this.hv.tick === 0) return;
    const snap = this.hv.snapshot();
    const totals = {};
    snap.vms.forEach((v) => Object.entries(v.stats.exits).forEach(([r, n]) => (totals[r] = (totals[r] || 0) + n)));
    const exits = Object.values(totals).reduce((a, b) => a + b, 0);
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    const capacity = snap.tick * snap.pcpus.length;
    const shares = snap.vms
      .map((v) => `${v.name} ${pct((v.stats.ticksRun + v.stats.vmmTicks) / capacity)}`)
      .slice(0, 4)
      .join(", ");
    this.history.unshift({
      timestamp: new Date().toISOString(),
      scenario: HyperCore.SCENARIOS[this.scenarioId].title,
      ticks: snap.tick,
      exits,
      top: top ? `${top[0]} ×${top[1]}` : "none",
      shares,
      paging: snap.options.paging,
      scheduler: snap.options.scheduler,
    });
    this.history = this.history.slice(0, MAX_HISTORY);
    LabCommon.saveJSON(HISTORY_KEY, this.history);
    this.renderHistory();
  }

  renderHistory() {
    if (!this.history.length) {
      dom.historyList.innerHTML = '<li class="history-empty">No runs yet — history is saved when you reset or switch scenarios</li>';
      return;
    }
    dom.historyList.innerHTML = this.history
      .map((h) => `<li class="history-item">
          <span class="history-primary">${esc(h.scenario)} · ${esc(h.paging)} · ${esc(h.scheduler)}</span>
          <span class="history-meta">${esc(new Date(h.timestamp).toLocaleTimeString())} · ${h.ticks} ticks · ${h.exits} exits (top ${esc(h.top)}) · ${esc(h.shares)}</span>
        </li>`)
      .join("");
  }
}

const app = new HypervisorLabApp();
app.init();
