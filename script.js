/* ============================================================
   Sorting Algorithm Lab v3
   Vanilla JS — no frameworks
   ============================================================ */

const ALGORITHM_IDS = [
  "bubble", "selection", "insertion", "merge", "quick", "heap", "shell", "radix",
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
};

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
  constructor({ container, metricsEl, label }) {
    this.container = container;
    this.metricsEl = metricsEl;
    this.label = label;
    this.array = [];
    this.bars = [];
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
    this.currentGap = 0;
    this.currentDigitExp = 1;
  }

  configure({ audio, speedSlider, stepMode, silent = false, teachingMode = false, onNarrate, onOperation }) {
    this.audio = audio;
    this.speedSlider = speedSlider;
    this.stepMode = stepMode;
    this.silent = silent;
    this.teachingMode = teachingMode;
    this.onNarrate = onNarrate || null;
    this.onOperation = onOperation || null;
  }

  setArray(data) {
    this.array = [...data];
    this.renderBars();
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
      bar.classList.remove("compare", "swap", "sorted", "pivot", "write", "digit", "gap");
    });
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

  async compare(i, j) {
    this.metrics.comparisons++;
    if (!this.silent) {
      this.bars[i]?.classList.add("compare");
      this.bars[j]?.classList.add("compare");
    }
    this.audio?.compare();
    this.updateMetricsDisplay();
    this.narrate(`Now comparing indices ${i} and ${j} (values ${this.array[i]} and ${this.array[j]}).`);
    this.recordOperation();
    await this.waitStep();
  }

  clearCompare(i, j) {
    this.bars[i]?.classList.remove("compare");
    this.bars[j]?.classList.remove("compare");
  }

  async swap(i, j) {
    this.metrics.swaps++;
    this.metrics.writes += 2;
    [this.array[i], this.array[j]] = [this.array[j], this.array[i]];
    if (!this.silent) {
      this.bars[i].style.height = `${this.array[i]}%`;
      this.bars[j].style.height = `${this.array[j]}%`;
      this.bars[i].classList.add("swap");
      this.bars[j].classList.add("swap");
    }
    this.audio?.swap();
    this.updateMetricsDisplay();
    this.narrate(`Swapping indices ${i} and ${j}.`);
    this.recordOperation();
    await this.waitStep();
    this.bars[i]?.classList.remove("swap");
    this.bars[j]?.classList.remove("swap");
  }

  async write(i, value) {
    this.metrics.writes++;
    this.array[i] = value;
    if (!this.silent) {
      this.bars[i].style.height = `${value}%`;
      this.bars[i].classList.add("write");
    }
    this.audio?.write();
    this.updateMetricsDisplay();
    this.narrate(`Writing value ${value} to index ${i}.`);
    this.recordOperation();
    await this.waitStep();
    this.bars[i]?.classList.remove("write");
  }

  markSorted(i) {
    this.bars[i]?.classList.add("sorted");
  }

  async markPivot(i) {
    this.bars[i]?.classList.add("pivot");
    this.narrate(`Pivot selected at index ${i} (value ${this.array[i]}).`);
    await this.waitStep();
  }

  clearPivot(i) {
    this.bars[i]?.classList.remove("pivot");
  }

  async run(algorithm) {
    this.isRunning = true;
    this.stopped = false;
    this.paused = false;
    this.metrics.start();
    this.clearStateClasses();

    const runners = {
      bubble: () => this.bubbleSort(),
      selection: () => this.selectionSort(),
      insertion: () => this.insertionSort(),
      merge: () => this.mergeSort(),
      quick: () => this.quickSort(),
      heap: () => this.heapSort(),
      shell: () => this.shellSort(),
      radix: () => this.radixSort(),
    };

    try {
      await runners[algorithm]();
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

  async bubbleSort() {
    const n = this.array.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - i - 1; j++) {
        await this.compare(j, j + 1);
        if (this.array[j] > this.array[j + 1]) {
          await this.swap(j, j + 1);
        }
        this.clearCompare(j, j + 1);
      }
      this.markSorted(n - i - 1);
    }
    this.markSorted(0);
  }

  async selectionSort() {
    const n = this.array.length;
    for (let i = 0; i < n - 1; i++) {
      let minIdx = i;
      if (!this.silent) this.bars[minIdx].classList.add("compare");

      for (let j = i + 1; j < n; j++) {
        await this.compare(j, minIdx);
        if (this.array[j] < this.array[minIdx]) {
          this.bars[minIdx]?.classList.remove("compare");
          minIdx = j;
          if (!this.silent) this.bars[minIdx].classList.add("compare");
        } else {
          this.bars[j]?.classList.remove("compare");
        }
      }

      if (minIdx !== i) await this.swap(i, minIdx);
      this.bars[minIdx]?.classList.remove("compare");
      this.markSorted(i);
    }
    this.markSorted(n - 1);
  }

  async insertionSort() {
    const n = this.array.length;
    this.markSorted(0);

    for (let i = 1; i < n; i++) {
      let j = i;
      if (!this.silent) this.bars[i].classList.add("compare");

      while (j > 0) {
        await this.compare(j - 1, j);
        if (this.array[j - 1] > this.array[j]) {
          await this.swap(j - 1, j);
          j--;
        } else {
          this.clearCompare(j - 1, j);
          break;
        }
        this.clearCompare(j - 1, j);
      }

      this.bars[i]?.classList.remove("compare");
      for (let k = 0; k <= i; k++) this.markSorted(k);
    }
  }

  async mergeSort() {
    const aux = [...this.array];
    await this.mergeSortRange(0, this.array.length - 1, aux);
  }

  async mergeSortRange(low, high, aux) {
    if (low >= high) return;
    const mid = Math.floor((low + high) / 2);
    this.narrate(`Merge sort: dividing range [${low}…${high}] at midpoint ${mid}.`);
    await this.mergeSortRange(low, mid, aux);
    await this.mergeSortRange(mid + 1, high, aux);
    await this.merge(low, mid, high, aux);
  }

  async merge(low, mid, high, aux) {
    this.narrate(`Merging sorted halves [${low}…${mid}] and [${mid + 1}…${high}].`);
    for (let k = low; k <= high; k++) {
      aux[k] = this.array[k];
    }

    let i = low;
    let j = mid + 1;
    let k = low;

    while (i <= mid && j <= high) {
      await this.compare(i, j);
      if (aux[i] <= aux[j]) {
        await this.write(k, aux[i]);
        i++;
      } else {
        await this.write(k, aux[j]);
        j++;
      }
      this.clearCompare(i, j);
      k++;
    }

    while (i <= mid) {
      await this.write(k, aux[i]);
      i++;
      k++;
    }

    while (j <= high) {
      await this.write(k, aux[j]);
      j++;
      k++;
    }
  }

  async quickSort(low = 0, high = this.array.length - 1) {
    if (low < high) {
      const pivotIdx = await this.partition(low, high);
      await this.quickSort(low, pivotIdx - 1);
      await this.quickSort(pivotIdx + 1, high);
    }
  }

  async partition(low, high) {
    await this.markPivot(high);
    const pivotValue = this.array[high];
    let i = low - 1;

    for (let j = low; j < high; j++) {
      await this.compare(j, high);
      if (this.array[j] < pivotValue) {
        i++;
        if (i !== j) await this.swap(i, j);
      }
      this.clearCompare(j, high);
    }

    await this.swap(i + 1, high);
    this.clearPivot(high);
    this.markSorted(i + 1);
    return i + 1;
  }

  async heapSort() {
    const n = this.array.length;
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      await this.heapify(n, i);
    }

    for (let i = n - 1; i > 0; i--) {
      await this.swap(0, i);
      this.markSorted(i);
      await this.heapify(i, 0);
    }
    this.markSorted(0);
  }

  async heapify(size, root) {
    let largest = root;
    const left = 2 * root + 1;
    const right = 2 * root + 2;

    if (left < size) {
      await this.compare(left, largest);
      if (this.array[left] > this.array[largest]) largest = left;
      this.clearCompare(left, root);
    }

    if (right < size) {
      const compareWith = largest;
      await this.compare(right, compareWith);
      if (this.array[right] > this.array[compareWith]) largest = right;
      this.clearCompare(right, compareWith);
    }

    if (largest !== root) {
      await this.swap(root, largest);
      await this.heapify(size, largest);
    }
  }

  async shellSort() {
    const n = this.array.length;
    let gap = Math.floor(n / 2);

    while (gap > 0) {
      this.currentGap = gap;
      this.narrate(`Shell sort: starting pass with gap = ${gap}.`);

      for (let i = gap; i < n; i++) {
        const temp = this.array[i];
        let j = i;
        if (!this.silent) this.bars[i]?.classList.add("gap");

        while (j >= gap) {
          await this.compare(j - gap, j);
          if (!this.silent) this.bars[j - gap]?.classList.add("gap");
          this.narrate(
            `Comparing indices ${j - gap} and ${j} (${gap} apart): ${this.array[j - gap]} vs ${temp}.`
          );

          if (this.array[j - gap] > temp) {
            await this.write(j, this.array[j - gap]);
            j -= gap;
          } else {
            this.clearCompare(j - gap, j);
            this.bars[j - gap]?.classList.remove("gap");
            break;
          }
          this.clearCompare(j - gap, j);
          this.bars[j - gap]?.classList.remove("gap");
        }

        if (j !== i) {
          await this.write(j, temp);
        }
        this.bars[i]?.classList.remove("gap");
      }

      gap = Math.floor(gap / 2);
    }
  }

  async radixSort() {
    const max = Math.max(...this.array);
    const placeNames = ["ones", "tens", "hundreds"];
    let exp = 1;
    let pass = 0;

    while (Math.floor(max / exp) > 0) {
      this.currentDigitExp = exp;
      const place = placeNames[pass] || `10^${pass}`;
      this.narrate(`Radix sort pass ${pass + 1}: sorting by ${place} digit.`);
      await this.radixCountingSort(exp);
      exp *= 10;
      pass++;
    }
  }

  async radixCountingSort(exp) {
    const n = this.array.length;
    const output = new Array(n);
    const count = new Array(10).fill(0);

    for (let i = 0; i < n; i++) {
      const digit = Math.floor(this.array[i] / exp) % 10;
      if (!this.silent) this.bars[i]?.classList.add("digit");
      this.narrate(`Counting digit ${digit} at index ${i} (value ${this.array[i]}).`);
      count[digit]++;
      await this.waitStep();
      this.bars[i]?.classList.remove("digit");
    }

    for (let i = 1; i < 10; i++) {
      count[i] += count[i - 1];
    }

    for (let i = n - 1; i >= 0; i--) {
      const digit = Math.floor(this.array[i] / exp) % 10;
      const pos = count[digit] - 1;
      output[pos] = this.array[i];
      this.narrate(`Placing ${this.array[i]} into bucket position ${pos} (digit ${digit}).`);
      count[digit]--;
      if (!this.silent) {
        this.bars[i]?.classList.add("digit");
        await this.waitStep();
        this.bars[i]?.classList.remove("digit");
      }
    }

    for (let i = 0; i < n; i++) {
      await this.write(i, output[i]);
      if (!this.silent) {
        this.bars[i]?.classList.add("digit");
        await this.waitStep();
        this.bars[i]?.classList.remove("digit");
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
      label: "Primary",
    });
    this.secondary = new SortRunner({
      container: dom.visualizerRace,
      metricsEl: dom.metricsSecondary,
      label: "Race",
    });
    this.baseArray = [];
    this.isRunning = false;
    this.lastRunSummary = null;
    this.lastTournamentResults = null;
    this.history = this.loadHistory();
  }

  init() {
    this.initTheme();
    this.initSoundToggle();
    this.bindEvents();
    this.updateProfile();
    this.updateTeachingPanel();
    this.updateCustomFieldVisibility();
    this.renderHistory();
    this.generateArray();
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

    dom.algorithm.addEventListener("change", () => this.updateProfile());
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
    dom.exportCsvBtn.addEventListener("click", () => this.exportCsv());
    dom.copySummaryBtn.addEventListener("click", () => this.copySummary());
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
    dom.profilePanel.innerHTML = `
      <h3 class="profile-name">${profile.name}</h3>
      <p class="profile-desc">${profile.description}</p>
      <dl class="profile-grid">
        <div><dt>Best</dt><dd>${profile.best}</dd></div>
        <div><dt>Average</dt><dd>${profile.avg}</dd></div>
        <div><dt>Worst</dt><dd>${profile.worst}</dd></div>
        <div><dt>Stable</dt><dd>${profile.stable ? "Yes" : "No"}</dd></div>
        <div><dt>In-place</dt><dd>${profile.inPlace ? "Yes" : "No"}</dd></div>
        <div><dt>Memory</dt><dd>${profile.memory}</dd></div>
      </dl>
    `;
  }

  setControlsDisabled(disabled) {
    const ids = [
      "algorithm", "algorithmRace", "dataset", "size", "speed",
      "raceMode", "stepMode", "teachingMode", "generateBtn", "startBtn",
      "resetBtn", "tournamentBtn", "applyCustomBtn",
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
    };
    this.primary.configure(config);
    this.secondary.configure({ ...config, onOperation: null });
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

    this.secondary.setArray(this.baseArray);
    this.primary.setArray(this.baseArray);

    const statusMsg = racing
      ? `Racing ${ALGORITHM_PROFILES[algoPrimary].name} vs ${ALGORITHM_PROFILES[algoRace].name}…`
      : `Running ${ALGORITHM_PROFILES[algoPrimary].name}…`;
    this.setStatus(statusMsg);
    this.announce(statusMsg);

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
        mode: racing ? "race" : "single",
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

      this.setStatus("Sort complete");
      this.announce("Sort complete.");
    } catch {
      this.setStatus("Sort stopped");
      this.announce("Sort stopped.");
    } finally {
      this.isRunning = false;
      this.primary.paused = false;
      this.secondary.paused = false;
      this.setControlsDisabled(false);
      this.updateCustomFieldVisibility();
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

    this.setStatus("Running benchmark tournament on all 8 algorithms…");
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
    } else if (profile.avg.includes("nk") || result.algorithm === "radix") {
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