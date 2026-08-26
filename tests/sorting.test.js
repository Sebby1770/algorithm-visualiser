"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const SortCore = require("../sorting-core.js");

function sameMultiset(a, b) {
  const sa = a.slice().sort((x, y) => x - y || 0);
  const sb = b.slice().sort((x, y) => x - y || 0);
  assert.deepEqual(sa, sb);
}

function assertSortedCopy(id, input) {
  const original = input.slice();
  const result = SortCore.sort(id, input);
  assert.deepEqual(input, original, id + " must not mutate input");
  assert.equal(result.array.length, original.length, id + " length");
  assert.equal(SortCore.isSorted(result.array), true, id + " should sort");
  sameMultiset(result.array, original);
  assert.equal(typeof result.comparisons, "number");
  assert.equal(typeof result.swaps, "number");
  assert.equal(typeof result.writes, "number");
}

test("ALGORITHM_IDS lists 16 algorithms", () => {
  assert.equal(SortCore.ALGORITHM_IDS.length, 16);
  for (const id of [
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
  ]) {
    assert.ok(SortCore.ALGORITHM_IDS.includes(id), id);
  }
});

test("isSorted detects order", () => {
  assert.equal(SortCore.isSorted([]), true);
  assert.equal(SortCore.isSorted([1]), true);
  assert.equal(SortCore.isSorted([1, 2, 2, 3]), true);
  assert.equal(SortCore.isSorted([2, 1]), false);
});

test("generateDataset matches UI type names and sizes", () => {
  const types = ["random", "sorted", "nearly-sorted", "reversed", "few-unique", "sawtooth"];
  for (const type of types) {
    const arr = SortCore.generateDataset(type, 12);
    assert.equal(arr.length, 12, type);
    assert.ok(arr.every((n) => typeof n === "number" && Number.isFinite(n)), type);
  }
  assert.equal(SortCore.generateDataset("nearly", 8).length, 8);
  assert.equal(SortCore.generateDataset("fewunique", 8).length, 8);
  assert.ok(SortCore.isSorted(SortCore.generateDataset("sorted", 10)));
});

const DATASETS = [
  ["random", 20],
  ["reversed", 15],
  ["sorted", 10],
  ["few-unique", 12],
];

for (const id of SortCore.ALGORITHM_IDS) {
  test(id + " sorts random, reversed, sorted, and few-unique datasets", () => {
    for (const [type, size] of DATASETS) {
      const input = SortCore.generateDataset(type, size);
      assertSortedCopy(id, input);
    }
    assertSortedCopy(id, []);
    assertSortedCopy(id, [42]);
  });
}

test("counting and radix sort non-negative integers from the UI range", () => {
  const input = [5, 95, 1, 100, 12, 12, 0, 44];
  for (const id of ["counting", "radix"]) {
    assertSortedCopy(id, input);
  }
});

test("cycle sort write count on reversed unique keys is at most n", () => {
  const input = [8, 7, 6, 5, 4, 3, 2, 1];
  const result = SortCore.sort("cycle", input);
  assert.equal(SortCore.isSorted(result.array), true);
  sameMultiset(result.array, input);
  assert.ok(result.writes <= input.length, "cycle writes=" + result.writes);
});

test("bubble and cocktail early-exit on a sorted array", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8];
  const bubble = SortCore.sort("bubble", sorted);
  const cocktail = SortCore.sort("cocktail", sorted);
  assert.equal(SortCore.isSorted(bubble.array), true);
  assert.equal(SortCore.isSorted(cocktail.array), true);
  // One forward pass of n-1 compares, then stop — not n(n-1)/2.
  assert.equal(bubble.comparisons, sorted.length - 1);
  assert.ok(cocktail.comparisons <= sorted.length - 1);
  assert.equal(bubble.swaps, 0);
  assert.equal(cocktail.swaps, 0);
});
