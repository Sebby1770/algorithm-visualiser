/* ============================================================
   Search Lab — UI
   Vanilla JS. Algorithms live in search-core.js (SearchCore).

   localStorage keys:
     theme             — shared ("dark" | "light")
     sound             — shared ("true" | "false")
     searchLabHistory  — last 8 Search Lab runs
   ============================================================ */

const ALGORITHM_IDS = ["linear", "binary", "jump", "interpolation", "exponential"];

const ALGORITHM_PROFILES = {
  linear: {
    name: "Linear Search",
    best: "O(1)",
    avg: "O(n)",
    worst: "O(n)",
    sorted: false,
    description: "Scans each element from left to right until the target is found (or the list ends).",
  },
  binary: {
    name: "Binary Search",
    best: "O(1)",
    avg: "O(log n)",
    worst: "O(log n)",
    sorted: true,
    description: "Probes the midpoint of a sorted range and discards half the remaining keys each step.",
  },
  jump: {
    name: "Jump Search",
    best: "O(1)",
    avg: "O(√n)",
    worst: "O(√n)",
    sorted: true,
    description: "Jumps ahead by √n, then linearly scans the block that may contain the target.",
  },
  interpolation: {
    name: "Interpolation Search",
    best: "O(1)",
    avg: "O(log log n)",
    worst: "O(n)",
    sorted: true,
    description: "Estimates the target index from its value — fastest on uniformly spaced sorted keys.",
  },
  exponential: {
    name: "Exponential Search",
    best: "O(1)",
    avg: "O(log n)",
    worst: "O(log n)",
    sorted: true,
    description: "Doubles a bound until the range is found, then binary-searches inside that window.",
  },
};

const LEARNING_CARDS = {
  linear: {
    trivia: "Linear search is optimal when you may only read the list once — or when n is tiny and sorting would cost more.",
    useCase: "Unsorted logs, linked lists, and the first pass before you decide to index a collection.",
  },
  binary: {
    trivia: "Binary search is the classic “20 questions” strategy: each probe halves the remaining possibilities.",
    useCase: "Dictionary lookup, bsearch in C, and finding insertion points in sorted arrays (lower_bound).",
  },
  jump: {
    trivia: "Jump search sits between linear and binary: √n jumps plus a short linear scan, and it only goes forward.",
    useCase: "Singly linked lists or tape-like storage where jumping back for a true binary probe is expensive.",
  },
  interpolation: {
    trivia: "On a uniform phone book, interpolation search opens near the right page instead of always the middle.",
    useCase: "Uniform integer keys — timestamps, dense IDs — where the value itself estimates the position.",
  },
  exponential: {
    trivia: "Exponential search finds an unbounded or unknown-size range by doubling, then finishes with binary search.",
    useCase: "Searching infinite streams, unindexed logs, or a sorted array when the target is expected near the front.",
  },
};

const NEEDS_SORTED = {
  binary: true,
  jump: true,
  interpolation: true,
  exponential: true,
};

const HISTORY_KEY = "searchLabHistory";
const MAX_HISTORY = 8;

const $ = (id) => document.getElementById(id);

