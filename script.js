"use strict";

const visualizer = document.getElementById("visualizer");
const algorithmSel = document.getElementById("algorithm");
const patternSel = document.getElementById("pattern");
const sizeSlider = document.getElementById("size");
const speedSlider = document.getElementById("speed");
const sizeValue = document.getElementById("sizeValue");
const speedValue = document.getElementById("speedValue");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const generateBtn = document.getElementById("generateBtn");
const pauseBtn = document.getElementById("pauseBtn");
const themeToggle = document.getElementById("themeToggle");
const algoName = document.getElementById("algoName");
const algoTitle = document.getElementById("algoTitle");
const noteTitle = document.getElementById("noteTitle");
const noteBody = document.getElementById("noteBody");
const complexityBadge = document.getElementById("complexityBadge");
const comparisonCount = document.getElementById("comparisons");
const swapCount = document.getElementById("swaps");
const writeCount = document.getElementById("writes");
const elapsedCount = document.getElementById("elapsed");
const statusText = document.getElementById("statusText");
const stabilityBadge = document.getElementById("stabilityBadge");
const bestCase = document.getElementById("bestCase");
const averageCase = document.getElementById("averageCase");
const worstCase = document.getElementById("worstCase");
const memoryUse = document.getElementById("memoryUse");
const historyBody = document.getElementById("historyBody");
const emptyHistory = document.getElementById("emptyHistory");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const exportHistoryBtn = document.getElementById("exportHistoryBtn");

const HISTORY_KEY = "sorting-lab-history-v1";
const MAX_HISTORY = 8;
const CANCELLED_SORT = "SORT_CANCELLED";

const ALGORITHMS = {
  bubble: {
    name: "Bubble Sort",
    title: "Adjacent swaps with an early win condition",
    complexity: "O(n^2)",
    best: "O(n)",
    average: "O(n^2)",
    worst: "O(n^2)",
    memory: "O(1)",
    stable: true,
    note: "It repeatedly compares neighbors and bubbles the largest remaining value to the right side of the array.",
  },
  selection: {
    name: "Selection Sort",
    title: "Find the smallest remaining value each pass",
    complexity: "O(n^2)",
    best: "O(n^2)",
    average: "O(n^2)",
    worst: "O(n^2)",
    memory: "O(1)",
    stable: false,
    note: "It scans the unsorted region for the minimum value, then swaps that value into the next sorted slot.",
  },
  insertion: {
    name: "Insertion Sort",
    title: "Build a sorted prefix one item at a time",
    complexity: "O(n^2)",
    best: "O(n)",
    average: "O(n^2)",
    worst: "O(n^2)",
    memory: "O(1)",
    stable: true,
    note: "It is simple but surprisingly strong on nearly sorted data because each item only moves as far as needed.",
  },
  quick: {
    name: "Quick Sort",
    title: "Partition around a pivot",
    complexity: "O(n log n)",
    best: "O(n log n)",
    average: "O(n log n)",
    worst: "O(n^2)",
    memory: "O(log n)",
    stable: false,
    note: "It chooses a pivot, moves smaller values left and larger values right, then repeats inside each partition.",
  },
  merge: {
    name: "Merge Sort",
    title: "Split, sort, and merge ordered runs",
    complexity: "O(n log n)",
    best: "O(n log n)",
    average: "O(n log n)",
    worst: "O(n log n)",
    memory: "O(n)",
    stable: true,
    note: "It keeps dividing the array into halves, then writes values back in sorted order during each merge.",
  },
  heap: {
    name: "Heap Sort",
    title: "Build a heap and drain the maximum",
    complexity: "O(n log n)",
    best: "O(n log n)",
    average: "O(n log n)",
    worst: "O(n log n)",
    memory: "O(1)",
    stable: false,
    note: "It first reshapes the array into a max heap, then repeatedly moves the largest value into its final slot.",
  },
};

let array = [];
let bars = [];
let isSorting = false;
let isPaused = false;
let startedAt = 0;
let pausedAt = 0;
let pausedTotal = 0;
let timerId = null;
let activeRunToken = 0;
let runHistory = [];
let metrics = {
  comparisons: 0,
  swaps: 0,
  writes: 0,
};

function delayForSpeed() {
  return Math.max(6, 255 - Number(speedSlider.value) * 2.35);
}

function getElapsedMs() {
  if (!startedAt) return 0;
  const currentPause = isPaused ? performance.now() - pausedAt : 0;
  return performance.now() - startedAt - pausedTotal - currentPause;
}

