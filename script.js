/* ============================================================
   Sorting Algorithm Lab
   Vanilla JS — no frameworks
   ============================================================ */

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
};

const DATASET_LABELS = {
  random: "Random",
  sorted: "Sorted",
  "nearly-sorted": "Nearly Sorted",
  reversed: "Reversed",
  "few-unique": "Few Unique",
  sawtooth: "Sawtooth",
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
  soundToggle: $("soundToggle"),
  themeToggle: $("themeToggle"),
  generateBtn: $("generateBtn"),
  startBtn: $("startBtn"),
  pauseBtn: $("pauseBtn"),
  stopBtn: $("stopBtn"),
  nextStepBtn: $("nextStepBtn"),
  resetBtn: $("resetBtn"),
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
    this.stepResolver = null;
    this.isRunning = false;
    this.audio = null;
    this.speedSlider = null;
  }

  configure({ audio, speedSlider, stepMode }) {
    this.audio = audio;
    this.speedSlider = speedSlider;
    this.stepMode = stepMode;
  }

  setArray(data) {
    this.array = [...data];
    this.renderBars();
  }

  renderBars() {
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
      bar.classList.remove("compare", "swap", "sorted", "pivot", "write");
    });
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
    this.bars[i]?.classList.add("compare");
    this.bars[j]?.classList.add("compare");
    this.audio?.compare();
    this.updateMetricsDisplay();
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
    this.bars[i].style.height = `${this.array[i]}%`;
    this.bars[j].style.height = `${this.array[j]}%`;
    this.bars[i].classList.add("swap");
    this.bars[j].classList.add("swap");
    this.audio?.swap();
    this.updateMetricsDisplay();
    await this.waitStep();
    this.bars[i].classList.remove("swap");
    this.bars[j].classList.remove("swap");
  }

  async write(i, value) {
    this.metrics.writes++;
    this.array[i] = value;
    this.bars[i].style.height = `${value}%`;
    this.bars[i].classList.add("write");
    this.audio?.write();
    this.updateMetricsDisplay();
    await this.waitStep();
    this.bars[i].classList.remove("write");
  }

  markSorted(i) {
    this.bars[i]?.classList.add("sorted");
  }

  async markPivot(i) {
    this.bars[i]?.classList.add("pivot");
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
    };

    try {
      await runners[algorithm]();
      this.bars.forEach((bar) => bar.classList.add("sorted"));
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
      this.bars[minIdx].classList.add("compare");

      for (let j = i + 1; j < n; j++) {
        await this.compare(j, minIdx);
        if (this.array[j] < this.array[minIdx]) {
          this.bars[minIdx].classList.remove("compare");
          minIdx = j;
          this.bars[minIdx].classList.add("compare");
        } else {
          this.bars[j].classList.remove("compare");
        }
      }

      if (minIdx !== i) await this.swap(i, minIdx);
      this.bars[minIdx].classList.remove("compare");
      this.markSorted(i);
    }
    this.markSorted(n - 1);
  }

  async insertionSort() {
    const n = this.array.length;
    this.markSorted(0);

    for (let i = 1; i < n; i++) {
      let j = i;
      this.bars[i].classList.add("compare");

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

      this.bars[i].classList.remove("compare");
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
    await this.mergeSortRange(low, mid, aux);
    await this.mergeSortRange(mid + 1, high, aux);
    await this.merge(low, mid, high, aux);
  }

  async merge(low, mid, high, aux) {
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
}

// ---------- Application ----------
class SortLabApp {
  constructor() {
    this.audio = new AudioManager();
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
    this.history = this.loadHistory();
  }

  init() {
    this.initTheme();
    this.initSoundToggle();
    this.bindEvents();
    this.updateProfile();
    this.renderHistory();
    this.generateArray();
    this.updateRaceVisibility();
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

  bindEvents() {
    dom.size.addEventListener("input", () => {
      dom.sizeValue.textContent = dom.size.value;
      if (!this.isRunning) this.generateArray();
    });

    dom.speed.addEventListener("input", () => {
      dom.speedValue.textContent = dom.speed.value;
    });

    dom.algorithm.addEventListener("change", () => this.updateProfile());
    dom.raceMode.addEventListener("change", () => {
      this.updateRaceVisibility();
      dom.algorithmRace.disabled = !dom.raceMode.checked;
    });

    dom.stepMode.addEventListener("change", () => {
      dom.nextStepBtn.disabled = !dom.stepMode.checked || !this.isRunning;
    });

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

  generateArray() {
    if (this.isRunning) return;
    const type = dom.dataset.value;
    const size = this.getSize();
    this.baseArray = generateDataset(type, size);
    this.primary.setArray(this.baseArray);
    this.secondary.setArray(this.baseArray);
    this.primary.metrics.reset();
    this.secondary.metrics.reset();
    this.primary.updateMetricsDisplay();
    this.secondary.updateMetricsDisplay();
    this.setStatus(`Generated ${DATASET_LABELS[type]} dataset (${size} elements)`);
  }

  updateRaceVisibility() {
    const racing = dom.raceMode.checked;
    dom.paneSecondary.classList.toggle("hidden", !racing);
    dom.legend.classList.toggle("race-layout", racing);
    document.body.classList.toggle("race-active", racing);
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
      "raceMode", "stepMode", "generateBtn", "startBtn", "resetBtn",
    ];
    ids.forEach((id) => {
      const el = dom[id];
      if (el) el.disabled = disabled;
    });
    dom.algorithmRace.disabled = disabled || !dom.raceMode.checked;
    dom.pauseBtn.disabled = !disabled;
    dom.stopBtn.disabled = !disabled;
    dom.nextStepBtn.disabled = !disabled || !dom.stepMode.checked;
  }

  configureRunners() {
    const config = {
      audio: this.audio,
      speedSlider: dom.speed,
      stepMode: dom.stepMode.checked,
    };
    this.primary.configure(config);
    this.secondary.configure(config);
    this.primary.paused = false;
    this.secondary.paused = false;
    this.primary.stopped = false;
    this.secondary.stopped = false;
  }

  async startSort() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.setControlsDisabled(true);
    this.configureRunners();

    const algoPrimary = dom.algorithm.value;
    const algoRace = dom.algorithmRace.value;
    const dataset = dom.dataset.value;
    const size = this.getSize();
    const racing = dom.raceMode.checked;

    this.secondary.setArray(this.baseArray);
    this.primary.setArray(this.baseArray);

    this.setStatus(
      racing
        ? `Racing ${ALGORITHM_PROFILES[algoPrimary].name} vs ${ALGORITHM_PROFILES[algoRace].name}…`
        : `Running ${ALGORITHM_PROFILES[algoPrimary].name}…`
    );

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
    } catch {
      this.setStatus("Sort stopped");
    } finally {
      this.isRunning = false;
      this.primary.paused = false;
      this.secondary.paused = false;
      this.setControlsDisabled(false);
    }
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
    this.setStatus(this.primary.paused ? "Paused — Space to resume" : "Running…");
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
            <span class="history-meta">${date} · ${run.datasetLabel} · n=${run.size}</span>
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
  }

  setStatus(message) {
    dom.statusText.textContent = message;
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