/* ============================================================
   Sorting Algorithm Lab v6
   Vanilla JS — no frameworks
   Algorithm step logic lives in sorting-core.js (SortCore);
   this file drives the visuals, metrics, and app chrome.
   ============================================================ */

const ALGORITHM_IDS = [
  "bubble", "selection", "insertion", "merge", "quick", "heap", "shell", "radix",
  "counting", "cocktail", "comb", "gnome", "cycle", "tim",
];

// ---------- Algorithm metadata ----------
const ALGORITHM_PROFILES = {
  bubble: {
    name: "Bubble Sort",
    best: "O(n)",
    avg: "O(n²)",
    worst: "O(n²)",
    stable: true,
    inPlace: true,
    memory: "O(1)",
    description: "Repeatedly swaps adjacent out-of-order pairs until sorted.",
  },
  selection: {
    name: "Selection Sort",
    best: "O(n²)",
    avg: "O(n²)",
    worst: "O(n²)",
    stable: false,
    inPlace: true,
    memory: "O(1)",
    description: "Finds the minimum in the unsorted region and swaps it to the front.",
  },
  insertion: {
    name: "Insertion Sort",
    best: "O(n)",
    avg: "O(n²)",
    worst: "O(n²)",
    stable: true,
    inPlace: true,
    memory: "O(1)",
    description: "Builds a sorted prefix by inserting each element into place.",
  },
  merge: {
    name: "Merge Sort",
    best: "O(n log n)",
    avg: "O(n log n)",
    worst: "O(n log n)",
    stable: true,
    inPlace: false,
    memory: "O(n)",
    description: "Divide-and-conquer merge of sorted halves using auxiliary storage.",
  },
  quick: {
    name: "Quick Sort",
    best: "O(n log n)",
    avg: "O(n log n)",
    worst: "O(n²)",
    stable: false,
    inPlace: true,
    memory: "O(log n)",
    description: "Partitions around a pivot, then recursively sorts sub-arrays.",
  },
  heap: {
    name: "Heap Sort",
    best: "O(n log n)",
    avg: "O(n log n)",
    worst: "O(n log n)",
    stable: false,
    inPlace: true,
    memory: "O(1)",
    description: "Heapifies the array, then repeatedly extracts the maximum.",
  },
  shell: {
    name: "Shell Sort",
    best: "O(n log n)",
    avg: "O(n^4/3)",
    worst: "O(n²)",
    stable: false,
    inPlace: true,
    memory: "O(1)",
    description: "Insertion sort with diminishing gaps — compares distant pairs first.",
  },
  radix: {
    name: "Radix Sort",
    best: "O(nk)",
    avg: "O(nk)",
    worst: "O(nk)",
    stable: true,
    inPlace: false,
    memory: "O(n + k)",
    description: "Sorts by individual digits using counting sort passes (LSD).",
  },
  counting: {
    name: "Counting Sort",
    best: "O(n + k)",
    avg: "O(n + k)",
    worst: "O(n + k)",
    stable: true,
    inPlace: false,
    memory: "O(k)",
    description: "Counts occurrences of each value, then reconstructs the sorted array.",
  },
  cocktail: {
    name: "Cocktail Shaker Sort",
    best: "O(n)",
    avg: "O(n²)",
    worst: "O(n²)",
    stable: true,
    inPlace: true,
    memory: "O(1)",
    description: "Bidirectional bubble sort — sweeps forward then backward each pass.",
  },
  comb: {
    name: "Comb Sort",
    best: "O(n log n)",
    avg: "O(n²/2ᵖ)",
    worst: "O(n²)",
    stable: false,
    inPlace: true,
    memory: "O(1)",
    description: "Bubble sort with a shrinking gap (÷1.3) — kills turtles early.",
  },
  gnome: {
    name: "Gnome Sort",
    best: "O(n)",
    avg: "O(n²)",
    worst: "O(n²)",
    stable: true,
    inPlace: true,
    memory: "O(1)",
    description: "Walks forward until a pair is out of order, swaps, and steps back.",
  },
  cycle: {
    name: "Cycle Sort",
    best: "O(n²)",
    avg: "O(n²)",
    worst: "O(n²)",
    stable: false,
    inPlace: true,
    memory: "O(1)",
    description: "Rotates each cycle into place — provably minimal array writes (≤ n).",
  },
  tim: {
    name: "TimSort (simplified)",
    best: "O(n)",
    avg: "O(n log n)",
    worst: "O(n log n)",
    stable: true,
    inPlace: false,
    memory: "O(n)",
    description: "Insertion-sorts small runs, then merges them — skipping already-ordered pairs.",
  },
};

const LEARNING_CARDS = {
  bubble: {
    trivia: "Bubble sort is one of the simplest algorithms taught in CS101 — yet it inspired early GPU sorting research.",
    useCase: "Educational demos and tiny embedded lists where code size matters more than speed.",
  },
  selection: {
    trivia: "Selection sort always makes exactly n−1 swaps, no matter the input order.",
    useCase: "Flash memory systems where writes are expensive and minimizing swaps is critical.",
  },
  insertion: {
    trivia: "Insertion sort is the algorithm behind Timsort's galloping merge for nearly-sorted runs.",
    useCase: "Real-time online sorting — e.g. sorting a hand of playing cards as you receive them.",
  },
  merge: {
    trivia: "Merge sort was invented by John von Neumann in 1945 for the EDVAC computer.",
    useCase: "External sorting of massive datasets that don't fit in RAM (database indexes, log files).",
  },
  quick: {
    trivia: "Tony Hoare invented Quick Sort at age 26 while on an exchange program in Moscow.",
    useCase: "General-purpose in-memory sorting — used in C's qsort, Python's Timsort hybrid, and more.",
  },
  heap: {
    trivia: "Heap sort guarantees O(n log n) without extra arrays — unlike merge sort.",
    useCase: "Priority queues and real-time systems needing predictable worst-case performance.",
  },
  shell: {
    trivia: "Donald Shell published Shell Sort in 1959 — it was the first algorithm to beat O(n²) in practice.",
    useCase: "Medium-sized in-memory arrays where simplicity beats merge sort's overhead.",
  },
  radix: {
    trivia: "Radix sort can sort integers faster than comparison-based sorts when the key range is bounded.",
    useCase: "Sorting fixed-width integers — IP addresses, zip codes, and database column indexes.",
  },
  counting: {
    trivia: "Counting sort is not comparison-based — it sidesteps the O(n log n) lower bound entirely.",
    useCase: "Sorting exam scores (0–100), histograms, and vote tallies with a small value range.",
  },
  cocktail: {
    trivia: "Cocktail shaker sort is also called bidirectional bubble sort or shaker sort.",
    useCase: "Teaching bidirectional scanning — slightly better than bubble on reversed arrays.",
  },
  comb: {
    trivia: "Comb sort's 1.3 shrink factor was found empirically — it eliminates small values stuck at the end ('turtles') that cripple bubble sort.",
    useCase: "A drop-in bubble sort upgrade when you want simple code with far better average behavior.",
  },
  gnome: {
    trivia: "Named after the garden gnome who sorts flower pots: step forward when they're in order, swap and step back when they're not.",
    useCase: "Teaching the simplest possible stable sort — one loop, no nested indices.",
  },
  cycle: {
    trivia: "Cycle sort is provably optimal in memory writes — every element is written at most once.",
    useCase: "EEPROM and flash memory where each write costs wear — minimizing writes extends hardware life.",
  },
  tim: {
    trivia: "TimSort, invented by Tim Peters in 2002 for Python, is the standard sort in Python and Java — it exploits runs that already exist in real data.",
    useCase: "Real-world data that is partially sorted — appending new records to an already-sorted list.",
  },
};

