/* ============================================================
   Search Lab — pure search algorithms
   Works in the browser (global SearchCore) and Node (CJS).
   Input arrays are never mutated.
   ============================================================ */

(function (root) {
  const ALGORITHM_IDS = ["linear", "binary", "jump", "interpolation", "exponential"];

  function result(found, index, probeOrder) {
    return {
      found: !!found,
      index: found ? index : -1,
      probes: probeOrder.length,
      probeOrder: probeOrder.slice(),
    };
  }

  function empty() {
    return result(false, -1, []);
  }

  function linear(arr, target) {
    if (!arr || !arr.length) return empty();
    const probeOrder = [];
    for (let i = 0; i < arr.length; i++) {
      probeOrder.push(i);
      if (arr[i] === target) return result(true, i, probeOrder);
    }
    return result(false, -1, probeOrder);
  }

  function binary(arr, target) {
    if (!arr || !arr.length) return empty();
    const probeOrder = [];
    let lo = 0;
    let hi = arr.length - 1;
    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      probeOrder.push(mid);
      if (arr[mid] === target) return result(true, mid, probeOrder);
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return result(false, -1, probeOrder);
  }

  function jump(arr, target) {
    if (!arr || !arr.length) return empty();
    const n = arr.length;
    const probeOrder = [];
    const stepSize = Math.max(1, Math.floor(Math.sqrt(n)));
    let prev = 0;
    let step = stepSize;

    while (prev < n && arr[Math.min(step, n) - 1] < target) {
      probeOrder.push(Math.min(step, n) - 1);
      prev = step;
      step += stepSize;
      if (prev >= n) return result(false, -1, probeOrder);
    }

    const end = Math.min(step, n);
    for (let i = prev; i < end; i++) {
      probeOrder.push(i);
      if (arr[i] === target) return result(true, i, probeOrder);
      if (arr[i] > target) break;
    }
    return result(false, -1, probeOrder);
  }

  function interpolation(arr, target) {
    if (!arr || !arr.length) return empty();
    const probeOrder = [];
    let lo = 0;
    let hi = arr.length - 1;
    while (lo <= hi && target >= arr[lo] && target <= arr[hi]) {
      if (lo === hi) {
        probeOrder.push(lo);
        if (arr[lo] === target) return result(true, lo, probeOrder);
        return result(false, -1, probeOrder);
      }
      const span = arr[hi] - arr[lo];
      let pos = span === 0 ? lo : lo + Math.floor(((target - arr[lo]) * (hi - lo)) / span);
      if (pos < lo) pos = lo;
      if (pos > hi) pos = hi;
      probeOrder.push(pos);
      if (arr[pos] === target) return result(true, pos, probeOrder);
      if (arr[pos] < target) lo = pos + 1;
      else hi = pos - 1;
    }
    return result(false, -1, probeOrder);
  }

  function exponential(arr, target) {
    if (!arr || !arr.length) return empty();
    const n = arr.length;
    const probeOrder = [];
    probeOrder.push(0);
    if (arr[0] === target) return result(true, 0, probeOrder);

    let bound = 1;
    while (bound < n && arr[bound] < target) {
      probeOrder.push(bound);
      bound *= 2;
    }
    if (bound < n) probeOrder.push(bound);

    let lo = Math.floor(bound / 2);
    let hi = Math.min(bound, n - 1);
    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      probeOrder.push(mid);
      if (arr[mid] === target) return result(true, mid, probeOrder);
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return result(false, -1, probeOrder);
  }

  const ALGORITHMS = {
    linear,
    binary,
    jump,
    interpolation,
    exponential,
  };

  function search(id, arr, target) {
    const fn = ALGORITHMS[id];
    if (!fn) throw new Error("Unknown algorithm: " + id);
    return fn(arr, target);
  }

  const api = {
    ALGORITHM_IDS: ALGORITHM_IDS.slice(),
    search,
    linear,
    binary,
    jump,
    interpolation,
    exponential,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SearchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
