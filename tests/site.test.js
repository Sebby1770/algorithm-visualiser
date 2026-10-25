"use strict";

// Static-site integrity: the labs only work offline / on Pages if every page,
// script and stylesheet they reference ships and is precached by sw.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const PAGES = ["index.html", "pathfinding.html", "search.html", "database.html", "hypervisor.html"];
const LABS = [
  ["index.html", "Sort Lab"],
  ["pathfinding.html", "Path Lab"],
  ["search.html", "Search Lab"],
  ["database.html", "DB Lab"],
  ["hypervisor.html", "Hypervisor Lab"],
];

function swAssets() {
  const src = read("sw.js");
  const block = src.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block, "sw.js must declare an ASSETS array");
  return [...block[1].matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
}

function localRefs(html) {
  const refs = [];
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|data:|#|mailto:)/.test(ref)) continue;
    refs.push(ref.replace(/^\.\//, ""));
  }
  return refs;
}

test("every service-worker asset exists in the repo", () => {
  for (const asset of swAssets()) {
    assert.ok(fs.existsSync(path.join(ROOT, asset)), `sw.js precaches missing file: ${asset}`);
  }
});

test("every page's scripts and stylesheets exist and are precached", () => {
  const cached = new Set(swAssets());
  for (const page of PAGES) {
    assert.ok(cached.has(page), `${page} is not precached by sw.js`);
    for (const ref of localRefs(read(page))) {
      assert.ok(fs.existsSync(path.join(ROOT, ref)), `${page} references missing ${ref}`);
      assert.ok(cached.has(ref), `${page} references ${ref}, which sw.js does not precache`);
    }
  }
});

test("every page shows the same five-lab switcher with itself active", () => {
  for (const page of PAGES) {
    const html = read(page);
    const nav = html.match(/<nav class="lab-switcher"[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(nav, `${page} has no lab switcher`);
    const pills = [...nav[1].matchAll(/<a class="lab-pill([^"]*)" href="([^"]+)"([^>]*)>([^<]+)<\/a>/g)].map((m) => ({
      active: m[1].includes("is-active"),
      href: m[2],
      current: m[3].includes('aria-current="page"'),
      label: m[4].trim(),
    }));
    assert.deepEqual(
      pills.map((p) => [p.href, p.label]),
      LABS,
      `${page} switcher order/labels`
    );
    const active = pills.filter((p) => p.active);
    assert.equal(active.length, 1, `${page} must mark exactly one pill active`);
    assert.equal(active[0].href, page, `${page} must mark itself active`);
    assert.ok(active[0].current, `${page} active pill needs aria-current="page"`);
  }
});

test("manifest is valid and its shortcuts point at real pages", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.ok(fs.existsSync(path.join(ROOT, manifest.start_url.replace(/^\.\//, ""))));
  for (const shortcut of manifest.shortcuts || []) {
    const file = shortcut.url.replace(/^\.\//, "").split("?")[0];
    assert.ok(PAGES.includes(file), `manifest shortcut points at unknown page ${shortcut.url}`);
  }
});

test("the Pages workflow ships every page and asset", () => {
  const workflow = read(".github/workflows/pages.yml");
  // The deploy step copies by glob so new labs can't be forgotten.
  assert.match(workflow, /cp \*\.html \*\.css \*\.js /, "pages.yml should copy *.html *.css *.js");
});