const DATASET_LABELS = {
  random: "Random",
  sorted: "Sorted",
  "nearly-sorted": "Nearly Sorted",
  reversed: "Reversed",
  "few-unique": "Few Unique",
  sawtooth: "Sawtooth",
  custom: "Custom Input",
};

const HISTORY_KEY = "sortLabHistory";
const QUIZ_SCORE_KEY = "sortLabQuizScore";
const MAX_HISTORY = 8;

// ---------- DOM references ----------
const $ = (id) => document.getElementById(id);

const dom = {
  algorithm: $("algorithm"),
  algorithmRace: $("algorithmRace"),
  dataset: $("dataset"),
  size: $("size"),
  speed: $("speed"),
  sizeValue: $("sizeValue"),
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
  tournamentBtn: $("tournamentBtn"),
  profilerBtn: $("profilerBtn"),
  profilerPanel: $("profilerPanel"),
  profilerChart: $("profilerChart"),
  profilerTable: $("profilerTable"),
  profilerStatus: $("profilerStatus"),
  exportCsvBtn: $("exportCsvBtn"),
  copySummaryBtn: $("copySummaryBtn"),
  visualizer: $("visualizer"),
  visualizerRace: $("visualizerRace"),
  panePrimary: $("panePrimary"),
  paneSecondary: $("paneSecondary"),
  metricsPrimary: $("metricsPrimary"),
  metricsSecondary: $("metricsSecondary"),
  profilePanel: $("profilePanel"),
  historyList: $("historyList"),
  legend: $("legend"),
  statusText: $("statusText"),
  toast: $("toast"),
  teachingPanel: $("teachingPanel"),
  teachingText: $("teachingText"),
  opsChart: $("opsChart"),
  tournamentPanel: $("tournamentPanel"),
  leaderboard: $("leaderboard"),
  comparisonPanel: $("comparisonPanel"),
  comparisonMatrix: $("comparisonMatrix"),
  a11yAnnouncer: $("a11yAnnouncer"),
  shareUrlBtn: $("shareUrlBtn"),
  presentationBtn: $("presentationBtn"),
  quizMode: $("quizMode"),
  quizScore: $("quizScore"),
  quizPanel: $("quizPanel"),
  quizGuessGrid: $("quizGuessGrid"),
  quizFeedback: $("quizFeedback"),
  recommenderContent: $("recommenderContent"),
  learningCard: $("learningCard"),
  learningTrivia: $("learningTrivia"),
  learningUseCase: $("learningUseCase"),
  heatmapPrimary: $("heatmapPrimary"),
  heatmapSecondary: $("heatmapSecondary"),
  countingArrayPanel: $("countingArrayPanel"),
  countingArrayDisplay: $("countingArrayDisplay"),
  panePrimaryLabel: $("panePrimaryLabel"),
  presentationOverlay: $("presentationOverlay"),
  presentationAlgo: $("presentationAlgo"),
  presentationMetrics: $("presentationMetrics"),
  presentationExitBtn: $("presentationExitBtn"),
  presentationVisualizer: $("presentationVisualizer"),
  presentationHeatmap: $("presentationHeatmap"),
};

// ---------- Dataset analysis & recommender ----------
function analyzeDataset(arr) {
  const n = arr.length;
  const unique = new Set(arr).size;
  let inversions = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (arr[i] > arr[j]) inversions++;
    }
  }

  const maxInversions = (n * (n - 1)) / 2 || 1;
  const sortedness = 1 - inversions / maxInversions;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min + 1;

  return { n, unique, inversions, sortedness, uniqueRatio: unique / n, min, max, range };
}

function recommendAlgorithm(arr) {
  const stats = analyzeDataset(arr);

  if (stats.sortedness > 0.92) {
    return {
      algorithm: "insertion",
      reason: `Dataset is ${Math.round(stats.sortedness * 100)}% sorted — Insertion Sort runs in near O(n) time on already-ordered data.`,
      stats,
    };
  }

  if (stats.unique <= 12 && stats.range <= 100 && stats.n >= 15) {
    return {
      algorithm: "counting",
      reason: `Only ${stats.unique} distinct values in a range of ${stats.range} — Counting Sort avoids comparisons entirely.`,
      stats,
    };
  }

  if (stats.uniqueRatio < 0.2 && stats.n >= 20) {
    return {
      algorithm: "radix",
      reason: `Low cardinality (${stats.unique} unique / ${stats.n} elements) — Radix Sort distributes by digits efficiently.`,
      stats,
    };
  }

  if (stats.sortedness < 0.15) {
    return {
      algorithm: "merge",
      reason: "Highly disordered (likely reversed) — Merge Sort guarantees O(n log n) regardless of input order.",
      stats,
    };
  }

  if (stats.n <= 25) {
    return {
      algorithm: "insertion",
      reason: `Small array (n=${stats.n}) — Insertion Sort has low overhead and excellent cache locality.`,
      stats,
    };
  }

  return {
    algorithm: "quick",
    reason: "General-purpose random data — Quick Sort offers excellent average-case performance in practice.",
    stats,
  };
}

function heatmapColor(ratio) {
  const low = getComputedStyle(document.documentElement).getPropertyValue("--heatmap-low").trim() || "#dbeafe";
  const high = getComputedStyle(document.documentElement).getPropertyValue("--heatmap-high").trim() || "#dc2626";

  const parse = (hex) => {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };

  const [r1, g1, b1] = parse(low.length === 7 ? low : "#dbeafe");
  const [r2, g2, b2] = parse(high.length === 7 ? high : "#dc2626");
  const t = Math.min(1, Math.max(0, ratio));
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------- Dataset generators ----------
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function valueFromIndex(i, size) {
  return Math.floor(((i + 1) / size) * 90) + 5;
}

function generateDataset(type, size) {
  switch (type) {
    case "sorted":
      return Array.from({ length: size }, (_, i) => valueFromIndex(i, size));

    case "reversed":
      return Array.from({ length: size }, (_, i) => valueFromIndex(size - 1 - i, size));

    case "nearly-sorted": {
      const arr = Array.from({ length: size }, (_, i) => valueFromIndex(i, size));
      const swaps = Math.max(1, Math.floor(size * 0.05));
      for (let s = 0; s < swaps; s++) {
        const a = randomInt(0, size - 1);
        const b = randomInt(0, size - 1);
        [arr[a], arr[b]] = [arr[b], arr[a]];
      }
      return arr;
    }

    case "few-unique": {
      const uniques = [12, 28, 44, 60, 76, 92];
      return Array.from({ length: size }, () => uniques[randomInt(0, uniques.length - 1)]);
    }

    case "sawtooth": {
      const period = Math.max(4, Math.floor(size / 6));
      return Array.from({ length: size }, (_, i) => {
        const phase = i % period;
        const ascending = phase < period / 2;
        const pos = ascending ? phase : period - phase;
        return Math.floor((pos / (period / 2)) * 85) + 10;
      });
    }

    case "random":
    default:
      return Array.from({ length: size }, () => randomInt(5, 95));
  }
}

function parseCustomArray(input, maxSize = 120) {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "Enter comma-separated values or a JSON array." };
  }

  let values;
  try {
    if (trimmed.startsWith("[")) {
      values = JSON.parse(trimmed);
      if (!Array.isArray(values)) {
        return { error: "JSON input must be an array." };
      }
    } else {
      values = trimmed.split(/[,\s]+/).filter(Boolean).map(Number);
    }
  } catch {
    return { error: "Invalid JSON array format." };
  }

  if (!values.length) {
    return { error: "Array must contain at least one number." };
  }

  if (values.length > maxSize) {
    return { error: `Maximum ${maxSize} elements allowed.` };
  }

  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    return { error: "All values must be valid numbers." };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const normalized = values.map((v) => Math.round(((v - min) / range) * 85 + 10));

  return { data: normalized, original: values };
}

