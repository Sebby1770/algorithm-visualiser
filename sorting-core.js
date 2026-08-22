/* ============================================================
   Sort Lab — algorithm core
   Works in the browser (global SortCore) and Node (CJS).

   Every algorithm is a synchronous generator that mutates the
   array it is given and yields operation objects. The UI driver
   animates those operations; tests and the complexity profiler
   consume them headlessly. One implementation, three consumers.

   Operation vocabulary (t = type):
     compare {i, j}            counts 1 comparison, animated step
     swap    {i, j}            counts 1 swap + 2 writes (array already mutated)
     write   {i, value}        counts 1 write (array already mutated)
     touch   {i, cls}          no metric, animated flash (e.g. radix digit scan)
     counts  {counts, min, max, highlight, costWrites, access}
                               counting-array update; costWrites ∈ {0, 1}
     sorted  {i}               mark index as finally placed
     mark    {i, cls} / unmark {i, cls}   persistent highlight on an index
     narrate {text}            teaching-mode narration, free
     gap     {gap}             shell/comb gap changed, free
     digitExp {exp}            radix digit place changed, free
   ============================================================ */

(function (root) {
  "use strict";

  const identity = (v) => v;

  function ctxOf(opts) {
    return { key: (opts && opts.key) || identity };
  }

  // ---------- op helpers ----------
  const compare = (i, j) => ({ t: "compare", i, j });
  const sortedOp = (i) => ({ t: "sorted", i });
  const mark = (i, cls) => ({ t: "mark", i, cls });
  const unmark = (i, cls) => ({ t: "unmark", i, cls });
  const narrate = (text) => ({ t: "narrate", text });
  const touch = (i, cls) => ({ t: "touch", i, cls });

  function* doSwap(a, i, j) {
    [a[i], a[j]] = [a[j], a[i]];
    yield { t: "swap", i, j };
  }

  function* doWrite(a, i, value) {
    a[i] = value;
    yield { t: "write", i, value };
  }

  // ---------- classic ten ----------
  function* bubble(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - i - 1; j++) {
        yield compare(j, j + 1);
        if (key(a[j]) > key(a[j + 1])) yield* doSwap(a, j, j + 1);
      }
      yield sortedOp(n - i - 1);
    }
    if (n > 0) yield sortedOp(0);
  }

  function* selection(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    for (let i = 0; i < n - 1; i++) {
      let minIdx = i;
      yield mark(minIdx, "compare");
      for (let j = i + 1; j < n; j++) {
        yield compare(j, minIdx);
        if (key(a[j]) < key(a[minIdx])) {
          yield unmark(minIdx, "compare");
          minIdx = j;
          yield mark(minIdx, "compare");
        }
      }
      if (minIdx !== i) yield* doSwap(a, i, minIdx);
      yield unmark(minIdx, "compare");
      yield sortedOp(i);
    }
    if (n > 0) yield sortedOp(n - 1);
  }

  function* insertion(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    if (n > 0) yield sortedOp(0);
    for (let i = 1; i < n; i++) {
      let j = i;
      while (j > 0) {
        yield compare(j - 1, j);
        if (key(a[j - 1]) > key(a[j])) {
          yield* doSwap(a, j - 1, j);
          j--;
        } else {
          break;
        }
      }
      for (let k = 0; k <= i; k++) yield sortedOp(k);
    }
  }

  function* mergeRange(a, low, high, aux, key) {
    if (low >= high) return;
    const mid = Math.floor((low + high) / 2);
    yield narrate(`Merge sort: dividing range [${low}…${high}] at midpoint ${mid}.`);
    yield* mergeRange(a, low, mid, aux, key);
    yield* mergeRange(a, mid + 1, high, aux, key);

    yield narrate(`Merging sorted halves [${low}…${mid}] and [${mid + 1}…${high}].`);
    for (let k = low; k <= high; k++) aux[k] = a[k];
    let i = low;
    let j = mid + 1;
    let k = low;
    while (i <= mid && j <= high) {
      yield compare(i, j);
      if (key(aux[i]) <= key(aux[j])) {
        yield* doWrite(a, k, aux[i]);
        i++;
      } else {
        yield* doWrite(a, k, aux[j]);
        j++;
      }
      k++;
    }
    while (i <= mid) {
      yield* doWrite(a, k, aux[i]);
      i++;
      k++;
    }
    while (j <= high) {
      yield* doWrite(a, k, aux[j]);
      j++;
      k++;
    }
  }

  function* merge(a, opts) {
    const { key } = ctxOf(opts);
    yield* mergeRange(a, 0, a.length - 1, [...a], key);
  }

  function* quickRange(a, low, high, key) {
    if (low >= high) {
      if (low === high) yield sortedOp(low);
      return;
    }
    yield mark(high, "pivot");
    yield narrate(`Pivot selected at index ${high} (value ${a[high]}).`);
    const pivotValue = key(a[high]);
    let i = low - 1;
    for (let j = low; j < high; j++) {
      yield compare(j, high);
      if (key(a[j]) < pivotValue) {
        i++;
        if (i !== j) yield* doSwap(a, i, j);
      }
    }
    yield* doSwap(a, i + 1, high);
    yield unmark(high, "pivot");
    yield sortedOp(i + 1);
    yield* quickRange(a, low, i, key);
    yield* quickRange(a, i + 2, high, key);
  }

  function* quick(a, opts) {
    const { key } = ctxOf(opts);
    yield* quickRange(a, 0, a.length - 1, key);
  }

  function* heapify(a, size, root, key) {
    let largest = root;
    const left = 2 * root + 1;
    const right = 2 * root + 2;
    if (left < size) {
      yield compare(left, largest);
      if (key(a[left]) > key(a[largest])) largest = left;
    }
    if (right < size) {
      yield compare(right, largest);
      if (key(a[right]) > key(a[largest])) largest = right;
    }
    if (largest !== root) {
      yield* doSwap(a, root, largest);
      yield* heapify(a, size, largest, key);
    }
  }

  function* heap(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      yield* heapify(a, n, i, key);
    }
    for (let i = n - 1; i > 0; i--) {
      yield* doSwap(a, 0, i);
      yield sortedOp(i);
      yield* heapify(a, i, 0, key);
    }
    if (n > 0) yield sortedOp(0);
  }

  function* shell(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    let gap = Math.floor(n / 2);
    while (gap > 0) {
      yield { t: "gap", gap };
      yield narrate(`Shell sort: starting pass with gap = ${gap}.`);
      for (let i = gap; i < n; i++) {
        const temp = a[i];
        let j = i;
        yield mark(i, "gap");
        while (j >= gap) {
          yield compare(j - gap, j);
          if (key(a[j - gap]) > key(temp)) {
            yield* doWrite(a, j, a[j - gap]);
            j -= gap;
          } else {
            break;
          }
        }
        if (j !== i) yield* doWrite(a, j, temp);
        yield unmark(i, "gap");
      }
      gap = Math.floor(gap / 2);
    }
  }

  function* radix(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    if (n === 0) return;
    const max = Math.max(...a.map(key));
    const placeNames = ["ones", "tens", "hundreds"];
    let exp = 1;
    let pass = 0;
    while (Math.floor(max / exp) > 0) {
      yield { t: "digitExp", exp };
      const place = placeNames[pass] || `10^${pass}`;
      yield narrate(`Radix sort pass ${pass + 1}: sorting by ${place} digit.`);

      const output = new Array(n);
      const count = new Array(10).fill(0);
      for (let i = 0; i < n; i++) {
        const digit = Math.floor(key(a[i]) / exp) % 10;
        yield narrate(`Counting digit ${digit} at index ${i} (value ${a[i]}).`);
        count[digit]++;
        yield touch(i, "digit");
      }
      for (let i = 1; i < 10; i++) count[i] += count[i - 1];
      for (let i = n - 1; i >= 0; i--) {
        const digit = Math.floor(key(a[i]) / exp) % 10;
        const pos = count[digit] - 1;
        output[pos] = a[i];
        yield narrate(`Placing ${a[i]} into bucket position ${pos} (digit ${digit}).`);
        count[digit]--;
        yield touch(i, "digit");
      }
      for (let i = 0; i < n; i++) {
        yield* doWrite(a, i, output[i]);
        yield touch(i, "digit");
      }
      exp *= 10;
      pass++;
    }
  }

  function* counting(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    if (n === 0) return;
    const keys = a.map(key);
    const min = Math.min(...keys);
    const max = Math.max(...keys);
    const range = max - min + 1;
    const count = new Array(range).fill(0);
    yield narrate(`Counting sort: value range ${min}…${max} (${range} buckets).`);

    for (let i = 0; i < n; i++) {
      const bucket = key(a[i]) - min;
      count[bucket]++;
      yield narrate(`Incrementing count for value ${a[i]} (bucket ${bucket}).`);
      yield { t: "counts", counts: count.slice(), min, max, highlight: bucket, costWrites: 1, access: [i], cls: "bucket", idx: i };
    }
    for (let i = 1; i < range; i++) {
      count[i] += count[i - 1];
      yield narrate(`Prefix sum at bucket ${i}: cumulative count = ${count[i]}.`);
      yield { t: "counts", counts: count.slice(), min, max, highlight: i, costWrites: 0, access: [], cls: null, idx: -1 };
    }
    const output = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      const bucket = key(a[i]) - min;
      const pos = count[bucket] - 1;
      output[pos] = a[i];
      count[bucket]--;
      yield narrate(`Placing ${a[i]} at output position ${pos}.`);
      yield { t: "counts", counts: count.slice(), min, max, highlight: bucket, costWrites: 0, access: [i], cls: "bucket", idx: i };
    }
    for (let i = 0; i < n; i++) {
      yield* doWrite(a, i, output[i]);
      yield touch(i, "bucket");
    }
  }

  function* cocktail(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    let start = 0;
    let end = n - 1;
    while (start < end) {
      yield narrate(`Cocktail pass: scanning forward from ${start} to ${end}.`);
      for (let i = start; i < end; i++) {
        yield compare(i, i + 1);
        if (key(a[i]) > key(a[i + 1])) yield* doSwap(a, i, i + 1);
      }
      yield sortedOp(end);
      end--;
      if (start >= end) break;
      yield narrate(`Cocktail pass: scanning backward from ${end} to ${start}.`);
      for (let i = end; i > start; i--) {
        yield compare(i - 1, i);
        if (key(a[i - 1]) > key(a[i])) yield* doSwap(a, i - 1, i);
      }
      yield sortedOp(start);
      start++;
    }
    if (n > 0) yield sortedOp(start);
  }

  // ---------- the new four ----------
  function* comb(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    const SHRINK = 1.3;
    let gap = n;
    let swapped = true;
    while (gap > 1 || swapped) {
      gap = Math.max(1, Math.floor(gap / SHRINK));
      yield { t: "gap", gap };
      yield narrate(`Comb sort: comparing elements ${gap} apart.`);
      swapped = false;
      for (let i = 0; i + gap < n; i++) {
        yield compare(i, i + gap);
        if (key(a[i]) > key(a[i + gap])) {
          yield* doSwap(a, i, i + gap);
          swapped = true;
        }
      }
    }
    for (let i = 0; i < n; i++) yield sortedOp(i);
  }

  function* gnome(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    let pos = 0;
    while (pos < n) {
      if (pos === 0) {
        pos++;
        continue;
      }
      yield compare(pos - 1, pos);
      if (key(a[pos - 1]) <= key(a[pos])) {
        pos++;
      } else {
        yield* doSwap(a, pos - 1, pos);
        pos--;
        yield narrate(`Gnome steps back to index ${pos} after swapping.`);
      }
    }
    for (let i = 0; i < n; i++) yield sortedOp(i);
  }

  function* cycle(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    for (let cycleStart = 0; cycleStart < n - 1; cycleStart++) {
      let item = a[cycleStart];
      yield mark(cycleStart, "pivot");
      yield narrate(`Cycle sort: finding the final home of index ${cycleStart}.`);

      let pos = cycleStart;
      for (let i = cycleStart + 1; i < n; i++) {
        yield compare(i, cycleStart);
        if (key(a[i]) < key(item)) pos++;
      }
      if (pos === cycleStart) {
        yield unmark(cycleStart, "pivot");
        yield sortedOp(cycleStart);
        continue;
      }
      while (key(item) === key(a[pos])) pos++;
      let displaced = a[pos];
      yield* doWrite(a, pos, item);
      yield sortedOp(pos);
      item = displaced;

      while (pos !== cycleStart) {
        pos = cycleStart;
        for (let i = cycleStart + 1; i < n; i++) {
          yield compare(i, cycleStart);
          if (key(a[i]) < key(item)) pos++;
        }
        while (pos !== cycleStart && key(item) === key(a[pos])) pos++;
        displaced = a[pos];
        yield* doWrite(a, pos, item);
        if (pos !== cycleStart) yield sortedOp(pos);
        item = displaced;
      }
      yield unmark(cycleStart, "pivot");
      yield sortedOp(cycleStart);
    }
    if (n > 0) yield sortedOp(n - 1);
  }

  const TIM_MIN_RUN = 16;

  function* tim(a, opts) {
    const { key } = ctxOf(opts);
    const n = a.length;
    if (n === 0) return;

    yield narrate(`TimSort: insertion-sorting runs of up to ${TIM_MIN_RUN} elements.`);
    for (let start = 0; start < n; start += TIM_MIN_RUN) {
      const end = Math.min(start + TIM_MIN_RUN - 1, n - 1);
      for (let i = start + 1; i <= end; i++) {
        let j = i;
        while (j > start) {
          yield compare(j - 1, j);
          if (key(a[j - 1]) > key(a[j])) {
            yield* doSwap(a, j - 1, j);
            j--;
          } else {
            break;
          }
        }
      }
    }

    const aux = [...a];
    for (let width = TIM_MIN_RUN; width < n; width *= 2) {
      yield narrate(`TimSort: merging runs of width ${width}.`);
      for (let low = 0; low + width < n; low += width * 2) {
        const mid = low + width - 1;
        const high = Math.min(low + width * 2 - 1, n - 1);
        yield compare(mid, mid + 1);
        if (key(a[mid]) <= key(a[mid + 1])) continue; // already ordered — TimSort's galloping shortcut
        for (let k = low; k <= high; k++) aux[k] = a[k];
        let i = low;
        let j = mid + 1;
        let k = low;
        while (i <= mid && j <= high) {
          yield compare(i, j);
          if (key(aux[i]) <= key(aux[j])) {
            yield* doWrite(a, k, aux[i]);
            i++;
          } else {
            yield* doWrite(a, k, aux[j]);
            j++;
          }
          k++;
        }
        while (i <= mid) {
          yield* doWrite(a, k, aux[i]);
          i++;
          k++;
        }
        while (j <= high) {
          yield* doWrite(a, k, aux[j]);
          j++;
          k++;
        }
      }
    }
    for (let i = 0; i < n; i++) yield sortedOp(i);
  }

  const algorithms = {
    bubble,
    selection,
    insertion,
    merge,
    quick,
    heap,
    shell,
    radix,
    counting,
    cocktail,
    comb,
    gnome,
    cycle,
    tim,
  };

  // ---------- headless execution ----------
  const METRIC_STEP_TYPES = new Set(["compare", "swap", "write", "touch", "counts"]);

  function newMetrics() {
    return { comparisons: 0, swaps: 0, writes: 0, steps: 0 };
  }

  function applyMetric(metrics, op) {
    switch (op.t) {
      case "compare":
        metrics.comparisons++;
        break;
      case "swap":
        metrics.swaps++;
        metrics.writes += 2;
        break;
      case "write":
        metrics.writes++;
        break;
      case "counts":
        metrics.writes += op.costWrites || 0;
        break;
      default:
        break;
    }
    if (METRIC_STEP_TYPES.has(op.t)) metrics.steps++;
  }

  function totalOps(metrics) {
    return metrics.comparisons + metrics.swaps + metrics.writes;
  }

  function run(algorithmId, input, opts) {
    const algorithm = algorithms[algorithmId];
    if (!algorithm) throw new Error(`Unknown algorithm: ${algorithmId}`);
    const array = [...input];
    const metrics = newMetrics();
    for (const op of algorithm(array, opts)) applyMetric(metrics, op);
    return { array, metrics };
  }

  // ---------- complexity profiling ----------
  function benchmark(algorithmId, sizes, makeDataset, opts) {
    return sizes.map((n) => {
      const { metrics } = run(algorithmId, makeDataset(n), opts);
      return { n, ops: totalOps(metrics), metrics };
    });
  }

  /**
   * Least-squares slope of ln(ops) against ln(n): for ops ≈ c·n^k the
   * slope recovers k. Returns null when there are not enough points.
   */
  function estimateExponent(points) {
    const usable = points.filter((p) => p.n > 1 && p.ops > 0);
    if (usable.length < 2) return null;
    const xs = usable.map((p) => Math.log(p.n));
    const ys = usable.map((p) => Math.log(p.ops));
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) * (xs[i] - mx);
    }
    if (den === 0) return null;
    return num / den;
  }

  // ---------- deterministic datasets (tests + node profiling) ----------
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const datasets = {
    random(n, rng) {
      const rand = rng || Math.random;
      return Array.from({ length: n }, () => Math.floor(rand() * 91) + 5);
    },
    sorted(n) {
      return Array.from({ length: n }, (_, i) => Math.floor(((i + 1) / n) * 90) + 5);
    },
    reversed(n) {
      return datasets.sorted(n).reverse();
    },
    fewUnique(n, rng) {
      const rand = rng || Math.random;
      const uniques = [12, 28, 44, 60, 76, 92];
      return Array.from({ length: n }, () => uniques[Math.floor(rand() * uniques.length)]);
    },
  };

  const api = {
    ALGORITHM_IDS: Object.keys(algorithms),
    TIM_MIN_RUN,
    algorithms,
    newMetrics,
    applyMetric,
    totalOps,
    run,
    benchmark,
    estimateExponent,
    datasets,
    mulberry32,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SortCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