function updateMetricDisplay() {
  comparisonCount.textContent = String(metrics.comparisons);
  swapCount.textContent = String(metrics.swaps);
  writeCount.textContent = String(metrics.writes);
  elapsedCount.textContent = `${(getElapsedMs() / 1000).toFixed(1)}s`;
}

function resetMetrics() {
  metrics = { comparisons: 0, swaps: 0, writes: 0 };
  startedAt = 0;
  pausedAt = 0;
  pausedTotal = 0;
  updateMetricDisplay();
}

function cancelError() {
  return new Error(CANCELLED_SORT);
}

function assertRunActive(token) {
  if (token !== activeRunToken) {
    throw cancelError();
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

async function waitWhilePaused(token) {
  while (isPaused) {
    assertRunActive(token);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

async function sleep(token) {
  assertRunActive(token);
  const waitUntil = performance.now() + delayForSpeed();
  while (performance.now() < waitUntil) {
    await waitWhilePaused(token);
    assertRunActive(token);
    const remaining = waitUntil - performance.now();
    await new Promise((resolve) => setTimeout(resolve, Math.min(28, Math.max(1, remaining))));
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function patternValue(index, size, pattern) {
  if (pattern === "sorted") {
    return 6 + (index / Math.max(1, size - 1)) * 90;
  }

  if (pattern === "reversed") {
    return 96 - (index / Math.max(1, size - 1)) * 90;
  }

  if (pattern === "nearly") {
    const base = 8 + (index / Math.max(1, size - 1)) * 88;
    return clamp(base + (Math.random() - 0.5) * 16, 5, 98);
  }

  if (pattern === "sawtooth") {
    const segment = index % 12;
    return 8 + segment * 7 + Math.random() * 10;
  }

  if (pattern === "duplicates") {
    const buckets = [12, 28, 44, 60, 76, 92];
    return buckets[index % buckets.length];
  }

  return Math.floor(Math.random() * 94) + 5;
}

function generateArray() {
  const size = Number(sizeSlider.value);
  const pattern = patternSel.value;
  array = Array.from({ length: size }, (_, index) => Math.round(patternValue(index, size, pattern)));
  renderBars();
  resetMetrics();
  setStatus(`Generated ${size} ${patternSel.selectedOptions[0].textContent.toLowerCase()} values.`);
}

function renderBars() {
  visualizer.innerHTML = "";
  bars = array.map((value, index) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${value}%`;
    bar.style.setProperty("--i", index);
    bar.setAttribute("aria-label", `Value ${value}`);
    visualizer.appendChild(bar);
    return bar;
  });
}

function clearBarStates() {
  bars.forEach((bar) => bar.classList.remove("compare", "swap", "sorted", "pivot"));
}

function setControlsDisabled(disabled) {
  startBtn.disabled = disabled;
  resetBtn.disabled = false;
  resetBtn.textContent = disabled ? "Stop" : "Reset";
  generateBtn.disabled = disabled;
  algorithmSel.disabled = disabled;
  patternSel.disabled = disabled;
  sizeSlider.disabled = disabled;
  pauseBtn.disabled = !disabled;
}

function setValue(index, value) {
  array[index] = value;
  metrics.writes += 1;
  bars[index].style.height = `${value}%`;
  bars[index].setAttribute("aria-label", `Value ${value}`);
}

function swap(i, j) {
  if (i === j) return;
  const temp = array[i];
  setValue(i, array[j]);
  setValue(j, temp);
  metrics.swaps += 1;
}

async function highlight(indices, className = "compare", token) {
  assertRunActive(token);
  indices.forEach((index) => bars[index]?.classList.add(className));
  await sleep(token);
  indices.forEach((index) => bars[index]?.classList.remove(className));
}

async function compare(i, j, token) {
  metrics.comparisons += 1;
  await highlight([i, j], "compare", token);
  updateMetricDisplay();
  return array[i] - array[j];
}

function markSorted(start = 0, end = bars.length - 1) {
  for (let index = start; index <= end; index += 1) {
    bars[index]?.classList.add("sorted");
  }
}

async function bubbleSort(token) {
  const n = array.length;
  for (let i = 0; i < n - 1; i += 1) {
    assertRunActive(token);
    let swapped = false;
    for (let j = 0; j < n - i - 1; j += 1) {
      if ((await compare(j, j + 1, token)) > 0) {
        bars[j].classList.add("swap");
        bars[j + 1].classList.add("swap");
        swap(j, j + 1);
        swapped = true;
        await sleep(token);
        bars[j].classList.remove("swap");
        bars[j + 1].classList.remove("swap");
      }
    }
    bars[n - i - 1].classList.add("sorted");
    if (!swapped) break;
  }
  markSorted();
}

async function selectionSort(token) {
  const n = array.length;
  for (let i = 0; i < n - 1; i += 1) {
    assertRunActive(token);
    let minIdx = i;
    bars[minIdx].classList.add("pivot");

    for (let j = i + 1; j < n; j += 1) {
      metrics.comparisons += 1;
      bars[j].classList.add("compare");
      await sleep(token);
      if (array[j] < array[minIdx]) {
        bars[minIdx].classList.remove("pivot");
        minIdx = j;
        bars[minIdx].classList.add("pivot");
      }
      bars[j].classList.remove("compare");
      updateMetricDisplay();
    }

    if (minIdx !== i) {
      bars[i].classList.add("swap");
      bars[minIdx].classList.add("swap");
      swap(i, minIdx);
      await sleep(token);
      bars[i].classList.remove("swap");
      bars[minIdx].classList.remove("swap");
    }

    bars[minIdx].classList.remove("pivot");
    bars[i].classList.add("sorted");
  }
  markSorted();
}

async function insertionSort(token) {
  for (let i = 1; i < array.length; i += 1) {
    assertRunActive(token);
    const key = array[i];
    let j = i - 1;
    bars[i].classList.add("pivot");

    while (j >= 0) {
      metrics.comparisons += 1;
      bars[j].classList.add("compare");
      await sleep(token);
      bars[j].classList.remove("compare");

      if (array[j] <= key) break;
      bars[j + 1].classList.add("swap");
      setValue(j + 1, array[j]);
      await sleep(token);
      bars[j + 1].classList.remove("swap");
      j -= 1;
      updateMetricDisplay();
    }

    setValue(j + 1, key);
    bars[i].classList.remove("pivot");
    markSorted(0, i);
    updateMetricDisplay();
    await sleep(token);
  }
  markSorted();
}

async function quickSort(token, low = 0, high = array.length - 1) {
  assertRunActive(token);
  if (low < high) {
    const pivotIdx = await partition(low, high, token);
    bars[pivotIdx].classList.add("sorted");
    await quickSort(token, low, pivotIdx - 1);
    await quickSort(token, pivotIdx + 1, high);
  } else if (low === high) {
    bars[low].classList.add("sorted");
  }

  if (low === 0 && high === array.length - 1) {
    markSorted();
  }
}

async function partition(low, high, token) {
  const pivotValue = array[high];
  bars[high].classList.add("pivot");
  let i = low - 1;

  for (let j = low; j < high; j += 1) {
    metrics.comparisons += 1;
    bars[j].classList.add("compare");
    await sleep(token);

    if (array[j] <= pivotValue) {
      i += 1;
      if (i !== j) {
        bars[i].classList.add("swap");
        bars[j].classList.add("swap");
        swap(i, j);
        await sleep(token);
        bars[i].classList.remove("swap");
        bars[j].classList.remove("swap");
      }
    }

    bars[j].classList.remove("compare");
    updateMetricDisplay();
  }

  bars[high].classList.remove("pivot");
  bars[i + 1].classList.add("swap");
  bars[high].classList.add("swap");
  swap(i + 1, high);
  await sleep(token);
  bars[i + 1].classList.remove("swap");
  bars[high].classList.remove("swap");
  return i + 1;
}

async function mergeSort(token, left = 0, right = array.length - 1) {
  assertRunActive(token);
  if (left >= right) return;
  const mid = Math.floor((left + right) / 2);
  await mergeSort(token, left, mid);
  await mergeSort(token, mid + 1, right);
  await merge(left, mid, right, token);

  if (left === 0 && right === array.length - 1) {
    markSorted();
  }
}

async function merge(left, mid, right, token) {
  const leftRun = array.slice(left, mid + 1);
  const rightRun = array.slice(mid + 1, right + 1);
  let i = 0;
  let j = 0;
  let k = left;

  while (i < leftRun.length && j < rightRun.length) {
    metrics.comparisons += 1;
    bars[left + i].classList.add("compare");
    bars[mid + 1 + j].classList.add("compare");
    await sleep(token);
    bars[left + i].classList.remove("compare");
    bars[mid + 1 + j].classList.remove("compare");

    const nextValue = leftRun[i] <= rightRun[j] ? leftRun[i++] : rightRun[j++];
    bars[k].classList.add("swap");
    setValue(k, nextValue);
    await sleep(token);
    bars[k].classList.remove("swap");
    updateMetricDisplay();
    k += 1;
  }

  while (i < leftRun.length) {
    bars[k].classList.add("swap");
    setValue(k, leftRun[i]);
    await sleep(token);
    bars[k].classList.remove("swap");
    i += 1;
    k += 1;
  }

  while (j < rightRun.length) {
    bars[k].classList.add("swap");
    setValue(k, rightRun[j]);
    await sleep(token);
    bars[k].classList.remove("swap");
    j += 1;
    k += 1;
  }
}

async function heapSort(token) {
  const n = array.length;

  async function siftDown(root, end) {
    while (root * 2 + 1 <= end) {
      assertRunActive(token);
      let child = root * 2 + 1;
      let candidate = root;

      metrics.comparisons += 1;
      await highlight([candidate, child], "compare", token);
      if (array[candidate] < array[child]) {
        candidate = child;
      }

      if (child + 1 <= end) {
        metrics.comparisons += 1;
        await highlight([candidate, child + 1], "compare", token);
        if (array[candidate] < array[child + 1]) {
          candidate = child + 1;
        }
      }

      updateMetricDisplay();
      if (candidate === root) return;

      bars[root].classList.add("swap");
      bars[candidate].classList.add("swap");
      swap(root, candidate);
      await sleep(token);
      bars[root].classList.remove("swap");
      bars[candidate].classList.remove("swap");
      root = candidate;
    }
  }

  for (let start = Math.floor(n / 2) - 1; start >= 0; start -= 1) {
    bars[start].classList.add("pivot");
    await siftDown(start, n - 1);
    bars[start].classList.remove("pivot");
  }

  for (let end = n - 1; end > 0; end -= 1) {
    bars[0].classList.add("swap");
    bars[end].classList.add("swap");
    swap(0, end);
    await sleep(token);
    bars[0].classList.remove("swap");
    bars[end].classList.remove("swap");
    bars[end].classList.add("sorted");
    await siftDown(0, end - 1);
  }

  markSorted();
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    runHistory = Array.isArray(saved) ? saved.slice(0, MAX_HISTORY) : [];
  } catch {
    runHistory = [];
  }
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(runHistory));
}

function renderHistory() {
  historyBody.replaceChildren(...runHistory.map((entry) => {
    const row = document.createElement("tr");
    [entry.algorithm, entry.dataset, entry.size, entry.comparisons, entry.writes, entry.elapsed].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.appendChild(cell);
    });
    return row;
  }));
  emptyHistory.hidden = runHistory.length > 0;
}

function addHistoryEntry(entry) {
  runHistory = [entry, ...runHistory].slice(0, MAX_HISTORY);
  saveHistory();
  renderHistory();
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportHistoryCsv() {
  if (runHistory.length === 0) {
    setStatus("Run history is empty, so there is nothing to export.");
    return;
  }

  const header = ["Algorithm", "Dataset", "Size", "Comparisons", "Writes", "Elapsed"];
  const rows = runHistory.map((entry) => [
    entry.algorithm,
    entry.dataset,
    entry.size,
    entry.comparisons,
    entry.writes,
    entry.elapsed,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  downloadText("sorting-lab-history.csv", `${csv}\n`, "text/csv;charset=utf-8");
  setStatus("Run history exported as CSV.");
}

async function copyLabSummary() {
  const info = ALGORITHMS[algorithmSel.value];
  const latest = runHistory[0];
  const summary = [
    `Algorithm: ${info.name}`,
    `Dataset: ${patternSel.selectedOptions[0].textContent}`,
    `Size: ${array.length}`,
    `Complexity: best ${info.best}, average ${info.average}, worst ${info.worst}`,
    `Memory: ${info.memory}`,
    `Stability: ${info.stable ? "stable" : "unstable"}`,
    latest
      ? `Latest run: ${latest.comparisons} comparisons, ${latest.writes} writes, ${latest.elapsed}`
      : "Latest run: none yet",
  ].join("\n");

  try {
    await navigator.clipboard.writeText(summary);
    setStatus("Lab summary copied.");
  } catch {
    downloadText("sorting-lab-summary.txt", `${summary}\n`, "text/plain;charset=utf-8");
    setStatus("Clipboard unavailable, so the summary was downloaded instead.");
  }
}

async function startSort() {
  if (isSorting) return;
  const token = activeRunToken + 1;
  activeRunToken = token;
  const algorithmInfo = ALGORITHMS[algorithmSel.value];
  const datasetName = patternSel.selectedOptions[0].textContent;
  const runSize = array.length;

  isSorting = true;
  isPaused = false;
  pauseBtn.textContent = "Pause";
  setControlsDisabled(true);
  clearBarStates();
  resetMetrics();
  startedAt = performance.now();
  timerId = setInterval(updateMetricDisplay, 100);
  setStatus(`Running ${algorithmInfo.name} on ${datasetName.toLowerCase()} data.`);

  const algorithms = {
    bubble: bubbleSort,
    selection: selectionSort,
    insertion: insertionSort,
    quick: quickSort,
    merge: mergeSort,
    heap: heapSort,
  };

  try {
    await algorithms[algorithmSel.value](token);
    const elapsed = `${(getElapsedMs() / 1000).toFixed(1)}s`;
    addHistoryEntry({
      algorithm: algorithmInfo.name,
      dataset: datasetName,
      size: runSize,
      comparisons: metrics.comparisons,
      writes: metrics.writes,
      elapsed,
    });
    setStatus(`${algorithmInfo.name} completed in ${elapsed}.`);
  } catch (error) {
    if (error.message !== CANCELLED_SORT) {
      console.error(error);
      setStatus("The run stopped because an unexpected error occurred.");
    }
  } finally {
    if (token === activeRunToken) {
      isSorting = false;
      isPaused = false;
      clearInterval(timerId);
      timerId = null;
      updateMetricDisplay();
      setControlsDisabled(false);
      pauseBtn.textContent = "Pause";
    }
  }
}

function reset() {
  if (isSorting) {
    activeRunToken += 1;
    isSorting = false;
    isPaused = false;
    clearInterval(timerId);
    timerId = null;
    pauseBtn.textContent = "Pause";
    setControlsDisabled(false);
    clearBarStates();
    updateMetricDisplay();
    setStatus("Run stopped. The current array state is preserved.");
    return;
  }
  generateArray();
}

function togglePause() {
  if (!isSorting) return;
  isPaused = !isPaused;
  if (isPaused) {
    pausedAt = performance.now();
    pauseBtn.textContent = "Resume";
    setStatus("Run paused.");
  } else {
    pausedTotal += performance.now() - pausedAt;
    pausedAt = 0;
    pauseBtn.textContent = "Pause";
    setStatus(`Resumed ${ALGORITHMS[algorithmSel.value].name}.`);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  themeToggle.textContent = next === "dark" ? "Light" : "Dark";
  localStorage.setItem("theme", next);
}

function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  themeToggle.textContent = saved === "dark" ? "Light" : "Dark";
}

function updateControlLabels() {
  sizeValue.textContent = sizeSlider.value;
  speedValue.textContent = speedSlider.value;
}

function updateAlgorithmCopy() {
  const info = ALGORITHMS[algorithmSel.value];
  algoName.textContent = info.name;
  algoTitle.textContent = info.title;
  noteTitle.textContent = `How ${info.name} behaves`;
  noteBody.textContent = info.note;
  complexityBadge.textContent = info.complexity;
  bestCase.textContent = info.best;
  averageCase.textContent = info.average;
  worstCase.textContent = info.worst;
  memoryUse.textContent = info.memory;
  stabilityBadge.textContent = info.stable ? "Stable" : "Unstable";
  stabilityBadge.dataset.kind = info.stable ? "stable" : "unstable";
}

sizeSlider.addEventListener("input", () => {
  updateControlLabels();
  if (!isSorting) generateArray();
});

speedSlider.addEventListener("input", updateControlLabels);
patternSel.addEventListener("change", generateArray);
algorithmSel.addEventListener("change", updateAlgorithmCopy);
startBtn.addEventListener("click", startSort);
pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", reset);
generateBtn.addEventListener("click", reset);
themeToggle.addEventListener("click", toggleTheme);
clearHistoryBtn.addEventListener("click", () => {
  runHistory = [];
  saveHistory();
  renderHistory();
  setStatus("Run history cleared.");
});
copySummaryBtn.addEventListener("click", copyLabSummary);
exportHistoryBtn.addEventListener("click", exportHistoryCsv);

initTheme();
loadHistory();
renderHistory();
updateControlLabels();
updateAlgorithmCopy();
generateArray();
