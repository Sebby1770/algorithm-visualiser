/* ============================================================
   Sort Lab — pure sorting algorithms
   Works in the browser (global SortCore) and Node (CJS).
   Input arrays are never mutated. Results include operation counts.
   ============================================================ */

(function (root) {
  const ALGORITHM_IDS = [
    "bubble",
    "selection",
    "insertion",
    "merge",
    "quick",
    "heap",
    "shell",
    "radix",
    "counting",
    "cocktail",
    "comb",
    "gnome",
    "oddeven",
    "pancake",
    "cycle",
    "timsort",
  ];

  function stats() {
    return { comparisons: 0, swaps: 0, writes: 0 };
  }

  function finish(array, s) {
    return {
      array: array,
      comparisons: s.comparisons,
      swaps: s.swaps,
      writes: s.writes,
    };
  }

  function swapAt(array, i, j, s) {
    const t = array[i];
    array[i] = array[j];
    array[j] = t;
    s.swaps++;
    s.writes += 2;
  }

  function isSorted(arr) {
    if (!arr || arr.length < 2) return true;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < arr[i - 1]) return false;
    }
    return true;
  }

  function bubble(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    for (let i = 0; i < n - 1; i++) {
      let swapped = false;
      for (let j = 0; j < n - i - 1; j++) {
        s.comparisons++;
        if (array[j] > array[j + 1]) {
          swapAt(array, j, j + 1, s);
          swapped = true;
        }
      }
      if (!swapped) break;
    }
    return finish(array, s);
  }

  function selection(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    for (let i = 0; i < n - 1; i++) {
      let minIdx = i;
      for (let j = i + 1; j < n; j++) {
        s.comparisons++;
        if (array[j] < array[minIdx]) minIdx = j;
      }
      if (minIdx !== i) swapAt(array, i, minIdx, s);
    }
    return finish(array, s);
  }

  function insertion(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    for (let i = 1; i < n; i++) {
      let j = i;
      while (j > 0) {
        s.comparisons++;
        if (array[j - 1] > array[j]) {
          swapAt(array, j - 1, j, s);
          j--;
        } else {
          break;
        }
      }
    }
    return finish(array, s);
  }

  function mergeSort(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    if (n < 2) return finish(array, s);
    const aux = array.slice();

    function merge(low, mid, high) {
      for (let k = low; k <= high; k++) aux[k] = array[k];
      let i = low;
      let j = mid + 1;
      let k = low;
      while (i <= mid && j <= high) {
        s.comparisons++;
        if (aux[i] <= aux[j]) {
          array[k] = aux[i];
          i++;
        } else {
          array[k] = aux[j];
          j++;
        }
        s.writes++;
        k++;
      }
      while (i <= mid) {
        array[k] = aux[i];
        s.writes++;
        i++;
        k++;
      }
      while (j <= high) {
        array[k] = aux[j];
        s.writes++;
        j++;
        k++;
      }
    }

    function sortRange(low, high) {
      if (low >= high) return;
      const mid = (low + high) >> 1;
      sortRange(low, mid);
      sortRange(mid + 1, high);
      merge(low, mid, high);
    }

    sortRange(0, n - 1);
    return finish(array, s);
  }

  function quick(input) {
    const array = input.slice();
    const s = stats();

    function partition(low, high) {
      const pivot = array[high];
      let i = low - 1;
      for (let j = low; j < high; j++) {
        s.comparisons++;
        if (array[j] < pivot) {
          i++;
          if (i !== j) swapAt(array, i, j, s);
        }
      }
      swapAt(array, i + 1, high, s);
      return i + 1;
    }

    function sortRange(low, high) {
      if (low >= high) return;
      const p = partition(low, high);
      sortRange(low, p - 1);
      sortRange(p + 1, high);
    }

    sortRange(0, array.length - 1);
    return finish(array, s);
  }

  function heap(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;

    function heapify(size, root) {
      let largest = root;
      const left = root * 2 + 1;
      const right = left + 1;
      if (left < size) {
        s.comparisons++;
        if (array[left] > array[largest]) largest = left;
      }
      if (right < size) {
        s.comparisons++;
        if (array[right] > array[largest]) largest = right;
      }
      if (largest !== root) {
        swapAt(array, root, largest, s);
        heapify(size, largest);
      }
    }

    for (let i = (n >> 1) - 1; i >= 0; i--) heapify(n, i);
    for (let i = n - 1; i > 0; i--) {
      swapAt(array, 0, i, s);
      heapify(i, 0);
    }
    return finish(array, s);
  }

  function shell(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    let gap = n >> 1;
    while (gap > 0) {
      for (let i = gap; i < n; i++) {
        const temp = array[i];
        let j = i;
        while (j >= gap) {
          s.comparisons++;
          if (array[j - gap] > temp) {
            array[j] = array[j - gap];
            s.writes++;
            j -= gap;
          } else {
            break;
          }
        }
        if (j !== i) {
          array[j] = temp;
          s.writes++;
        }
      }
      gap = gap >> 1;
    }
    return finish(array, s);
  }

  function radix(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    if (!n) return finish(array, s);
    let max = array[0];
    for (let i = 1; i < n; i++) {
      if (array[i] > max) max = array[i];
    }
    if (max < 0) max = 0;
    let exp = 1;
    const output = new Array(n);
    while (Math.floor(max / exp) > 0) {
      const count = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        count[Math.floor(array[i] / exp) % 10]++;
      }
      for (let i = 1; i < 10; i++) count[i] += count[i - 1];
      for (let i = n - 1; i >= 0; i--) {
        const d = Math.floor(array[i] / exp) % 10;
        count[d]--;
        output[count[d]] = array[i];
      }
      for (let i = 0; i < n; i++) {
        array[i] = output[i];
        s.writes++;
      }
      exp *= 10;
    }
    return finish(array, s);
  }

  function counting(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    if (!n) return finish(array, s);
    let min = array[0];
    let max = array[0];
    for (let i = 1; i < n; i++) {
      if (array[i] < min) min = array[i];
      if (array[i] > max) max = array[i];
    }
    const range = max - min + 1;
    const count = new Array(range).fill(0);
    for (let i = 0; i < n; i++) count[array[i] - min]++;
    for (let i = 1; i < range; i++) count[i] += count[i - 1];
    const output = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      const b = array[i] - min;
      count[b]--;
      output[count[b]] = array[i];
    }
    for (let i = 0; i < n; i++) {
      array[i] = output[i];
      s.writes++;
    }
    return finish(array, s);
  }

  function cocktail(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    let start = 0;
    let end = n - 1;
    while (start < end) {
      let swapped = false;
      for (let i = start; i < end; i++) {
        s.comparisons++;
        if (array[i] > array[i + 1]) {
          swapAt(array, i, i + 1, s);
          swapped = true;
        }
      }
      end--;
      if (!swapped || start >= end) break;
      swapped = false;
      for (let i = end; i > start; i--) {
        s.comparisons++;
        if (array[i - 1] > array[i]) {
          swapAt(array, i - 1, i, s);
          swapped = true;
        }
      }
      start++;
      if (!swapped) break;
    }
    return finish(array, s);
  }

  function comb(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    const shrink = 1.3;
    let gap = n;
    let sorted = false;
    while (!sorted) {
      gap = Math.floor(gap / shrink);
      if (gap <= 1) {
        gap = 1;
        sorted = true;
      }
      for (let i = 0; i + gap < n; i++) {
        s.comparisons++;
        if (array[i] > array[i + gap]) {
          swapAt(array, i, i + gap, s);
          sorted = false;
        }
      }
    }
    return finish(array, s);
  }

  function gnome(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    let i = 0;
    while (i < n) {
      if (i === 0) {
        i++;
        continue;
      }
      s.comparisons++;
      if (array[i] >= array[i - 1]) {
        i++;
      } else {
        swapAt(array, i - 1, i, s);
        i--;
      }
    }
    return finish(array, s);
  }

  function oddeven(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    let sorted = false;
    while (!sorted) {
      sorted = true;
      for (let i = 1; i < n - 1; i += 2) {
        s.comparisons++;
        if (array[i] > array[i + 1]) {
          swapAt(array, i, i + 1, s);
          sorted = false;
        }
      }
      for (let i = 0; i < n - 1; i += 2) {
        s.comparisons++;
        if (array[i] > array[i + 1]) {
          swapAt(array, i, i + 1, s);
          sorted = false;
        }
      }
    }
    return finish(array, s);
  }

  function pancake(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;

    function flip(k) {
      let i = 0;
      let j = k;
      while (i < j) {
        swapAt(array, i, j, s);
        i++;
        j--;
      }
    }

    for (let curr = n; curr > 1; curr--) {
      let maxIdx = 0;
      for (let i = 1; i < curr; i++) {
        s.comparisons++;
        if (array[i] > array[maxIdx]) maxIdx = i;
      }
      if (maxIdx === curr - 1) continue;
      if (maxIdx !== 0) flip(maxIdx);
      flip(curr - 1);
    }
    return finish(array, s);
  }

  /**
   * Cycle sort — rotate each cycle into place. ~O(n) writes, O(n²) compares.
   */
  function cycle(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;

    for (let cycleStart = 0; cycleStart < n - 1; cycleStart++) {
      let item = array[cycleStart];
      let pos = cycleStart;
      for (let i = cycleStart + 1; i < n; i++) {
        s.comparisons++;
        if (array[i] < item) pos++;
      }
      if (pos === cycleStart) continue;
      while (pos < n && item === array[pos]) pos++;
      if (pos >= n) continue;
      {
        const displaced = array[pos];
        array[pos] = item;
        s.writes++;
        item = displaced;
      }
      while (pos !== cycleStart) {
        pos = cycleStart;
        for (let i = cycleStart + 1; i < n; i++) {
          s.comparisons++;
          if (array[i] < item) pos++;
        }
        while (pos < n && item === array[pos]) pos++;
        if (pos >= n) break;
        const displaced = array[pos];
        array[pos] = item;
        s.writes++;
        item = displaced;
      }
    }
    return finish(array, s);
  }

  function computeMinrun(n) {
    if (n < 2) return n;
    // Teaching-scale arrays: cap at 16 so natural runs still merge.
    // For n >= 64, follow CPython (range 32..64 so n/minrun is near a power of 2).
    if (n < 64) return Math.min(16, n);
    let r = 0;
    while (n >= 64) {
      r |= n & 1;
      n >>= 1;
    }
    return n + r;
  }

  function reverseRange(array, lo, hi, s) {
    while (lo < hi) {
      swapAt(array, lo, hi, s);
      lo++;
      hi--;
    }
  }

  function insertionSortRange(array, lo, hi, s) {
    for (let i = lo + 1; i <= hi; i++) {
      let j = i;
      while (j > lo) {
        s.comparisons++;
        if (array[j - 1] > array[j]) {
          swapAt(array, j - 1, j, s);
          j--;
        } else {
          break;
        }
      }
    }
  }

  /**
   * Simplified Timsort: natural runs (reverse descending so all ascend),
   * insertion-sort extend to minrun, then pairwise merge.
   */
  function timsort(input) {
    const array = input.slice();
    const s = stats();
    const n = array.length;
    if (n < 2) return finish(array, s);

    const minrun = computeMinrun(n);
    const aux = array.slice();

    function merge(low, mid, high) {
      for (let k = low; k <= high; k++) aux[k] = array[k];
      let i = low;
      let j = mid + 1;
      let k = low;
      while (i <= mid && j <= high) {
        s.comparisons++;
        if (aux[i] <= aux[j]) {
          array[k] = aux[i];
          i++;
        } else {
          array[k] = aux[j];
          j++;
        }
        s.writes++;
        k++;
      }
      while (i <= mid) {
        array[k] = aux[i];
        s.writes++;
        i++;
        k++;
      }
      while (j <= high) {
        array[k] = aux[j];
        s.writes++;
        j++;
        k++;
      }
    }

    function countRunAndMakeAscending(lo) {
      if (lo + 1 >= n) return 1;
      let hi = lo + 1;
      s.comparisons++;
      if (array[lo] > array[hi]) {
        while (hi + 1 < n) {
          s.comparisons++;
          if (array[hi] > array[hi + 1]) hi++;
          else break;
        }
        reverseRange(array, lo, hi, s);
      } else {
        while (hi + 1 < n) {
          s.comparisons++;
          if (array[hi] < array[hi + 1]) hi++;
          else break;
        }
      }
      return hi - lo + 1;
    }

    const runs = [];
    let i = 0;
    while (i < n) {
      let runLen = countRunAndMakeAscending(i);
      if (runLen < minrun) {
        const extendTo = Math.min(i + minrun, n) - 1;
        insertionSortRange(array, i, extendTo, s);
        runLen = extendTo - i + 1;
      }
      runs.push({ lo: i, hi: i + runLen - 1 });
      i += runLen;
    }

    while (runs.length > 1) {
      const next = [];
      for (let r = 0; r < runs.length; r += 2) {
        if (r + 1 < runs.length) {
          const a = runs[r];
          const b = runs[r + 1];
          merge(a.lo, a.hi, b.hi);
          next.push({ lo: a.lo, hi: b.hi });
        } else {
          next.push(runs[r]);
        }
      }
      runs.length = 0;
      for (let r = 0; r < next.length; r++) runs.push(next[r]);
    }

    return finish(array, s);
  }

  const ALGORITHMS = {
    bubble,
    selection,
    insertion,
    merge: mergeSort,
    quick,
    heap,
    shell,
    radix,
    counting,
    cocktail,
    comb,
    gnome,
    oddeven,
    pancake,
    cycle,
    timsort,
  };

  function sort(id, arr) {
    const fn = ALGORITHMS[id];
    if (!fn) throw new Error("Unknown algorithm: " + id);
    return fn(arr);
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function valueFromIndex(i, size) {
    return Math.floor(((i + 1) / size) * 90) + 5;
  }

  function generateDataset(type, size) {
    size = size | 0;
    if (size < 0) size = 0;
    if (type === "nearly") type = "nearly-sorted";
    if (type === "fewunique") type = "few-unique";

    switch (type) {
      case "sorted":
        return Array.from({ length: size }, (_, i) => valueFromIndex(i, size));

      case "reversed":
        return Array.from({ length: size }, (_, i) => valueFromIndex(size - 1 - i, size));

      case "nearly-sorted": {
        const arr = Array.from({ length: size }, (_, i) => valueFromIndex(i, size));
        const swaps = Math.max(1, Math.floor(size * 0.05));
        for (let s = 0; s < swaps; s++) {
          const a = randomInt(0, Math.max(0, size - 1));
          const b = randomInt(0, Math.max(0, size - 1));
          const t = arr[a];
          arr[a] = arr[b];
          arr[b] = t;
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

  const api = {
    ALGORITHM_IDS: ALGORITHM_IDS.slice(),
    sort,
    isSorted,
    generateDataset,
    bubble,
    selection,
    insertion,
    merge: mergeSort,
    quick,
    heap,
    shell,
    radix,
    counting,
    cocktail,
    comb,
    gnome,
    oddeven,
    pancake,
    cycle,
    timsort,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SortCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
