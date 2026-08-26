"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const SearchCore = require("../search-core.js");

function assertInRange(result, n) {
  assert.ok(Array.isArray(result.probeOrder));
  assert.equal(result.probes, result.probeOrder.length);
  for (const i of result.probeOrder) {
    assert.equal(typeof i, "number");
    assert.ok(i >= 0 && i < n, "probe index out of range: " + i);
  }
}

test("ALGORITHM_IDS lists 5 search algorithms", () => {
  assert.deepEqual(SearchCore.ALGORITHM_IDS, [
    "linear",
    "binary",
    "jump",
    "interpolation",
    "exponential",
  ]);
});

test("binary finds existing values", () => {
  const arr = [1, 3, 4, 7, 9, 12, 18, 21];
  for (let i = 0; i < arr.length; i++) {
    const result = SearchCore.binary(arr, arr[i]);
    assert.equal(result.found, true, "should find " + arr[i]);
    assert.equal(result.index, i);
    assert.ok(result.probes >= 1);
    assertInRange(result, arr.length);
  }
  const viaDispatch = SearchCore.search("binary", arr, 12);
  assert.equal(viaDispatch.found, true);
  assert.equal(viaDispatch.index, 5);
});

test("binary returns -1 / found:false for missing values", () => {
  const arr = [1, 3, 5, 7, 9];
  for (const target of [0, 2, 4, 8, 10, 99]) {
    const result = SearchCore.binary(arr, target);
    assert.equal(result.found, false, "should miss " + target);
    assert.equal(result.index, -1);
    assertInRange(result, arr.length);
  }
});

test("linear finds values in an unsorted array", () => {
  const arr = [9, 2, 7, 1, 5, 4];
  const result = SearchCore.linear(arr, 1);
  assert.equal(result.found, true);
  assert.equal(result.index, 3);
  assert.deepEqual(result.probeOrder, [0, 1, 2, 3]);
  assert.equal(SearchCore.linear(arr, 8).found, false);
  assert.equal(SearchCore.linear(arr, 8).index, -1);
});

test("interpolation finds values on uniform data", () => {
  const arr = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  const hit = SearchCore.interpolation(arr, 50);
  assert.equal(hit.found, true);
  assert.equal(hit.index, 4);
  assertInRange(hit, arr.length);
  const miss = SearchCore.interpolation(arr, 45);
  assert.equal(miss.found, false);
  assert.equal(miss.index, -1);
  assertInRange(miss, arr.length);
});

test("jump and exponential find existing values and miss others", () => {
  const arr = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
  for (const id of ["jump", "exponential"]) {
    const hit = SearchCore.search(id, arr, 18);
    assert.equal(hit.found, true, id);
    assert.equal(arr[hit.index], 18, id);
    assertInRange(hit, arr.length);
    const miss = SearchCore.search(id, arr, 17);
    assert.equal(miss.found, false, id);
    assert.equal(miss.index, -1, id);
    assertInRange(miss, arr.length);
  }
});

test("probeOrder indices stay in range and empty arrays miss", () => {
  const arr = [3, 6, 9, 12, 15];
  for (const id of SearchCore.ALGORITHM_IDS) {
    const hit = SearchCore.search(id, arr, 9);
    assertInRange(hit, arr.length);
    const empty = SearchCore.search(id, [], 9);
    assert.equal(empty.found, false);
    assert.equal(empty.index, -1);
    assert.deepEqual(empty.probeOrder, []);
  }
});

test("search algorithms do not mutate the input array", () => {
  const arr = [1, 4, 7, 10, 13, 16];
  const before = arr.slice();
  for (const id of SearchCore.ALGORITHM_IDS) {
    SearchCore.search(id, arr, 10);
    SearchCore.search(id, arr, 11);
    SearchCore.search(id, arr, 1);
    SearchCore.search(id, arr, 16);
  }
  assert.deepEqual(arr, before);
});