// ---------- Operations sparkline chart ----------
class OperationsChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.points = [];
    if (canvas) {
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }
  }

  resize() {
    if (!this.canvas || !this.ctx) return;
    const wrap = this.canvas.parentElement;
    const w = Math.max(120, wrap.clientWidth - 110);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(56 * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = "56px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  reset() {
    this.points = [];
    this.draw();
  }

  push(totalOps) {
    this.points.push(totalOps);
    if (this.points.length > 600) this.points.shift();
    this.draw();
  }

  draw() {
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = 56;
    this.ctx.clearRect(0, 0, w, h);

    if (this.points.length < 2) return;

    const max = Math.max(...this.points, 1);
    const pad = 4;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim() || "#2563eb";

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    this.points.forEach((val, i) => {
      const x = pad + (i / (this.points.length - 1)) * innerW;
      const y = pad + innerH - (val / max) * innerH;
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    });

    this.ctx.stroke();
    this.ctx.lineTo(pad + innerW, pad + innerH);
    this.ctx.lineTo(pad, pad + innerH);
    this.ctx.closePath();
    this.ctx.fillStyle = color.includes("rgb") ? color.replace(")", ", 0.12)").replace("rgb", "rgba") : "rgba(37, 99, 235, 0.12)";
    this.ctx.fill();
  }
}

// ---------- Audio ----------
class AudioManager {
  constructor() {
    this.enabled = localStorage.getItem("sound") === "true";
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
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

  compare() {
    this.beep(520, 0.02, 0.03);
  }

  swap() {
    this.beep(280, 0.04, 0.05);
  }

  write() {
    this.beep(400, 0.025, 0.035);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem("sound", String(enabled));
  }
}

// ---------- Metrics ----------
class Metrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.comparisons = 0;
    this.swaps = 0;
    this.writes = 0;
    this.startTime = 0;
    this.elapsedMs = 0;
  }

  start() {
    this.reset();
    this.startTime = performance.now();
  }

  finish() {
    this.elapsedMs = Math.round(performance.now() - this.startTime);
  }
}

// ---------- Sort runner (one visualization pane) ----------
class SortRunner {
  constructor({ container, metricsEl, heatmapEl, label }) {
    this.container = container;
    this.metricsEl = metricsEl;
    this.heatmapEl = heatmapEl;
    this.label = label;
    this.array = [];
    this.bars = [];
    this.accessCounts = [];
    this.metrics = new Metrics();
    this.paused = false;
    this.stopped = false;
    this.stepMode = false;
    this.silent = false;
    this.teachingMode = false;
    this.stepResolver = null;
    this.isRunning = false;
    this.audio = null;
    this.speedSlider = null;
    this.onNarrate = null;
    this.onOperation = null;
    this.onVisualUpdate = null;
    this.onCountingArrayUpdate = null;
    this.currentGap = 0;
    this.currentDigitExp = 1;
  }

  configure({
    audio,
    speedSlider,
    stepMode,
    silent = false,
    teachingMode = false,
    onNarrate,
    onOperation,
    onVisualUpdate,
    onCountingArrayUpdate,
  }) {
    this.audio = audio;
    this.speedSlider = speedSlider;
    this.stepMode = stepMode;
    this.silent = silent;
    this.teachingMode = teachingMode;
    this.onNarrate = onNarrate || null;
    this.onOperation = onOperation || null;
    this.onVisualUpdate = onVisualUpdate || null;
    this.onCountingArrayUpdate = onCountingArrayUpdate || null;
  }

  setArray(data) {
    this.array = [...data];
    this.accessCounts = new Array(data.length).fill(0);
    this.renderBars();
    this.renderHeatmap();
  }

