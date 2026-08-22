"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const SortCore = require("../sorting-core.js");

const { ALGORITHM_IDS, run, benchmark, estimateExponent, datasets, mulberry32 } = SortCore;

const STABLE_IDS = ["bubble", "insertion", "merge", "radix", "counting", "cocktail", "gnome", "tim"];

function sortedCopy(arr) {
  return [...arr].sort((a, b) => a - b);
}

test("registry exposes all fourteen algorithms", () => {
  assert.equal(ALGORITHM_IDS.length, 14);
  for (const id of ["comb", "gnome", "cycle", "tim"]) {
    assert.ok(ALGORITHM_IDS.includes(id), `missing ${id}`);
  }
});

test("run throws on unknown algorithm", () => {
  assert.throws(() => run("bogo", [3, 1, 2]), /Unknown algorithm/);
});

for (const id of SortCore.ALGORITHM_IDS) {
  test(`${id}: sorts every dataset shape`, () => {
    const rng = mulberry32(42);
    const inputs = [
      [],
      [7],
      [2, 1],
      [5, 5, 5, 5],
      datasets.random(97, rng),
      datasets.sorted(64),
      datasets.reversed(64),
      datasets.fewUnique(80, rng),
    ];
    for (const input of inputs) {
      const { array } = run(id, input);
      assert.deepEqual(array, sortedCopy(input), `${id} failed on n=${input.length}`);
    }
  });

  test(`${id}: does not mutate its input`, () => {
    const input = [9, 4, 7, 1, 8, 2];
    const frozen = [...input];
    run(id, input);
    assert.deepEqual(input, frozen);
  });
}

for (const id of STABLE_IDS) {
  test(`${id}: is stable`, () => {
    const rng = mulberry32(7);
    // value = key * 1000 + tag; sort by key only, tags record input order
    const n = 60;
    const input = Array.from({ length: n }, (_, tag) => Math.floor(rng() * 8) * 1000 + tag);
    const key = (v) => Math.floor(v / 1000);
    const { array } = run(id, input, { key });

    for (let i = 1; i < array.length; i++) {
      const prevKey = key(array[i - 1]);
      const curKey = key(array[i]);
      assert.ok(prevKey <= curKey, `${id}: keys out of order at ${i}`);
      if (prevKey === curKey) {
        assert.ok(
          array[i - 1] % 1000 < array[i] % 1000,
          `${id}: equal keys reordered at ${i} (${array[i - 1]} before ${array[i]})`
        );
      }
    }
  });
}

test("cycle: performs at most n writes on distinct values", () => {
  const rng = mulberry32(3);
  const input = Array.from({ length: 50 }, (_, i) => i + 1);
  for (let i = input.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [input[i], input[j]] = [input[j], input[i]];
  }
  const { array, metrics } = run("cycle", input);
  assert.deepEqual(array, sortedCopy(input));
  assert.ok(metrics.writes <= input.length, `writes ${metrics.writes} > n ${input.length}`);
});

test("cycle: zero writes on an already sorted distinct array", () => {
  const input = Array.from({ length: 40 }, (_, i) => i);
  const { metrics } = run("cycle", input);
  assert.equal(metrics.writes, 0);
});

test("bubble: exact comparison and swap counts on reversed input", () => {
  const n = 30;
  const { metrics } = run("bubble", datasets.reversed(n));
  // reversed distinct values: every adjacent pair is inverted
  assert.equal(metrics.comparisons, (n * (n - 1)) / 2);
  assert.equal(metrics.swaps, (n * (n - 1)) / 2);
});

test("selection: at most n-1 swaps", () => {
  const rng = mulberry32(11);
  const input = datasets.random(80, rng);
  const { metrics } = run("selection", input);
  assert.ok(metrics.swaps <= input.length - 1);
});

test("tim: near-linear comparisons on already sorted input", () => {
  const n = 128;
  const { metrics } = run("tim", datasets.sorted(n));
  assert.ok(
    metrics.comparisons < 2 * n,
    `expected < ${2 * n} comparisons on sorted input, got ${metrics.comparisons}`
  );
});

test("benchmark: op counts grow with n", () => {
  const points = benchmark("bubble", [16, 32, 64], (n) => datasets.reversed(n));
  assert.equal(points.length, 3);
  assert.ok(points[0].ops < points[1].ops && points[1].ops < points[2].ops);
});

test("estimateExponent recovers known growth rates", () => {
  const quadratic = [16, 32, 64, 128, 256].map((n) => ({ n, ops: 3 * n * n }));
  const linear = [16, 32, 64, 128, 256].map((n) => ({ n, ops: 5 * n }));
  const linearithmic = [16, 32, 64, 128, 256].map((n) => ({ n, ops: n * Math.log2(n) }));

  assert.ok(Math.abs(estimateExponent(quadratic) - 2) < 0.01);
  assert.ok(Math.abs(estimateExponent(linear) - 1) < 0.01);
  const k = estimateExponent(linearithmic);
  assert.ok(k > 1 && k < 1.5, `n log n slope should land between 1 and 1.5, got ${k}`);
});

test("estimateExponent handles degenerate input", () => {
  assert.equal(estimateExponent([]), null);
  assert.equal(estimateExponent([{ n: 16, ops: 100 }]), null);
});

test("measured exponents separate quadratic sorts from linearithmic ones", () => {
  const rng = mulberry32(99);
  const sizes = [32, 64, 128, 256];
  const make = (n) => datasets.random(n, rng);

  const bubbleK = estimateExponent(benchmark("bubble", sizes, make));
  const mergeK = estimateExponent(benchmark("merge", sizes, make));
  const countingK = estimateExponent(benchmark("counting", sizes, make));

  assert.ok(bubbleK > 1.7, `bubble should look quadratic, got ${bubbleK}`);
  assert.ok(mergeK < 1.5, `merge should look linearithmic, got ${mergeK}`);
  assert.ok(countingK < 1.3, `counting should look linear, got ${countingK}`);
});
