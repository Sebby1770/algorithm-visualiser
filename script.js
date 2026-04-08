/* ============================================================
   Sorting Algorithm Visualizer
   Vanilla JS — no frameworks
   ============================================================ */

// ---------- DOM references ----------
const visualizer   = document.getElementById("visualizer");
const algorithmSel = document.getElementById("algorithm");
const sizeSlider   = document.getElementById("size");
const speedSlider  = document.getElementById("speed");
const sizeValue    = document.getElementById("sizeValue");
const speedValue   = document.getElementById("speedValue");
const startBtn     = document.getElementById("startBtn");
const resetBtn     = document.getElementById("resetBtn");
const generateBtn  = document.getElementById("generateBtn");
const themeToggle  = document.getElementById("themeToggle");

// ---------- State ----------
let array = [];         // current array values
let bars = [];          // DOM references to bar elements
let isSorting = false;  // lock controls while sorting

// ---------- Utilities ----------

/**
 * Sleep for a duration based on the current speed slider.
 * Higher slider value = shorter delay = faster animation.
 */
function sleep() {
  // Invert the slider: 1 -> ~200ms, 100 -> ~2ms
  const delay = 202 - speedSlider.value * 2;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/** Swap two elements in the array and update their bar heights. */
function swap(i, j) {
  [array[i], array[j]] = [array[j], array[i]];
  bars[i].style.height = `${array[i]}%`;
  bars[j].style.height = `${array[j]}%`;
}

/** Generate a fresh random array and render it as bars. */
function generateArray() {
  const size = parseInt(sizeSlider.value, 10);
  array = Array.from({ length: size }, () => Math.floor(Math.random() * 95) + 5);
  renderBars();
}

/** Build bar DOM elements from the current array. */
function renderBars() {
  visualizer.innerHTML = "";
  bars = array.map(value => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${value}%`;
    visualizer.appendChild(bar);
    return bar;
  });
}

/** Enable or disable controls during sorting. */
function setControlsDisabled(disabled) {
  startBtn.disabled    = disabled;
  resetBtn.disabled    = disabled;
  generateBtn.disabled = disabled;
  algorithmSel.disabled = disabled;
  sizeSlider.disabled  = disabled;
}

// ============================================================
//  Sorting Algorithms
//  Each algorithm is async so we can await sleep() between steps.
// ============================================================

/** Bubble Sort — repeatedly swap adjacent out-of-order pairs. */
async function bubbleSort() {
  const n = array.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      // Highlight the pair being compared
      bars[j].classList.add("compare");
      bars[j + 1].classList.add("compare");
      await sleep();

      if (array[j] > array[j + 1]) {
        // Highlight the swap, perform it, then clear
        bars[j].classList.add("swap");
        bars[j + 1].classList.add("swap");
        swap(j, j + 1);
        await sleep();
        bars[j].classList.remove("swap");
        bars[j + 1].classList.remove("swap");
      }

      bars[j].classList.remove("compare");
      bars[j + 1].classList.remove("compare");
    }
    // The last element of this pass is now in its final position
    bars[n - i - 1].classList.add("sorted");
  }
  bars[0].classList.add("sorted");
}

/** Selection Sort — find min in unsorted region, swap to front. */
async function selectionSort() {
  const n = array.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    bars[minIdx].classList.add("compare");

    for (let j = i + 1; j < n; j++) {
      bars[j].classList.add("compare");
      await sleep();

      if (array[j] < array[minIdx]) {
        // New minimum found — unhighlight previous min
        bars[minIdx].classList.remove("compare");
        minIdx = j;
      } else {
        bars[j].classList.remove("compare");
      }
    }

    if (minIdx !== i) {
      bars[i].classList.add("swap");
      bars[minIdx].classList.add("swap");
      swap(i, minIdx);
      await sleep();
      bars[i].classList.remove("swap");
      bars[minIdx].classList.remove("swap");
    }

    bars[minIdx].classList.remove("compare");
    bars[i].classList.add("sorted");
  }
  bars[n - 1].classList.add("sorted");
}

/** Quick Sort — Lomuto partition scheme, recursive. */
async function quickSort(low = 0, high = array.length - 1) {
  if (low < high) {
    const pivotIdx = await partition(low, high);
    await quickSort(low, pivotIdx - 1);
    await quickSort(pivotIdx + 1, high);
  }
  // On the outer call, mark everything sorted
  if (low === 0 && high === array.length - 1) {
    bars.forEach(bar => bar.classList.add("sorted"));
  }
}

/** Partition helper for quickSort — uses last element as pivot. */
async function partition(low, high) {
  const pivotValue = array[high];
  bars[high].classList.add("swap"); // pivot highlighted in swap color
  let i = low - 1;

  for (let j = low; j < high; j++) {
    bars[j].classList.add("compare");
    await sleep();

    if (array[j] < pivotValue) {
      i++;
      if (i !== j) swap(i, j);
    }
    bars[j].classList.remove("compare");
  }

  // Place pivot in its correct position
  swap(i + 1, high);
  bars[high].classList.remove("swap");
  bars[i + 1].classList.add("sorted");
  return i + 1;
}

// ============================================================
//  Event Handlers
// ============================================================

/** Start the selected sorting algorithm. */
async function startSort() {
  if (isSorting) return;
  isSorting = true;
  setControlsDisabled(true);

  // Clear any leftover state classes from a previous run
  bars.forEach(bar => bar.classList.remove("compare", "swap", "sorted"));

  const algo = algorithmSel.value;
  if (algo === "bubble")         await bubbleSort();
  else if (algo === "selection") await selectionSort();
  else if (algo === "quick")     await quickSort();

  isSorting = false;
  setControlsDisabled(false);
}

/** Reset to a new random array. */
function reset() {
  if (isSorting) return;
  generateArray();
}

/** Toggle between light and dark themes. */
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  localStorage.setItem("theme", next);
}

/** Restore saved theme on load. */
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  themeToggle.textContent = saved === "dark" ? "☀️" : "🌙";
}

// ---------- Wire up events ----------
sizeSlider.addEventListener("input", () => {
  sizeValue.textContent = sizeSlider.value;
  if (!isSorting) generateArray();
});

speedSlider.addEventListener("input", () => {
  speedValue.textContent = speedSlider.value;
});

startBtn.addEventListener("click", startSort);
resetBtn.addEventListener("click", reset);
generateBtn.addEventListener("click", reset);
themeToggle.addEventListener("click", toggleTheme);

// ---------- Initial setup ----------
initTheme();
generateArray();