  renderBars() {
    if (this.silent) return;
    this.container.innerHTML = "";
    this.bars = this.array.map((value) => {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${value}%`;
      bar.setAttribute("role", "presentation");
      this.container.appendChild(bar);
      return bar;
    });
  }

  clearStateClasses() {
    this.bars.forEach((bar) => {
      bar.classList.remove("compare", "swap", "sorted", "pivot", "write", "digit", "gap", "bucket");
    });
  }

  trackAccess(...indices) {
    indices.forEach((i) => {
      if (i >= 0 && i < this.accessCounts.length) {
        this.accessCounts[i]++;
      }
    });
  }

  renderHeatmap() {
    if (!this.heatmapEl || this.silent) return;

    const n = this.array.length;
    if (this.heatmapEl.children.length !== n) {
      this.heatmapEl.innerHTML = "";
      for (let i = 0; i < n; i++) {
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        cell.title = `Index ${i}: 0 accesses`;
        this.heatmapEl.appendChild(cell);
      }
    }

    const max = Math.max(...this.accessCounts, 1);
    Array.from(this.heatmapEl.children).forEach((cell, i) => {
      const count = this.accessCounts[i] || 0;
      cell.style.background = heatmapColor(count / max);
      cell.title = `Index ${i}: ${count} access${count === 1 ? "" : "es"}`;
    });
  }

  notifyVisualUpdate() {
    this.renderHeatmap();
    this.onVisualUpdate?.(this);
  }

  narrate(message) {
    if (!this.teachingMode || this.silent || !this.onNarrate) return;
    this.onNarrate(message);
  }

  recordOperation() {
    if (this.silent || !this.onOperation) return;
    const total = this.metrics.comparisons + this.metrics.swaps + this.metrics.writes;
    this.onOperation(total);
  }

  updateMetricsDisplay() {
    if (!this.metricsEl) return;
    const m = this.metrics;
    this.metricsEl.innerHTML = `
      <span class="metric"><strong>${m.comparisons}</strong> comparisons</span>
      <span class="metric"><strong>${m.swaps}</strong> swaps</span>
      <span class="metric"><strong>${m.writes}</strong> writes</span>
      <span class="metric"><strong>${m.elapsedMs}</strong> ms</span>
    `;
  }

  tickElapsed() {
    if (this.metrics.startTime) {
      this.metrics.elapsedMs = Math.round(performance.now() - this.metrics.startTime);
      this.updateMetricsDisplay();
    }
  }

  async waitStep() {
    if (this.stopped) throw new Error("STOPPED");

    if (this.silent) {
      return;
    }

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

    const delay = 202 - this.speedSlider.value * 2;
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

  markSorted(i) {
    this.bars[i]?.classList.add("sorted");
  }

  async run(algorithm) {
    this.isRunning = true;
    this.stopped = false;
    this.paused = false;
    this.metrics.start();
    this.clearStateClasses();

    const generator = SortCore.algorithms[algorithm];
    if (!generator) throw new Error(`Unknown algorithm: ${algorithm}`);

    try {
      await this.consume(generator(this.array));
      if (!this.silent) {
        this.bars.forEach((bar) => bar.classList.add("sorted"));
      }
      this.narrate("Sorting complete — all elements are in order.");
    } catch (err) {
      if (err.message !== "STOPPED") throw err;
    } finally {
      this.metrics.finish();
      this.updateMetricsDisplay();
      this.isRunning = false;
    }
  }

  /**
   * Animate a SortCore operation stream. The generator mutates
   * this.array itself; this driver only renders, counts, and paces.
   */
  async consume(ops) {
    for (const op of ops) {
      switch (op.t) {
        case "compare": {
          this.metrics.comparisons++;
          this.trackAccess(op.i, op.j);
          if (!this.silent) {
            this.bars[op.i]?.classList.add("compare");
            this.bars[op.j]?.classList.add("compare");
          }
          this.audio?.compare();
          this.updateMetricsDisplay();
          this.narrate(
            `Now comparing indices ${op.i} and ${op.j} (values ${this.array[op.i]} and ${this.array[op.j]}).`
          );
          this.recordOperation();
          this.notifyVisualUpdate();
          await this.waitStep();
          this.bars[op.i]?.classList.remove("compare");
          this.bars[op.j]?.classList.remove("compare");
          break;
        }

        case "swap": {
          this.metrics.swaps++;
          this.metrics.writes += 2;
          this.trackAccess(op.i, op.j);
          if (!this.silent) {
            this.bars[op.i].style.height = `${this.array[op.i]}%`;
            this.bars[op.j].style.height = `${this.array[op.j]}%`;
            this.bars[op.i].classList.add("swap");
            this.bars[op.j].classList.add("swap");
          }
          this.audio?.swap();
          this.updateMetricsDisplay();
          this.narrate(`Swapping indices ${op.i} and ${op.j}.`);
          this.recordOperation();
          this.notifyVisualUpdate();
          await this.waitStep();
          this.bars[op.i]?.classList.remove("swap");
          this.bars[op.j]?.classList.remove("swap");
          break;
        }

        case "write": {
          this.metrics.writes++;
          this.trackAccess(op.i);
          if (!this.silent) {
            this.bars[op.i].style.height = `${op.value}%`;
            this.bars[op.i].classList.add("write");
          }
          this.audio?.write();
          this.updateMetricsDisplay();
          this.narrate(`Writing value ${op.value} to index ${op.i}.`);
          this.recordOperation();
          this.notifyVisualUpdate();
          await this.waitStep();
          this.bars[op.i]?.classList.remove("write");
          break;
        }

        case "touch": {
          this.trackAccess(op.i);
          if (!this.silent) this.bars[op.i]?.classList.add(op.cls);
          this.notifyVisualUpdate();
          await this.waitStep();
          this.bars[op.i]?.classList.remove(op.cls);
          break;
        }

        case "counts": {
          this.metrics.writes += op.costWrites || 0;
          if (op.access && op.access.length) this.trackAccess(...op.access);
          if (!this.silent && op.idx >= 0 && op.cls) {
            this.bars[op.idx]?.classList.add(op.cls);
          }
          this.onCountingArrayUpdate?.(op.counts, op.min, op.max, op.highlight);
          this.updateMetricsDisplay();
          this.recordOperation();
          this.notifyVisualUpdate();
          await this.waitStep();
          if (op.idx >= 0 && op.cls) this.bars[op.idx]?.classList.remove(op.cls);
          break;
        }

        case "sorted":
          this.markSorted(op.i);
          break;

        case "mark":
          this.trackAccess(op.i);
          if (!this.silent) this.bars[op.i]?.classList.add(op.cls);
          break;

        case "unmark":
          this.bars[op.i]?.classList.remove(op.cls);
          break;

        case "narrate":
          this.narrate(op.text);
          break;

        case "gap":
          this.currentGap = op.gap;
          break;

        case "digitExp":
          this.currentDigitExp = op.exp;
          break;

        default:
          break;
      }
    }
  }
}

// ---------- Application ----------
class SortLabApp {
  constructor() {
    this.audio = new AudioManager();
    this.opsChart = new OperationsChart(dom.opsChart);
    this.primary = new SortRunner({
      container: dom.visualizer,
      metricsEl: dom.metricsPrimary,
      heatmapEl: dom.heatmapPrimary,
      label: "Primary",
    });
    this.secondary = new SortRunner({
      container: dom.visualizerRace,
      metricsEl: dom.metricsSecondary,
      heatmapEl: dom.heatmapSecondary,
      label: "Race",
    });
    this.baseArray = [];
    this.isRunning = false;
    this.presentationActive = false;
    this.presentationBars = [];
    this.presentationHeatmapCells = [];
    this.quizAnswer = null;
    this.quizScore = this.loadQuizScore();
    this.lastRunSummary = null;
    this.lastTournamentResults = null;
    this.history = this.loadHistory();
  }

  init() {
    this.initTheme();
    this.initSoundToggle();
    this.loadFromUrl();
    this.bindEvents();
    this.updateProfile();
    this.updateLearningCard();
    this.updateQuizScoreDisplay();
    this.updateTeachingPanel();
    this.updateCustomFieldVisibility();
    this.renderHistory();
    if (dom.dataset.value !== "custom") {
      this.generateArray();
    } else {
      this.applyCustomArray();
    }
    this.updateRecommender();
    this.updateRaceVisibility();
    this.registerServiceWorker();
    this.setStatus("Ready — press S to start or G to generate");
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
    });
    dom.raceMode.addEventListener("change", () => {
      this.updateRaceVisibility();
      dom.algorithmRace.disabled = !dom.raceMode.checked;
    });

    dom.dataset.addEventListener("change", () => {
      this.updateCustomFieldVisibility();
      if (!this.isRunning && dom.dataset.value !== "custom") this.generateArray();
    });

    dom.stepMode.addEventListener("change", () => {
      dom.nextStepBtn.disabled = !dom.stepMode.checked || !this.isRunning;
    });

    dom.teachingMode.addEventListener("change", () => this.updateTeachingPanel());

    dom.quizMode.addEventListener("change", () => {
      this.updateProfile();
      if (!dom.quizMode.checked) {
        dom.quizPanel.hidden = true;
        dom.quizFeedback.textContent = "";
      }
    });

    dom.learningCard.addEventListener("click", () => this.flipLearningCard());
    dom.learningCard.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        this.flipLearningCard();
      }
    });

    dom.shareUrlBtn.addEventListener("click", () => this.copyShareUrl());
    dom.presentationBtn.addEventListener("click", () => this.enterPresentation());
    dom.presentationExitBtn.addEventListener("click", () => this.exitPresentation());

    dom.applyCustomBtn.addEventListener("click", () => this.applyCustomArray());

    dom.soundToggle.addEventListener("change", () => {
      this.audio.setEnabled(dom.soundToggle.checked);
      dom.soundToggle.setAttribute("aria-pressed", String(dom.soundToggle.checked));
      if (dom.soundToggle.checked) this.audio.beep(660, 0.05, 0.06);
    });

    dom.generateBtn.addEventListener("click", () => this.generateArray());
    dom.resetBtn.addEventListener("click", () => this.generateArray());
    dom.startBtn.addEventListener("click", () => this.startSort());
    dom.pauseBtn.addEventListener("click", () => this.togglePause());
    dom.stopBtn.addEventListener("click", () => this.stopSort());
    dom.nextStepBtn.addEventListener("click", () => this.nextStep());
    dom.tournamentBtn.addEventListener("click", () => this.runTournament());
    dom.profilerBtn.addEventListener("click", () => this.runProfiler());
    dom.exportCsvBtn.addEventListener("click", () => this.exportCsv());
    dom.copySummaryBtn.addEventListener("click", () => this.copySummary());
    dom.themeToggle.addEventListener("click", () => this.toggleTheme());

    document.addEventListener("keydown", (e) => this.handleKeyboard(e));
  }

  handleKeyboard(e) {
    if (e.code === "Escape" && this.presentationActive) {
      e.preventDefault();
      this.exitPresentation();
      return;
    }

    if (e.target.matches("input, select, textarea")) return;

    switch (e.code) {
      case "Space":
        e.preventDefault();
        this.togglePause();
        break;
      case "KeyR":
        this.generateArray();
        break;
      case "KeyG":
        this.generateArray();
        break;
      case "KeyS":
        this.startSort();
        break;
      default:
        break;
    }
  }

  getSize() {
    return parseInt(dom.size.value, 10);
  }

  updateCustomFieldVisibility() {
    const isCustom = dom.dataset.value === "custom";
    dom.customArrayField.hidden = !isCustom;
    if (isCustom) dom.size.disabled = true;
    else dom.size.disabled = this.isRunning;
  }

  showCustomError(message) {
    dom.customArrayError.textContent = message;
    dom.customArrayError.hidden = !message;
  }

  applyCustomArray() {
    if (this.isRunning) return;
    const result = parseCustomArray(dom.customArray.value);
    if (result.error) {
      this.showCustomError(result.error);
      return;
    }

    this.showCustomError("");
    this.baseArray = result.data;
    dom.size.value = result.data.length;
    dom.sizeValue.textContent = result.data.length;
    this.primary.setArray(this.baseArray);
    this.secondary.setArray(this.baseArray);
    this.primary.metrics.reset();
    this.secondary.metrics.reset();
    this.primary.updateMetricsDisplay();
    this.secondary.updateMetricsDisplay();
    this.updateRecommender();
    this.hideCountingArrayPanel();
    this.setStatus(`Loaded custom array (${result.data.length} elements)`);
    this.announce(`Custom array loaded with ${result.data.length} elements.`);
  }

  generateArray() {
    if (this.isRunning) return;

    if (dom.dataset.value === "custom") {
      this.applyCustomArray();
      return;
    }

    const type = dom.dataset.value;
    const size = this.getSize();
    this.baseArray = generateDataset(type, size);
    this.primary.setArray(this.baseArray);
    this.secondary.setArray(this.baseArray);
    this.primary.metrics.reset();
    this.secondary.metrics.reset();
    this.primary.updateMetricsDisplay();
    this.secondary.updateMetricsDisplay();
    this.opsChart.reset();
    this.updateRecommender();
    this.hideCountingArrayPanel();
    dom.quizPanel.hidden = true;
    this.setStatus(`Generated ${DATASET_LABELS[type]} dataset (${size} elements)`);
  }

  updateRaceVisibility() {
    const racing = dom.raceMode.checked;
    dom.paneSecondary.classList.toggle("hidden", !racing);
    dom.legend.classList.toggle("race-layout", racing);
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
    const quizActive = dom.quizMode.checked;
    const hiddenName = quizActive ? "???" : profile.name;
    dom.profilePanel.classList.toggle("quiz-hidden", quizActive);
    dom.profilePanel.innerHTML = `
      <h3 class="profile-name">${hiddenName}</h3>
      <p class="profile-desc">${quizActive ? "Algorithm hidden — watch the animation and guess!" : profile.description}</p>
      <dl class="profile-grid">
        <div><dt>Best</dt><dd>${profile.best}</dd></div>
        <div><dt>Average</dt><dd>${profile.avg}</dd></div>
        <div><dt>Worst</dt><dd>${profile.worst}</dd></div>
        <div><dt>Stable</dt><dd>${profile.stable ? "Yes" : "No"}</dd></div>
        <div><dt>In-place</dt><dd>${profile.inPlace ? "Yes" : "No"}</dd></div>
        <div><dt>Memory</dt><dd>${profile.memory}</dd></div>
      </dl>
    `;
    if (quizActive) {
      dom.panePrimaryLabel.textContent = "???";
    } else {
      dom.panePrimaryLabel.textContent = profile.name;
    }
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

  loadQuizScore() {
    try {
      const raw = localStorage.getItem(QUIZ_SCORE_KEY);
      return raw ? JSON.parse(raw) : { correct: 0, total: 0 };
    } catch {
      return { correct: 0, total: 0 };
    }
  }

  saveQuizScore() {
    localStorage.setItem(QUIZ_SCORE_KEY, JSON.stringify(this.quizScore));
    this.updateQuizScoreDisplay();
  }

  updateQuizScoreDisplay() {
    dom.quizScore.textContent = `Score: ${this.quizScore.correct} / ${this.quizScore.total}`;
  }

  updateRecommender() {
    if (!this.baseArray.length) {
      dom.recommenderContent.innerHTML = '<p class="recommender-reason">Generate a dataset to see recommendations.</p>';
      return;
    }

    const pick = recommendAlgorithm(this.baseArray);
    const profile = ALGORITHM_PROFILES[pick.algorithm];
    const { stats } = pick;

    dom.recommenderContent.innerHTML = `
      <p class="recommender-pick">${profile.name}</p>
      <p class="recommender-reason">${pick.reason}</p>
      <div class="recommender-stats">
        <span class="recommender-stat">Sortedness: <strong>${Math.round(stats.sortedness * 100)}%</strong></span>
        <span class="recommender-stat">Unique: <strong>${stats.unique}</strong></span>
        <span class="recommender-stat">n: <strong>${stats.n}</strong></span>
      </div>
    `;
  }

  renderCountingArray(count, min, max, activeBucket = -1) {
    const maxCount = Math.max(...count, 1);
    dom.countingArrayPanel.classList.remove("hidden");
    dom.countingArrayDisplay.innerHTML = "";

    for (let v = min; v <= max; v++) {
      const idx = v - min;
      const cell = document.createElement("div");
      cell.className = "counting-cell";

      const bar = document.createElement("div");
      bar.className = `counting-bar ${idx === activeBucket ? "active" : "inactive"}`;
      bar.style.height = `${Math.max(8, (count[idx] / maxCount) * 40)}px`;

      const label = document.createElement("span");
      label.className = "counting-label";
      label.textContent = v;

      const value = document.createElement("span");
      value.className = "counting-value";
      value.textContent = count[idx];

      cell.appendChild(bar);
      cell.appendChild(label);
      cell.appendChild(value);
      dom.countingArrayDisplay.appendChild(cell);
    }
  }

  hideCountingArrayPanel() {
    dom.countingArrayPanel.classList.add("hidden");
    dom.countingArrayDisplay.innerHTML = "";
  }

  buildShareUrl() {
    const params = new URLSearchParams();
    params.set("algo", dom.algorithm.value);
    params.set("dataset", dom.dataset.value);
    params.set("size", dom.size.value);
    params.set("speed", dom.speed.value);
    if (dom.raceMode.checked) {
      params.set("race", "1");
      params.set("raceAlgo", dom.algorithmRace.value);
    }
    if (dom.stepMode.checked) params.set("step", "1");
    if (dom.teachingMode.checked) params.set("teach", "1");
    if (dom.quizMode.checked) params.set("quiz", "1");
    if (dom.dataset.value === "custom" && dom.customArray.value.trim()) {
      params.set("data", dom.customArray.value.trim());
    }
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (!params.toString()) return;

    if (params.has("algo") && ALGORITHM_PROFILES[params.get("algo")]) {
      dom.algorithm.value = params.get("algo");
    }
    if (params.has("dataset") && DATASET_LABELS[params.get("dataset")]) {
      dom.dataset.value = params.get("dataset");
    }
    if (params.has("size")) {
      dom.size.value = params.get("size");
      dom.sizeValue.textContent = params.get("size");
    }
    if (params.has("speed")) {
      dom.speed.value = params.get("speed");
      dom.speedValue.textContent = params.get("speed");
    }
    if (params.get("race") === "1") {
      dom.raceMode.checked = true;
      if (params.has("raceAlgo") && ALGORITHM_PROFILES[params.get("raceAlgo")]) {
        dom.algorithmRace.value = params.get("raceAlgo");
      }
    }
    dom.stepMode.checked = params.get("step") === "1";
    dom.teachingMode.checked = params.get("teach") === "1";
    dom.quizMode.checked = params.get("quiz") === "1";
    if (params.has("data")) {
      dom.dataset.value = "custom";
      dom.customArray.value = params.get("data");
    }
  }

  async copyShareUrl() {
    const url = this.buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      this.showToast("Share URL copied");
    } catch {
      this.showToast("Copy failed");
    }
  }

  enterPresentation() {
    this.presentationActive = true;
    dom.presentationOverlay.classList.remove("hidden");
    document.body.classList.add("presentation-active");
    this.initPresentationBars();
    this.syncPresentation();
  }

  exitPresentation() {
    this.presentationActive = false;
    dom.presentationOverlay.classList.add("hidden");
    document.body.classList.remove("presentation-active");
    dom.presentationVisualizer.innerHTML = "";
    dom.presentationHeatmap.innerHTML = "";
    this.presentationBars = [];
    this.presentationHeatmapCells = [];
  }

  initPresentationBars() {
    const n = this.primary.array.length;
    dom.presentationVisualizer.innerHTML = "";
    dom.presentationHeatmap.innerHTML = "";
    this.presentationBars = [];
    this.presentationHeatmapCells = [];

    for (let i = 0; i < n; i++) {
      const bar = document.createElement("div");
      bar.className = "bar";
      dom.presentationVisualizer.appendChild(bar);
      this.presentationBars.push(bar);

      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      dom.presentationHeatmap.appendChild(cell);
      this.presentationHeatmapCells.push(cell);
    }
  }

  syncPresentation(runner = this.primary) {
    if (!this.presentationActive) return;

    const profile = ALGORITHM_PROFILES[dom.algorithm.value];
    const quizActive = dom.quizMode.checked && this.isRunning;
    dom.presentationAlgo.textContent = quizActive ? "???" : profile.name;

    const m = runner.metrics;
    dom.presentationMetrics.textContent = `${m.comparisons} cmp · ${m.swaps} swp · ${m.writes} wrt · ${m.elapsedMs} ms`;

    if (this.presentationBars.length !== runner.array.length) {
      this.initPresentationBars();
    }

    const stateClasses = ["compare", "swap", "sorted", "pivot", "write", "digit", "gap", "bucket"];
    const maxAccess = Math.max(...runner.accessCounts, 1);

    runner.array.forEach((value, i) => {
      const bar = this.presentationBars[i];
      const heatCell = this.presentationHeatmapCells[i];
      const sourceBar = runner.bars[i];

      if (bar) {
        bar.style.height = `${value}%`;
        stateClasses.forEach((cls) => bar.classList.toggle(cls, sourceBar?.classList.contains(cls)));
      }
      if (heatCell) {
        heatCell.style.background = heatmapColor((runner.accessCounts[i] || 0) / maxAccess);
      }
    });
  }

  showQuizPanel(correctAlgorithm) {
    this.quizAnswer = correctAlgorithm;
    dom.quizPanel.hidden = false;
    dom.quizFeedback.textContent = "";
    dom.quizGuessGrid.innerHTML = "";

    ALGORITHM_IDS.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-guess-btn";
      btn.textContent = ALGORITHM_PROFILES[id].name;
      btn.addEventListener("click", () => this.handleQuizGuess(id, btn));
      dom.quizGuessGrid.appendChild(btn);
    });
  }

  handleQuizGuess(guess, btn) {
    if (!this.quizAnswer) return;

    const correct = guess === this.quizAnswer;
    this.quizScore.total++;
    if (correct) this.quizScore.correct++;
    this.saveQuizScore();

    dom.quizGuessGrid.querySelectorAll(".quiz-guess-btn").forEach((b) => {
      b.disabled = true;
      const id = ALGORITHM_IDS.find((aid) => ALGORITHM_PROFILES[aid].name === b.textContent);
      if (id === this.quizAnswer) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
    });

    const answerName = ALGORITHM_PROFILES[this.quizAnswer].name;
    dom.quizFeedback.textContent = correct
      ? `✓ Correct — it was ${answerName}!`
      : `✗ Not quite — it was ${answerName}.`;
    dom.quizFeedback.style.color = correct ? "var(--bar-sorted)" : "var(--bar-swap)";

    this.updateProfile();
    this.announce(correct ? "Quiz answer correct." : `Quiz answer incorrect. It was ${answerName}.`);
  }

  setControlsDisabled(disabled) {
    const ids = [
      "algorithm", "algorithmRace", "dataset", "size", "speed",
      "raceMode", "stepMode", "teachingMode", "quizMode", "generateBtn", "startBtn",
      "resetBtn", "tournamentBtn", "profilerBtn", "applyCustomBtn", "shareUrlBtn", "presentationBtn",
    ];
    ids.forEach((id) => {
      const el = dom[id];
      if (el) el.disabled = disabled;
    });
    dom.algorithmRace.disabled = disabled || !dom.raceMode.checked;
    dom.pauseBtn.disabled = !disabled;
    dom.stopBtn.disabled = !disabled;
    dom.nextStepBtn.disabled = !disabled || !dom.stepMode.checked;
    if (dom.dataset.value === "custom") dom.size.disabled = true;
  }

  configureRunners({ silent = false } = {}) {
    const teaching = dom.teachingMode.checked;
    const config = {
      audio: silent ? null : this.audio,
      speedSlider: dom.speed,
      stepMode: dom.stepMode.checked,
      silent,
      teachingMode: teaching,
      onNarrate: (msg) => this.setTeaching(msg),
      onOperation: silent ? null : (total) => this.opsChart.push(total),
      onVisualUpdate: silent ? null : (runner) => {
        if (runner === this.primary) this.syncPresentation(runner);
      },
      onCountingArrayUpdate: silent
        ? null
        : (count, min, max, activeBucket) => this.renderCountingArray(count, min, max, activeBucket),
    };
    this.primary.configure(config);
    this.secondary.configure({ ...config, onOperation: null, onCountingArrayUpdate: null });
    this.primary.paused = false;
    this.secondary.paused = false;
    this.primary.stopped = false;
    this.secondary.stopped = false;
  }

  async startSort() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.setControlsDisabled(true);
    this.opsChart.reset();
    this.configureRunners();

    const algoPrimary = dom.algorithm.value;
    const algoRace = dom.algorithmRace.value;
    const dataset = dom.dataset.value;
    const size = this.baseArray.length;
    const racing = dom.raceMode.checked;
    const quizActive = dom.quizMode.checked && !racing;

    if (quizActive) {
      dom.quizPanel.hidden = true;
      dom.quizFeedback.textContent = "";
      this.updateProfile();
    }

    this.secondary.setArray(this.baseArray);
    this.primary.setArray(this.baseArray);
    this.hideCountingArrayPanel();

    if (algoPrimary === "counting") {
      dom.countingArrayPanel.classList.remove("hidden");
    }

    const statusMsg = racing
      ? `Racing ${ALGORITHM_PROFILES[algoPrimary].name} vs ${ALGORITHM_PROFILES[algoRace].name}…`
      : quizActive
        ? "Running sort — watch closely and guess the algorithm…"
        : `Running ${ALGORITHM_PROFILES[algoPrimary].name}…`;
    this.setStatus(statusMsg);
    this.announce(statusMsg);
    this.syncPresentation();

    try {
      if (racing) {
        await Promise.all([
          this.primary.run(algoPrimary),
          this.secondary.run(algoRace),
        ]);
      } else {
        await this.primary.run(algoPrimary);
      }

      this.recordRun({
        timestamp: new Date().toISOString(),
        mode: racing ? "race" : quizActive ? "quiz" : "single",
        dataset,
        datasetLabel: DATASET_LABELS[dataset],
        size,
        primary: {
          algorithm: algoPrimary,
          name: ALGORITHM_PROFILES[algoPrimary].name,
          ...this.pickMetrics(this.primary.metrics),
        },
        secondary: racing
          ? {
              algorithm: algoRace,
              name: ALGORITHM_PROFILES[algoRace].name,
              ...this.pickMetrics(this.secondary.metrics),
            }
          : null,
      });

      if (quizActive) {
        this.showQuizPanel(algoPrimary);
        this.setStatus("Sort complete — which algorithm was that?");
        this.announce("Sort complete. Guess the algorithm.");
      } else {
        this.setStatus("Sort complete");
        this.announce("Sort complete.");
        this.updateProfile();
      }
    } catch {
      this.setStatus("Sort stopped");
      this.announce("Sort stopped.");
      this.updateProfile();
    } finally {
      this.isRunning = false;
      this.primary.paused = false;
      this.secondary.paused = false;
      this.hideCountingArrayPanel();
      this.setControlsDisabled(false);
      this.updateCustomFieldVisibility();
      this.syncPresentation();
    }
  }

  async runTournament() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.setControlsDisabled(true);
    this.opsChart.reset();

    const data = [...this.baseArray];
    const dataset = dom.dataset.value;
    const size = data.length;
    const results = [];

    this.setStatus(`Running benchmark tournament on all ${ALGORITHM_IDS.length} algorithms…`);
    this.announce("Benchmark tournament started.");

    for (const algo of ALGORITHM_IDS) {
      this.primary.setArray(data);
      this.configureRunners({ silent: true });
      this.setStatus(`Tournament: running ${ALGORITHM_PROFILES[algo].name}…`);
      await this.primary.run(algo);
      results.push({
        algorithm: algo,
        name: ALGORITHM_PROFILES[algo].name,
        theoretical: ALGORITHM_PROFILES[algo].avg,
        ...this.pickMetrics(this.primary.metrics),
      });
    }

    results.sort((a, b) => a.elapsedMs - b.elapsedMs || a.comparisons - b.comparisons);
    this.lastTournamentResults = results;
    this.renderLeaderboard(results);
    this.renderComparisonMatrix(results);
    dom.tournamentPanel.hidden = false;
    dom.comparisonPanel.hidden = false;

    this.recordRun({
      timestamp: new Date().toISOString(),
      mode: "tournament",
      dataset,
      datasetLabel: DATASET_LABELS[dataset],
      size,
      primary: {
        algorithm: "tournament",
        name: `Tournament winner: ${results[0].name}`,
        ...results[0],
      },
      secondary: null,
      tournamentResults: results,
    });

    const winnerMsg = `Tournament complete — 🏆 ${results[0].name} (${results[0].elapsedMs} ms)`;
    this.setStatus(winnerMsg);
    this.announce(winnerMsg);
    this.showToast("Tournament complete");

    this.isRunning = false;
    this.setControlsDisabled(false);
    this.updateCustomFieldVisibility();
  }

  // ---------- Complexity profiler ----------

  static PROFILER_SIZES = [16, 32, 64, 128, 256, 512];

  profilerColor(index) {
    return `hsl(${Math.round((index * 360) / ALGORITHM_IDS.length)}, 70%, 52%)`;
  }

  async runProfiler() {
    if (this.isRunning) return;
    const sizes = SortLabApp.PROFILER_SIZES;
    const datasetType = dom.dataset.value === "custom" ? "random" : dom.dataset.value;

    dom.profilerPanel.hidden = false;
    this.setStatus("Profiling all algorithms across input sizes…");
    this.announce("Complexity profiling started.");

    const results = [];
    for (const id of ALGORITHM_IDS) {
      dom.profilerStatus.textContent = `Measuring ${ALGORITHM_PROFILES[id].name}…`;
      await new Promise((r) => setTimeout(r, 0));
      const points = SortCore.benchmark(id, sizes, (n) => generateDataset(datasetType, n));
      results.push({
        id,
        name: ALGORITHM_PROFILES[id].name,
        theoretical: ALGORITHM_PROFILES[id].avg,
        points,
        exponent: SortCore.estimateExponent(points),
      });
    }

    this.profilerResults = results;
    this.renderProfilerChart(results, sizes);
    this.renderProfilerTable(results, sizes);
    dom.profilerStatus.textContent =
      `Dataset: ${DATASET_LABELS[datasetType] || datasetType} — total operations (comparisons + swaps + writes) ` +
      `measured at n = ${sizes.join(", ")}. On the log-log chart, the slope of each line ≈ the exponent k in O(nᵏ).`;
    this.setStatus("Complexity profile complete");
    this.showToast("Complexity profile complete");
    this.announce("Complexity profiling complete.");
  }

  renderProfilerChart(results, sizes) {
    const canvas = dom.profilerChart;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { left: 46, right: 12, top: 12, bottom: 26 };

    ctx.clearRect(0, 0, W, H);

    const xMin = Math.log(sizes[0]);
    const xMax = Math.log(sizes[sizes.length - 1]);
    let yMax = 1;
    let yMin = Infinity;
    results.forEach((r) =>
      r.points.forEach((p) => {
        if (p.ops > 0) {
          yMax = Math.max(yMax, p.ops);
          yMin = Math.min(yMin, p.ops);
        }
      })
    );
    const lyMin = Math.log(Math.max(1, yMin));
    const lyMax = Math.log(yMax);
    const toX = (n) => PAD.left + ((Math.log(n) - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
    const toY = (ops) =>
      H - PAD.bottom - ((Math.log(Math.max(1, ops)) - lyMin) / (lyMax - lyMin || 1)) * (H - PAD.top - PAD.bottom);

    // axes + gridlines
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;

    sizes.forEach((n) => {
      const x = toX(n);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, H - PAD.bottom);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(String(n), x, H - PAD.bottom + 14);
    });

    for (let e = Math.ceil(lyMin / Math.LN10); e <= Math.floor(lyMax / Math.LN10); e++) {
      const ops = Math.pow(10, e);
      const y = toY(ops);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(`10^${e}`, PAD.left - 4, y + 3);
    }

    // one line per algorithm
    results.forEach((r, idx) => {
      ctx.strokeStyle = this.profilerColor(idx);
      ctx.lineWidth = 2;
      ctx.beginPath();
      r.points.forEach((p, i) => {
        const x = toX(p.n);
        const y = toY(p.ops);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  renderProfilerTable(results, sizes) {
    const maxN = sizes[sizes.length - 1];
    const rows = [...results]
      .sort((a, b) => (a.exponent ?? 99) - (b.exponent ?? 99))
      .map((r, i) => {
        const idx = ALGORITHM_IDS.indexOf(r.id);
        const measured = r.exponent == null ? "—" : `n^${r.exponent.toFixed(2)}`;
        const opsAtMax = r.points[r.points.length - 1].ops.toLocaleString();
        return `
          <tr>
            <td>${i + 1}</td>
            <td><span class="profiler-dot" style="background:${this.profilerColor(idx)}"></span>${r.name}</td>
            <td><strong>${measured}</strong></td>
            <td>${r.theoretical}</td>
            <td>${opsAtMax}</td>
          </tr>`;
      })
      .join("");

    dom.profilerTable.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Algorithm</th>
            <th>Measured growth</th>
            <th>Theoretical avg</th>
            <th>Ops @ n=${maxN}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  renderLeaderboard(results) {
    dom.leaderboard.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Algorithm</th>
            <th>Time (ms)</th>
            <th>Comparisons</th>
            <th>Swaps</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map(
              (r, i) => `
            <tr class="rank-${i + 1}">
              <td>${i + 1}</td>
              <td>${r.name}</td>
              <td>${r.elapsedMs}</td>
              <td>${r.comparisons}</td>
              <td>${r.swaps}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  assessFit(result, n) {
    const profile = ALGORITHM_PROFILES[result.algorithm];
    const n2 = n * n;
    const nlogn = n * Math.log2(Math.max(n, 2));

    let expected;
    if (profile.avg.includes("n²") || profile.avg.includes("n^2")) {
      expected = n2;
    } else if (profile.avg.includes("log")) {
      expected = nlogn;
    } else if (profile.avg.includes("nk") || result.algorithm === "radix" || result.algorithm === "counting") {
      expected = n * 3;
    } else {
      expected = n;
    }

    const ratio = result.comparisons / expected;
    if (ratio < 1.5) return { class: "match-good", label: "As expected" };
    if (ratio < 4) return { class: "match-warn", label: "Moderate" };
    return { class: "", label: "Heavy ops" };
  }

  renderComparisonMatrix(results) {
    const n = this.baseArray.length;
    dom.comparisonMatrix.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>Theoretical (avg)</th>
            <th>Actual comparisons</th>
            <th>Time (ms)</th>
            <th>Fit</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map((r) => {
              const fit = this.assessFit(r, n);
              return `
            <tr>
              <td>${r.name}</td>
              <td>${r.theoretical}</td>
              <td>${r.comparisons}</td>
              <td>${r.elapsedMs}</td>
              <td class="${fit.class}">${fit.label}</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  pickMetrics(metrics) {
    return {
      comparisons: metrics.comparisons,
      swaps: metrics.swaps,
      writes: metrics.writes,
      elapsedMs: metrics.elapsedMs,
    };
  }

  togglePause() {
    if (!this.isRunning || dom.stepMode.checked) return;
    this.primary.paused = !this.primary.paused;
    this.secondary.paused = this.primary.paused;
    dom.pauseBtn.textContent = this.primary.paused ? "Resume" : "Pause";
    const msg = this.primary.paused ? "Paused — Space to resume" : "Running…";
    this.setStatus(msg);
    this.announce(msg);
  }

  stopSort() {
    if (!this.isRunning) return;
    this.primary.stopped = true;
    this.secondary.stopped = true;
    this.primary.paused = false;
    this.secondary.paused = false;
    this.primary.resolveStep();
    this.secondary.resolveStep();
    dom.pauseBtn.textContent = "Pause";
    this.setStatus("Stopping…");
    this.announce("Stopping sort.");
  }

  nextStep() {
    this.primary.resolveStep();
    this.secondary.resolveStep();
  }

  recordRun(entry) {
    this.lastRunSummary = entry;
    this.history.unshift(entry);
    this.history = this.history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    this.renderHistory();
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  renderHistory() {
    if (!this.history.length) {
      dom.historyList.innerHTML = '<li class="history-empty">No runs yet</li>';
      return;
    }

    dom.historyList.innerHTML = this.history
      .map((run) => {
        const date = new Date(run.timestamp).toLocaleString();
        const primaryLine = `${run.primary.name}: ${run.primary.comparisons}c / ${run.primary.swaps}s / ${run.primary.elapsedMs}ms`;
        const secondaryLine = run.secondary
          ? `<span class="history-secondary">${run.secondary.name}: ${run.secondary.comparisons}c / ${run.secondary.swaps}s / ${run.secondary.elapsedMs}ms</span>`
          : "";
        return `
          <li class="history-item">
            <span class="history-meta">${date} · ${run.datasetLabel} · n=${run.size} · ${run.mode}</span>
            <span class="history-primary">${primaryLine}</span>
            ${secondaryLine}
          </li>
        `;
      })
      .join("");
  }

  buildCsv() {
    const header = [
      "timestamp",
      "mode",
      "dataset",
      "size",
      "algorithm",
      "comparisons",
      "swaps",
      "writes",
      "elapsed_ms",
      "pane",
    ];

    const rows = [header.join(",")];

    this.history.forEach((run) => {
      rows.push(
        [
          run.timestamp,
          run.mode,
          run.dataset,
          run.size,
          run.primary.algorithm,
          run.primary.comparisons,
          run.primary.swaps,
          run.primary.writes,
          run.primary.elapsedMs,
          "primary",
        ].join(",")
      );

      if (run.secondary) {
        rows.push(
          [
            run.timestamp,
            run.mode,
            run.dataset,
            run.size,
            run.secondary.algorithm,
            run.secondary.comparisons,
            run.secondary.swaps,
            run.secondary.writes,
            run.secondary.elapsedMs,
            "secondary",
          ].join(",")
        );
      }

      if (run.tournamentResults) {
        run.tournamentResults.forEach((r) => {
          rows.push(
            [
              run.timestamp,
              "tournament",
              run.dataset,
              run.size,
              r.algorithm,
              r.comparisons,
              r.swaps,
              r.writes,
              r.elapsedMs,
              "tournament",
            ].join(",")
          );
        });
      }
    });

    return rows.join("\n");
  }

  exportCsv() {
    const csv = this.buildCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sort-lab-history-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.showToast("CSV exported");
  }

  buildSummaryText() {
    if (!this.lastRunSummary) {
      return "No completed run to summarize yet.";
    }

    const run = this.lastRunSummary;
    let text = `Sort Lab Run\n`;
    text += `Dataset: ${run.datasetLabel} (n=${run.size})\n`;

    if (run.mode === "tournament" && run.tournamentResults) {
      text += "Tournament results:\n";
      run.tournamentResults.forEach((r, i) => {
        text += `${i + 1}. ${r.name}: ${r.comparisons}c, ${r.swaps}s, ${r.elapsedMs}ms\n`;
      });
      return text;
    }

    text += `${run.primary.name}: ${run.primary.comparisons} comparisons, ${run.primary.swaps} swaps, ${run.primary.writes} writes, ${run.primary.elapsedMs} ms\n`;

    if (run.secondary) {
      text += `${run.secondary.name}: ${run.secondary.comparisons} comparisons, ${run.secondary.swaps} swaps, ${run.secondary.writes} writes, ${run.secondary.elapsedMs} ms\n`;
      const winner =
        run.primary.elapsedMs <= run.secondary.elapsedMs
          ? run.primary.name
          : run.secondary.name;
      text += `Winner (time): ${winner}`;
    }

    return text;
  }

  async copySummary() {
    const text = this.buildSummaryText();
    try {
      await navigator.clipboard.writeText(text);
      this.showToast("Summary copied");
    } catch {
      this.showToast("Copy failed");
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    dom.themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
    dom.themeToggle.setAttribute("aria-pressed", next === "dark");
    localStorage.setItem("theme", next);
    this.opsChart.draw();
    this.primary.renderHeatmap();
    this.secondary.renderHeatmap();
    if (this.presentationActive) this.syncPresentation();
  }

  setStatus(message) {
    dom.statusText.textContent = message;
  }

  setTeaching(message) {
    dom.teachingText.textContent = message;
    this.announce(message);
  }

  announce(message) {
    if (!dom.a11yAnnouncer) return;
    dom.a11yAnnouncer.textContent = "";
    requestAnimationFrame(() => {
      dom.a11yAnnouncer.textContent = message;
    });
  }

  showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => dom.toast.classList.remove("visible"), 2200);
  }
}

// ---------- Boot ----------
const app = new SortLabApp();
app.init();