const dom = {
  algorithm: $("algorithm"),
  dataset: $("dataset"),
  size: $("size"),
  sizeValue: $("sizeValue"),
  target: $("target"),
  speed: $("speed"),
  speedValue: $("speedValue"),
  raceMode: $("raceMode"),
  stepMode: $("stepMode"),
  teachingMode: $("teachingMode"),
  soundToggle: $("soundToggle"),
  themeToggle: $("themeToggle"),
  customArrayField: $("customArrayField"),
  customArray: $("customArray"),
  applyCustomBtn: $("applyCustomBtn"),
  customArrayError: $("customArrayError"),
  generateBtn: $("generateBtn"),
  startBtn: $("startBtn"),
  pauseBtn: $("pauseBtn"),
  stopBtn: $("stopBtn"),
  nextStepBtn: $("nextStepBtn"),
  resetBtn: $("resetBtn"),
  searchGrid: $("searchGrid"),
  searchGridRace: $("searchGridRace"),
  panePrimary: $("panePrimary"),
  paneSecondary: $("paneSecondary"),
  panePrimaryLabel: $("panePrimaryLabel"),
  paneSecondaryLabel: $("paneSecondaryLabel"),
  metricsPrimary: $("metricsPrimary"),
  metricsSecondary: $("metricsSecondary"),
  profilePanel: $("profilePanel"),
  historyList: $("historyList"),
  statusText: $("statusText"),
  toast: $("toast"),
  teachingPanel: $("teachingPanel"),
  teachingText: $("teachingText"),
  a11yAnnouncer: $("a11yAnnouncer"),
  shareUrlBtn: $("shareUrlBtn"),
  learningCard: $("learningCard"),
  learningTrivia: $("learningTrivia"),
  learningUseCase: $("learningUseCase"),
  sortedNote: $("sortedNote"),
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function needsSorted(id) {
  return !!NEEDS_SORTED[id];
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

class AudioManager {
  constructor() {
    this.enabled = localStorage.getItem("sound") === "true";
    this.ctx = null;
  }

  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  beep(frequency = 440, duration = 0.03, volume = 0.04) {
    if (!this.enabled) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  probe() {
    this.beep(520, 0.025, 0.035);
  }

  found() {
    this.beep(880, 0.06, 0.05);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem("sound", String(enabled));
  }
}

class SearchRunner {
  constructor({ container, metricsEl, label }) {
    this.container = container;
    this.metricsEl = metricsEl;
    this.label = label;
    this.array = [];
    this.cells = [];
    this.elim = [];
    this.lo = -1;
    this.hi = -1;
    this.probeIndex = -1;
    this.foundIndex = -1;
    this.probes = 0;
    this.elapsedMs = 0;
    this.startTime = 0;
    this.paused = false;
    this.stopped = false;
    this.stepMode = false;
    this.teachingMode = false;
    this.stepResolver = null;
    this.isRunning = false;
    this.audio = null;
    this.speedSlider = null;
    this.onNarrate = null;
  }

  configure({ audio, speedSlider, stepMode, teachingMode, onNarrate }) {
    this.audio = audio;
    this.speedSlider = speedSlider;
    this.stepMode = stepMode;
    this.teachingMode = teachingMode;
    this.onNarrate = onNarrate || null;
  }

  setArray(data) {
    this.array = data.slice();
    this.elim = new Array(this.array.length).fill(false);
    this.lo = -1;
    this.hi = -1;
    this.probeIndex = -1;
    this.foundIndex = -1;
    this.probes = 0;
    this.elapsedMs = 0;
    this.renderCells();
    this.updateMetricsDisplay();
  }

  renderCells() {
    this.container.innerHTML = "";
    this.cells = this.array.map((value, i) => {
      const cell = document.createElement("div");
      cell.className = "search-cell";
      cell.setAttribute("role", "listitem");
      cell.innerHTML = `<span class="search-cell-value">${value}</span><span class="search-cell-index">${i}</span>`;
      this.container.appendChild(cell);
      return cell;
    });
    this.paint();
  }

  paint() {
    this.cells.forEach((cell, i) => {
      cell.className = "search-cell";
      if (this.elim[i] && i !== this.foundIndex) cell.classList.add("is-elim");
      if (i === this.lo) cell.classList.add("is-lo");
      if (i === this.hi) cell.classList.add("is-hi");
      if (i === this.probeIndex) cell.classList.add("is-probe");
      if (i === this.foundIndex) cell.classList.add("is-found");
    });
  }

  setBounds(lo, hi) {
    this.lo = lo;
    this.hi = hi;
    if (lo >= 0 && hi >= 0) {
      for (let i = 0; i < this.array.length; i++) {
        if (i < lo || i > hi) this.elim[i] = true;
      }
    }
    this.paint();
  }

  narrate(message) {
    if (!this.teachingMode || !this.onNarrate) return;
    this.onNarrate(message);
  }

  updateMetricsDisplay() {
    if (!this.metricsEl) return;
    const foundLabel =
      this.foundIndex >= 0 ? String(this.foundIndex) : this.isRunning ? "…" : "—";
    this.metricsEl.innerHTML = `
      <span class="metric"><strong>${this.probes}</strong> probes</span>
      <span class="metric"><strong>${foundLabel}</strong> index</span>
      <span class="metric"><strong>${this.elapsedMs}</strong> ms</span>
    `;
  }

  tickElapsed() {
    if (this.startTime) {
      this.elapsedMs = Math.round(performance.now() - this.startTime);
      this.updateMetricsDisplay();
    }
  }

  async waitStep() {
    if (this.stopped) throw new Error("STOPPED");
    if (this.stepMode) {
      await new Promise((resolve) => {
        this.stepResolver = resolve;
      });
      if (this.stopped) throw new Error("STOPPED");
      return;
    }
    while (this.paused) {
      await new Promise((r) => setTimeout(r, 50));
      if (this.stopped) throw new Error("STOPPED");
    }
    let delay = 202 - this.speedSlider.value * 2;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      delay = 0;
    }
    await new Promise((r) => setTimeout(r, delay));
    this.tickElapsed();
  }

  resolveStep() {
    if (this.stepResolver) {
      const resolve = this.stepResolver;
      this.stepResolver = null;
      resolve();
    }
  }

  async probe(i, message) {
    this.probes++;
    this.probeIndex = i;
    this.paint();
    this.audio?.probe();
    this.updateMetricsDisplay();
    const value = this.array[i];
    this.narrate(message || `Probing index ${i} (value ${value}).`);
    await this.waitStep();
    return value;
  }

  succeed(i) {
    this.foundIndex = i;
    this.probeIndex = i;
    this.paint();
    this.audio?.found();
    this.narrate(`Found target at index ${i}.`);
    return { found: true, index: i, probes: this.probes };
  }

  fail() {
    this.probeIndex = -1;
    this.paint();
    this.narrate("Target is not in the array.");
    return { found: false, index: -1, probes: this.probes };
  }

  async run(algorithm, target) {
    this.isRunning = true;
    this.stopped = false;
    this.paused = false;
    this.probes = 0;
    this.foundIndex = -1;
    this.probeIndex = -1;
    this.lo = -1;
    this.hi = -1;
    this.elim = new Array(this.array.length).fill(false);
    this.startTime = performance.now();
    this.elapsedMs = 0;
    this.paint();
    this.updateMetricsDisplay();

    const runners = {
      linear: () => this.linearSearch(target),
      binary: () => this.binarySearch(target),
      jump: () => this.jumpSearch(target),
      interpolation: () => this.interpolationSearch(target),
      exponential: () => this.exponentialSearch(target),
    };

    let outcome = { found: false, index: -1, probes: 0 };
    try {
      outcome = await runners[algorithm]();
    } catch (err) {
      if (err.message !== "STOPPED") throw err;
    } finally {
      this.elapsedMs = Math.round(performance.now() - this.startTime);
      this.updateMetricsDisplay();
      this.isRunning = false;
    }
    return outcome;
  }

  async linearSearch(target) {
    const n = this.array.length;
    this.narrate(`Linear search: scan left to right for ${target}.`);
    for (let i = 0; i < n; i++) {
      const v = await this.probe(i, `Comparing index ${i} (${this.array[i]}) with target ${target}.`);
      if (v === target) return this.succeed(i);
      this.elim[i] = true;
      this.paint();
    }
    return this.fail();
  }

  async binarySearch(target) {
    const a = this.array;
    let lo = 0;
    let hi = a.length - 1;
    this.setBounds(lo, hi);
    this.narrate(`Binary search: looking for ${target} in a sorted array.`);
    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      this.setBounds(lo, hi);
      const v = await this.probe(mid, `Midpoint index ${mid} is ${a[mid]}. Target ${target}.`);
      if (v === target) return this.succeed(mid);
      if (v < target) {
        this.narrate(`${v} < ${target} — discard the left half.`);
        lo = mid + 1;
      } else {
        this.narrate(`${v} > ${target} — discard the right half.`);
        hi = mid - 1;
      }
      this.setBounds(lo, hi);
    }
    return this.fail();
  }

  async jumpSearch(target) {
    const a = this.array;
    const n = a.length;
    if (!n) return this.fail();
    const stepSize = Math.max(1, Math.floor(Math.sqrt(n)));
    let prev = 0;
    let step = stepSize;
    this.narrate(`Jump search: block size √n = ${stepSize}.`);

    while (prev < n && a[Math.min(step, n) - 1] < target) {
      const idx = Math.min(step, n) - 1;
      this.setBounds(prev, Math.min(step, n) - 1);
      await this.probe(idx, `Jumping to index ${idx} (${a[idx]}) — still less than ${target}.`);
      this.elim[idx] = true;
      prev = step;
      step += stepSize;
      if (prev >= n) return this.fail();
    }

    const end = Math.min(step, n);
    this.setBounds(prev, end - 1);
    this.narrate(`Linear scan inside block [${prev}…${end - 1}].`);
    for (let i = prev; i < end; i++) {
      const v = await this.probe(i, `Scanning index ${i} (${a[i]}) for ${target}.`);
      if (v === target) return this.succeed(i);
      if (v > target) {
        for (let k = i; k < n; k++) this.elim[k] = true;
        this.paint();
        break;
      }
      this.elim[i] = true;
      this.paint();
    }
    return this.fail();
  }

  async interpolationSearch(target) {
    const a = this.array;
    let lo = 0;
    let hi = a.length - 1;
    this.narrate(`Interpolation search: estimate where ${target} sits in a uniform range.`);
    while (lo <= hi && target >= a[lo] && target <= a[hi]) {
      this.setBounds(lo, hi);
      if (lo === hi) {
        const v = await this.probe(lo);
        if (v === target) return this.succeed(lo);
        return this.fail();
      }
      const span = a[hi] - a[lo];
      let pos = span === 0 ? lo : lo + Math.floor(((target - a[lo]) * (hi - lo)) / span);
      if (pos < lo) pos = lo;
      if (pos > hi) pos = hi;
      const v = await this.probe(
        pos,
        `Interpolated index ${pos} (value ${a[pos]}) from bounds [${lo}]=${a[lo]} … [${hi}]=${a[hi]}.`
      );
      if (v === target) return this.succeed(pos);
      if (v < target) lo = pos + 1;
      else hi = pos - 1;
    }
    if (lo <= hi) this.setBounds(lo, hi);
    return this.fail();
  }

  async exponentialSearch(target) {
    const a = this.array;
    const n = a.length;
    if (!n) return this.fail();
    this.narrate(`Exponential search: bound-doubling, then binary search for ${target}.`);
    const first = await this.probe(0, `Check index 0 (${a[0]}).`);
    if (first === target) return this.succeed(0);

    let bound = 1;
    while (bound < n && a[bound] < target) {
      this.setBounds(Math.floor(bound / 2), Math.min(bound, n - 1));
      await this.probe(bound, `Bound ${bound} is ${a[bound]} — still less than ${target}, double it.`);
      bound *= 2;
    }
    if (bound < n) {
      await this.probe(bound, `Bound ${bound} is ${a[bound]} — range found.`);
    }

    let lo = Math.floor(bound / 2);
    let hi = Math.min(bound, n - 1);
    this.setBounds(lo, hi);
    this.narrate(`Binary search in [${lo}…${hi}].`);
    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      this.setBounds(lo, hi);
      const v = await this.probe(mid, `Midpoint ${mid} is ${a[mid]}.`);
      if (v === target) return this.succeed(mid);
      if (v < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return this.fail();
  }
}

class SearchLabApp {
  constructor() {
    this.audio = new AudioManager();
    this.primary = new SearchRunner({
      container: dom.searchGrid,
      metricsEl: dom.metricsPrimary,
      label: "Primary",
    });
    this.secondary = new SearchRunner({
      container: dom.searchGridRace,
      metricsEl: dom.metricsSecondary,
      label: "Race",
    });
    this.baseArray = [];
    this.rawArray = [];
    this.didAutoSort = false;
    this.isRunning = false;
    this.history = this.loadHistory();
    this.toastTimer = null;
    this.keepUrlTarget = false;
  }

  init() {
    this.initTheme();
    this.initSoundToggle();
    this.loadFromUrl();
    this.bindEvents();
    this.updateProfile();
    this.updateLearningCard();
    this.updateTeachingPanel();
    this.updateCustomFieldVisibility();
    this.renderHistory();
    if (dom.dataset.value !== "custom") this.generateArray();
    else this.applyCustomArray();
    this.updateRaceVisibility();
    this.updateSortedNote();
    this.registerServiceWorker();
    this.setStatus("Ready — press S to search or G to generate");
  }

  initTheme() {
    const saved = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    dom.themeToggle.textContent = saved === "dark" ? "☀️" : "🌙";
    dom.themeToggle.setAttribute("aria-pressed", saved === "dark");
  }

  initSoundToggle() {
    dom.soundToggle.checked = this.audio.enabled;
    dom.soundToggle.setAttribute("aria-pressed", String(this.audio.enabled));
  }

  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  bindEvents() {
    dom.size.addEventListener("input", () => {
      dom.sizeValue.textContent = dom.size.value;
      if (!this.isRunning && dom.dataset.value !== "custom") this.generateArray();
    });
    dom.speed.addEventListener("input", () => {
      dom.speedValue.textContent = dom.speed.value;
    });
    dom.algorithm.addEventListener("change", () => {
      this.updateProfile();
      this.updateLearningCard();
      this.applySortedIfNeeded();
      this.syncRunners();
      this.updateSortedNote();
    });
    dom.raceMode.addEventListener("change", () => {
      this.updateRaceVisibility();
      this.applySortedIfNeeded();
      this.syncRunners();
      this.updateSortedNote();
    });
    dom.dataset.addEventListener("change", () => {
      this.updateCustomFieldVisibility();
      if (!this.isRunning && dom.dataset.value !== "custom") this.generateArray();
    });
    dom.stepMode.addEventListener("change", () => {
      dom.nextStepBtn.disabled = !dom.stepMode.checked || !this.isRunning;
    });
    dom.teachingMode.addEventListener("change", () => this.updateTeachingPanel());
    dom.learningCard.addEventListener("click", () => this.flipLearningCard());
    dom.learningCard.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        this.flipLearningCard();
      }
    });
    dom.shareUrlBtn.addEventListener("click", () => this.copyShareUrl());
    dom.applyCustomBtn.addEventListener("click", () => this.applyCustomArray());
    dom.soundToggle.addEventListener("change", () => {
      this.audio.setEnabled(dom.soundToggle.checked);
      dom.soundToggle.setAttribute("aria-pressed", String(dom.soundToggle.checked));
      if (dom.soundToggle.checked) this.audio.beep(660, 0.05, 0.06);
    });
    dom.generateBtn.addEventListener("click", () => this.generateArray());
    dom.resetBtn.addEventListener("click", () => this.generateArray());
    dom.startBtn.addEventListener("click", () => this.startSearch());
    dom.pauseBtn.addEventListener("click", () => this.togglePause());
    dom.stopBtn.addEventListener("click", () => this.stopSearch());
    dom.nextStepBtn.addEventListener("click", () => this.nextStep());
    dom.themeToggle.addEventListener("click", () => this.toggleTheme());
    document.addEventListener("keydown", (e) => this.handleKeyboard(e));
  }

  handleKeyboard(e) {
    if (e.target.matches("input, select, textarea")) return;
    switch (e.code) {
      case "Space":
        e.preventDefault();
        this.togglePause();
        break;
      case "KeyR":
      case "KeyG":
        this.generateArray();
        break;
      case "KeyS":
        this.startSearch();
        break;
      default:
        break;
    }
  }

  toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    dom.themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  }

  updateCustomFieldVisibility() {
    const custom = dom.dataset.value === "custom";
    dom.customArrayField.hidden = !custom;
    dom.size.disabled = custom || this.isRunning;
  }

  updateRaceVisibility() {
    const racing = dom.raceMode.checked;
    dom.paneSecondary.classList.toggle("hidden", !racing);
    document.body.classList.toggle("race-active", racing);
  }

  updateTeachingPanel() {
    const enabled = dom.teachingMode.checked;
    dom.teachingPanel.classList.toggle("hidden", !enabled);
    if (!enabled) {
      dom.teachingText.textContent = "Enable Teaching Mode to see step-by-step explanations.";
    }
  }

  updateProfile() {
    const profile = ALGORITHM_PROFILES[dom.algorithm.value];
    dom.profilePanel.innerHTML = `
      <h3 class="profile-name">${profile.name}</h3>
      <p class="profile-desc">${profile.description}</p>
      <dl class="profile-grid">
        <div><dt>Best</dt><dd>${profile.best}</dd></div>
        <div><dt>Average</dt><dd>${profile.avg}</dd></div>
        <div><dt>Worst</dt><dd>${profile.worst}</dd></div>
        <div><dt>Needs sorted</dt><dd>${yesNo(profile.sorted)}</dd></div>
      </dl>
    `;
    dom.panePrimaryLabel.textContent = profile.name;
  }

  updateLearningCard() {
    const card = LEARNING_CARDS[dom.algorithm.value];
    if (!card) return;
    dom.learningTrivia.textContent = card.trivia;
    dom.learningUseCase.textContent = card.useCase;
    dom.learningCard.classList.remove("flipped");
  }

  flipLearningCard() {
    dom.learningCard.classList.toggle("flipped");
  }

  currentAlgoNeedsSorted() {
    return needsSorted(dom.algorithm.value) || dom.raceMode.checked;
  }

  applySortedIfNeeded() {
    if (!this.rawArray.length) return;
    if (this.currentAlgoNeedsSorted()) {
      const sorted = this.rawArray.slice().sort((a, b) => a - b);
      this.didAutoSort = sorted.some((v, i) => v !== this.rawArray[i]);
      this.baseArray = sorted;
    } else {
      this.baseArray = this.rawArray.slice();
      this.didAutoSort = false;
    }
  }

  updateSortedNote() {
    const show = this.currentAlgoNeedsSorted();
    dom.sortedNote.hidden = !show;
    if (show) {
      const names = dom.raceMode.checked
        ? "Binary search (and the race) "
        : ALGORITHM_PROFILES[dom.algorithm.value].name + " ";
      dom.sortedNote.textContent = this.didAutoSort
        ? names + "requires a sorted array — input was sorted automatically."
        : names + "requires a sorted array. The current dataset is sorted.";
    }
  }

  generateSortedArray(size) {
    const values = new Set();
    const maxVal = Math.max(40, size * 5);
    while (values.size < size) values.add(randomInt(1, maxVal));
    return Array.from(values).sort((a, b) => a - b);
  }

  generateArray() {
    if (this.isRunning) return;
    if (dom.dataset.value === "custom") {
      this.applyCustomArray();
      return;
    }
    const size = parseInt(dom.size.value, 10);
    const arr = this.generateSortedArray(size);
    this.rawArray = arr.slice();
    this.baseArray = arr.slice();
    this.didAutoSort = false;
    if (!this.keepUrlTarget) {
      const pick = arr[Math.floor(arr.length / 2)];
      dom.target.value = String(pick);
    }
    this.keepUrlTarget = false;
    this.syncRunners();
    this.updateSortedNote();
    this.setStatus(`Generated sorted array of ${size} — target ${dom.target.value}`);
  }

  parseCustomArray(input, maxSize = 40) {
    const trimmed = input.trim();
    if (!trimmed) return { error: "Enter comma-separated values or a JSON array." };
    let values;
    try {
      if (trimmed.startsWith("[")) {
        values = JSON.parse(trimmed);
        if (!Array.isArray(values)) return { error: "JSON input must be an array." };
      } else {
        values = trimmed.split(/[,\s]+/).filter(Boolean).map(Number);
      }
    } catch {
      return { error: "Invalid JSON array format." };
    }
    if (!values.length) return { error: "Array must contain at least one number." };
    if (values.length > maxSize) return { error: `Maximum ${maxSize} elements allowed.` };
    if (values.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
      return { error: "All values must be valid numbers." };
    }
    return { data: values };
  }

  applyCustomArray() {
    if (this.isRunning) return;
    const parsed = this.parseCustomArray(dom.customArray.value);
    if (parsed.error) {
      dom.customArrayError.hidden = false;
      dom.customArrayError.textContent = parsed.error;
      this.setStatus(parsed.error);
      return;
    }
    dom.customArrayError.hidden = true;
    this.rawArray = parsed.data.slice();
    this.applySortedIfNeeded();
    this.syncRunners();
    this.updateSortedNote();
    this.setStatus(`Custom array applied (${this.baseArray.length} values)`);
  }

  syncRunners() {
    this.primary.setArray(this.baseArray);
    this.secondary.setArray(this.baseArray);
  }

  getTarget() {
    const n = Number(dom.target.value);
    return Number.isFinite(n) ? n : null;
  }

  configureRunners() {
    const common = {
      audio: this.audio,
      speedSlider: dom.speed,
      stepMode: dom.stepMode.checked,
      teachingMode: dom.teachingMode.checked,
    };
    this.primary.configure({
      ...common,
      onNarrate: (msg) => this.setTeaching(msg),
    });
    this.secondary.configure({
      ...common,
      onNarrate: (msg) => this.setTeaching("Binary: " + msg),
    });
  }

  setTeaching(msg) {
    if (dom.teachingMode.checked) {
      dom.teachingText.textContent = msg;
      this.announce(msg);
    }
  }

  setControlsDisabled(disabled) {
    ["algorithm", "dataset", "size", "target", "raceMode", "generateBtn", "startBtn", "resetBtn", "applyCustomBtn", "shareUrlBtn"].forEach(
      (id) => {
        const el = dom[id];
        if (el) el.disabled = disabled;
      }
    );
    if (!disabled) this.updateCustomFieldVisibility();
    else dom.size.disabled = true;
    dom.pauseBtn.disabled = !disabled;
    dom.stopBtn.disabled = !disabled;
    dom.nextStepBtn.disabled = !disabled || !dom.stepMode.checked;
  }

  async startSearch() {
    if (this.isRunning) return;
    const target = this.getTarget();
    if (target == null) {
      this.setStatus("Enter a numeric target value.");
      return;
    }
    if (!this.baseArray.length) {
      this.setStatus("Generate an array first.");
      return;
    }

    this.applySortedIfNeeded();
    this.syncRunners();
    this.updateSortedNote();
    this.isRunning = true;
    this.setControlsDisabled(true);
    this.configureRunners();
    this.updateProfile();

    const racing = dom.raceMode.checked;
    const algo = racing ? "linear" : dom.algorithm.value;
    if (racing) {
      dom.panePrimaryLabel.textContent = ALGORITHM_PROFILES.linear.name;
      dom.paneSecondaryLabel.textContent = ALGORITHM_PROFILES.binary.name;
    }

    const statusMsg = racing
      ? `Racing Linear Search vs Binary Search for ${target}…`
      : `Running ${ALGORITHM_PROFILES[algo].name} for ${target}…`;
    this.setStatus(statusMsg);
    this.announce(statusMsg);

    try {
      const jobs = [this.primary.run(algo, target)];
      if (racing) jobs.push(this.secondary.run("binary", target));
      const [a, b] = await Promise.all(jobs);
      if (this.primary.stopped) {
        this.setStatus("Search stopped");
        return;
      }
      this.recordOutcome(algo, target, a, racing ? b : null);
    } catch (err) {
      if (!err || err.message !== "STOPPED") this.setStatus("Search failed");
    } finally {
      this.isRunning = false;
      this.primary.paused = false;
      this.secondary.paused = false;
      this.setControlsDisabled(false);
    }
  }

  recordOutcome(algo, target, primary, secondary) {
    const pName = ALGORITHM_PROFILES[algo].name;
    let msg;
    if (secondary) {
      const a = primary.found ? `found @ ${primary.index} (${primary.probes} probes)` : `miss (${primary.probes} probes)`;
      const b = secondary.found ? `found @ ${secondary.index} (${secondary.probes} probes)` : `miss (${secondary.probes} probes)`;
      msg = `Race complete — Linear ${a}; Binary ${b}`;
    } else if (primary.found) {
      msg = `${pName} found ${target} at index ${primary.index} in ${primary.probes} probes (${this.primary.elapsedMs} ms)`;
    } else {
      msg = `${pName} did not find ${target} after ${primary.probes} probes (${this.primary.elapsedMs} ms)`;
    }
    this.setStatus(msg);
    this.announce(msg);
    this.recordRun({
      timestamp: new Date().toISOString(),
      mode: secondary ? "race" : "single",
      n: this.baseArray.length,
      target,
      primary: {
        algorithm: algo,
        name: pName,
        found: primary.found,
        index: primary.index,
        probes: primary.probes,
        elapsedMs: this.primary.elapsedMs,
      },
      secondary: secondary
        ? {
            algorithm: "binary",
            name: ALGORITHM_PROFILES.binary.name,
            found: secondary.found,
            index: secondary.index,
            probes: secondary.probes,
            elapsedMs: this.secondary.elapsedMs,
          }
        : null,
    });
  }

  togglePause() {
    if (!this.isRunning) return;
    const paused = !this.primary.paused;
    this.primary.paused = paused;
    this.secondary.paused = paused;
    dom.pauseBtn.textContent = paused ? "Resume" : "Pause";
    this.setStatus(paused ? "Paused" : "Running…");
  }

  stopSearch() {
    if (!this.isRunning) return;
    this.primary.stopped = true;
    this.secondary.stopped = true;
    this.primary.resolveStep();
    this.secondary.resolveStep();
    this.setStatus("Stopping…");
  }

  nextStep() {
    this.primary.resolveStep();
    this.secondary.resolveStep();
  }

  setStatus(text) {
    dom.statusText.textContent = text;
  }

  announce(text) {
    if (dom.a11yAnnouncer) dom.a11yAnnouncer.textContent = text;
  }

  showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => dom.toast.classList.remove("visible"), 1800);
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
    } catch {
      return [];
    }
  }

  recordRun(run) {
    this.history.unshift(run);
    this.history = this.history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    this.renderHistory();
  }

  renderHistory() {
    if (!this.history.length) {
      dom.historyList.innerHTML = `<li class="history-empty">No runs yet</li>`;
      return;
    }
    dom.historyList.innerHTML = this.history
      .map((run) => {
        const date = new Date(run.timestamp).toLocaleTimeString();
        const p = run.primary || {};
        const found = p.found ? `found @ ${p.index}` : "miss";
        const extra = run.secondary
          ? ` · vs ${run.secondary.name} ${run.secondary.found ? "found" : "miss"} (${run.secondary.probes} probes)`
          : "";
        return `<li class="history-item">
          <span class="history-primary">${p.name || "Search"} · n=${run.n} · target=${run.target}</span>
          <span class="history-meta">${date} · ${found} · ${p.probes} probes · ${p.elapsedMs} ms${extra}</span>
        </li>`;
      })
      .join("");
  }

  copyShareUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("algo", dom.algorithm.value);
    url.searchParams.set("n", String(this.baseArray.length || dom.size.value));
    url.searchParams.set("target", String(this.getTarget() ?? ""));
    const href = url.toString();
    const done = () => {
      this.showToast("Share URL copied");
      this.announce("Share URL copied.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(href).then(done).catch(() => {
        window.prompt("Copy this URL", href);
        done();
      });
    } else {
      window.prompt("Copy this URL", href);
      done();
    }
    history.replaceState(null, "", url.search);
  }

  loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("algo") && ALGORITHM_PROFILES[params.get("algo")]) {
      dom.algorithm.value = params.get("algo");
    }
    if (params.has("n")) {
      const n = parseInt(params.get("n"), 10);
      if (n >= 5 && n <= 40) {
        dom.size.value = String(n);
        dom.sizeValue.textContent = String(n);
      }
    }
    if (params.has("target") && params.get("target") !== "") {
      dom.target.value = params.get("target");
      this.keepUrlTarget = true;
    }
  }
}

const app = new SearchLabApp();
app.init();
