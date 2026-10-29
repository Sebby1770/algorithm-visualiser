"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const DbCore = require("../db-core.js");

function fresh(options) {
  return DbCore.createDatabase(options);
}

/** Runs SQL and fails the test on any statement error. */
function run(db, sql) {
  const results = db.execute(sql);
  const bad = results.find((r) => r.error);
  if (bad) assert.fail(`${bad.sql}\n→ ${bad.error.message}`);
  return results;
}

function rows(db, sql) {
  const results = run(db, sql);
  return results[results.length - 1].rows;
}

function errorOf(db, sql) {
  const results = db.execute(sql);
  const bad = results.find((r) => r.error);
  assert.ok(bad, `expected an error from: ${sql}`);
  return bad.error;
}

function planOps(plan) {
  const ops = [];
  const walk = (n) => {
    ops.push(n.op);
    n.children.forEach(walk);
  };
  walk(plan);
  return ops;
}

function sortRows(list) {
  return list.map((r) => JSON.stringify(r)).sort();
}

const SHOP = `
  CREATE TABLE users (id INT PRIMARY KEY, name TEXT NOT NULL, city TEXT, age INT);
  INSERT INTO users VALUES (1, 'Ada', 'London', 36), (2, 'Grace', 'NYC', 45), (3, 'Linus', NULL, 28),
    (4, 'Barbara', 'Boston', 52), (5, 'Edsger', 'Austin', NULL), (6, 'Margaret', 'Boston', 33);
`;

// ---------- Tokenizer & parser ----------

test("tokenize handles keywords, identifiers, numbers, strings and comments", () => {
  const toks = DbCore.tokenize("SELECT Name, 3.5, 'it''s' -- trailing\n/* block */ FROM t;");
  assert.deepEqual(
    toks.map((t) => [t.type, t.value]),
    [
      ["keyword", "SELECT"],
      ["ident", "name"],
      ["punct", ","],
      ["number", 3.5],
      ["punct", ","],
      ["string", "it's"],
      ["keyword", "FROM"],
      ["ident", "t"],
      ["punct", ";"],
      ["eof", null],
    ]
  );
  assert.equal(toks[3].isReal, true);
});

test("tokenize reports the position of an unterminated string", () => {
  assert.throws(() => DbCore.tokenize("SELECT 'oops"), (err) => err instanceof DbCore.DbError && err.position === 7);
});

test("parse splits statements and keeps each statement's text", () => {
  const { statements } = DbCore.parse("SELECT 1;  ;SELECT name FROM users WHERE id = 2");
  assert.equal(statements.length, 2);
  assert.equal(statements[1].sql, "SELECT name FROM users WHERE id = 2");
  assert.equal(statements[1].ast.where.op, "=");
});

test("syntax errors carry a character position in the full input", () => {
  const db = fresh();
  const results = db.execute("SELECT 1; SELECT FROM users");
  assert.equal(results.length, 2);
  assert.equal(results[0].error, null, "statement before the bad one still runs");
  assert.equal(results[1].error.position, 17);
  assert.match(results[1].error.message, /expected an expression/);
});

// ---------- CRUD, types and constraints ----------

test("create, insert, select, update, delete round trip", () => {
  const db = fresh();
  run(db, SHOP);
  assert.deepEqual(rows(db, "SELECT name FROM users WHERE id = 4"), [["Barbara"]]);
  const upd = run(db, "UPDATE users SET age = age + 1 WHERE city = 'Boston'");
  assert.equal(upd[0].rowsAffected, 2);
  assert.deepEqual(rows(db, "SELECT age FROM users WHERE city = 'Boston' ORDER BY id"), [[53], [34]]);
  const del = run(db, "DELETE FROM users WHERE age < 30");
  assert.equal(del[0].rowsAffected, 1);
  assert.deepEqual(rows(db, "SELECT COUNT(*) FROM users"), [[5]]);
});

test("type, NOT NULL and UNIQUE violations are reported clearly", () => {
  const db = fresh();
  run(db, SHOP);
  assert.match(errorOf(db, "INSERT INTO users VALUES (7, 'X', 'Y', 1.5)").message, /type mismatch: users\.age is INT/);
  assert.match(errorOf(db, "INSERT INTO users VALUES (7, 42, 'Y', 1)").message, /users\.name is TEXT/);
  assert.match(errorOf(db, "INSERT INTO users VALUES (7, NULL, 'Y', 1)").message, /NOT NULL constraint failed: users\.name/);
  assert.match(errorOf(db, "INSERT INTO users VALUES (1, 'Dup', 'Y', 1)").message, /UNIQUE constraint failed: users\.id/);
  assert.match(errorOf(db, "UPDATE users SET id = 2 WHERE id = 1").message, /UNIQUE constraint failed: users\.id/);
  assert.match(errorOf(db, "INSERT INTO users (id) VALUES (1, 2)").message, /2 values supplied for 1 column/);
});

test("unknown and ambiguous names are errors", () => {
  const db = fresh();
  run(db, SHOP + "CREATE TABLE orders (id INT PRIMARY KEY, user_id INT);");
  assert.match(errorOf(db, "SELECT * FROM nope").message, /no such table: nope/);
  assert.match(errorOf(db, "SELECT nope FROM users").message, /no such column: nope/);
  assert.match(errorOf(db, "SELECT id FROM users u JOIN orders o ON o.user_id = u.id").message, /ambiguous column name: id/);
  assert.match(errorOf(db, "SELECT x.id FROM users u").message, /no such table or alias: x/);
});

// ---------- Expressions ----------

test("NULL follows three-valued logic", () => {
  const db = fresh();
  run(db, SHOP);
  // Linus has city NULL: neither city = 'X' nor city <> 'X' keeps him.
  assert.equal(rows(db, "SELECT COUNT(*) FROM users WHERE city = 'Boston' OR city <> 'Boston'")[0][0], 5);
  assert.deepEqual(rows(db, "SELECT name FROM users WHERE city IS NULL"), [["Linus"]]);
  assert.deepEqual(rows(db, "SELECT NULL = NULL, NULL OR 1, NULL AND 0, NOT NULL"), [[null, 1, 0, null]]);
  assert.deepEqual(rows(db, "SELECT 2 IN (1, NULL), 1 IN (1, NULL), 3 NOT IN (1, 2)"), [[null, 1, 1]]);
});

test("BETWEEN, IN, LIKE and arithmetic semantics", () => {
  const db = fresh();
  run(db, SHOP);
  assert.deepEqual(rows(db, "SELECT name FROM users WHERE age BETWEEN 33 AND 45 ORDER BY age"), [["Margaret"], ["Ada"], ["Grace"]]);
  assert.deepEqual(rows(db, "SELECT name FROM users WHERE id IN (2, 6) ORDER BY id"), [["Grace"], ["Margaret"]]);
  assert.deepEqual(rows(db, "SELECT name FROM users WHERE name LIKE '%a_a%' ORDER BY id"), [["Ada"], ["Barbara"]]);
  assert.deepEqual(rows(db, "SELECT name FROM users WHERE name LIKE 'g%'"), [["Grace"]], "LIKE ignores ASCII case");
  // INT / INT truncates toward zero; REAL keeps the fraction; / 0 is NULL.
  assert.deepEqual(rows(db, "SELECT 7 / 2, -7 / 2, 7.0 / 2, 7 % 3, 1 / 0, 'a' || 1"), [[3, -3, 3.5, 1, null, "a1"]]);
  assert.match(errorOf(db, "SELECT 'a' + 1").message, /cannot apply \+/);
});

// ---------- Sorting, grouping ----------

test("ORDER BY several keys, aliases and positions, with LIMIT/OFFSET and DISTINCT", () => {
  const db = fresh();
  run(db, SHOP);
  assert.deepEqual(rows(db, "SELECT city, name FROM users WHERE city IS NOT NULL ORDER BY city DESC, name LIMIT 3 OFFSET 1"), [
    ["London", "Ada"],
    ["Boston", "Barbara"],
    ["Boston", "Margaret"],
  ]);
  assert.deepEqual(rows(db, "SELECT name AS n FROM users ORDER BY n LIMIT 2"), [["Ada"], ["Barbara"]]);
  assert.deepEqual(rows(db, "SELECT id, age FROM users ORDER BY 2 DESC LIMIT 1"), [[4, 52]]);
  assert.deepEqual(rows(db, "SELECT DISTINCT city FROM users ORDER BY city"), [[null], ["Austin"], ["Boston"], ["London"], ["NYC"]]);
});

test("GROUP BY, HAVING and aggregates treat NULLs correctly", () => {
  const db = fresh();
  run(db, SHOP);
  assert.deepEqual(rows(db, "SELECT COUNT(*), COUNT(city), COUNT(age), COUNT(DISTINCT city) FROM users"), [[6, 5, 5, 4]]);
  assert.deepEqual(rows(db, "SELECT SUM(age), MIN(age), MAX(age), AVG(age) FROM users"), [[194, 28, 52, 38.8]]);
  assert.deepEqual(rows(db, "SELECT city, COUNT(*) AS n FROM users GROUP BY city HAVING COUNT(*) > 1"), [["Boston", 2]]);
  assert.deepEqual(rows(db, "SELECT COUNT(*), SUM(age) FROM users WHERE id > 100"), [[0, null]], "aggregates over no rows");
  assert.deepEqual(rows(db, "SELECT u.city, COUNT(*) FROM users u WHERE city = 'Boston' GROUP BY city"), [["Boston", 2]]);
  assert.match(errorOf(db, "SELECT name, COUNT(*) FROM users GROUP BY city").message, /must appear in GROUP BY/);
  assert.match(errorOf(db, "SELECT * FROM users WHERE COUNT(*) > 1").message, /not allowed here/);
});

// ---------- Planner & joins ----------

const JOIN_DATA = `
  CREATE TABLE a (id INT PRIMARY KEY, k INT, v TEXT);
  CREATE TABLE b (id INT PRIMARY KEY, k INT, w TEXT);
  INSERT INTO a VALUES (1, 1, 'a1'), (2, 2, 'a2'), (3, 2, 'a3'), (4, NULL, 'a4'), (5, 5, 'a5');
  INSERT INTO b VALUES (10, 2, 'b10'), (11, 1, 'b11'), (12, 2, 'b12'), (13, 9, 'b13'), (14, NULL, 'b14');
`;
const A = [[1, 1, "a1"], [2, 2, "a2"], [3, 2, "a3"], [4, null, "a4"], [5, 5, "a5"]];
const B = [[10, 2, "b10"], [11, 1, "b11"], [12, 2, "b12"], [13, 9, "b13"], [14, null, "b14"]];

function bruteJoin(pred) {
  const out = [];
  for (const x of A) for (const y of B) if (pred(x, y)) out.push(x.concat(y));
  return out;
}

test("each join algorithm is chosen in its situation and all agree with a brute-force join", () => {
  const db = fresh();
  run(db, JOIN_DATA);
  const expected = sortRows(bruteJoin((x, y) => x[1] !== null && x[1] === y[1]));

  // No index on b.k, equality → hash join.
  let r = run(db, "SELECT * FROM a JOIN b ON a.k = b.k")[0];
  assert.ok(planOps(r.plan).includes("HashJoin"), planOps(r.plan).join());
  assert.deepEqual(sortRows(r.rows), expected);

  // Non-equality predicate → nested loop; same rows when written as two inequalities.
  r = run(db, "SELECT * FROM a JOIN b ON a.k <= b.k AND a.k >= b.k")[0];
  assert.ok(planOps(r.plan).includes("NestedLoopJoin"));
  assert.deepEqual(sortRows(r.rows), expected);

  // Index on the inner join column → index nested loop.
  run(db, "CREATE INDEX idx_b_k ON b (k)");
  r = run(db, "SELECT * FROM a JOIN b ON a.k = b.k")[0];
  assert.ok(planOps(r.plan).includes("IndexNestedLoopJoin"));
  assert.deepEqual(sortRows(r.rows), expected);
});

test("joins push single-table predicates down and keep residual conditions", () => {
  const db = fresh();
  run(db, JOIN_DATA);
  const r = run(db, "SELECT a.id, b.id FROM a JOIN b ON a.k = b.k AND b.id > a.id + 8 WHERE a.v <> 'a3'")[0];
  const expected = bruteJoin((x, y) => x[1] !== null && x[1] === y[1] && y[0] > x[0] + 8 && x[2] !== "a3").map((row) => [row[0], row[3]]);
  assert.deepEqual(sortRows(r.rows), sortRows(expected));
  assert.match(errorOf(db, "SELECT * FROM a JOIN b ON c.id = a.id JOIN b c ON c.id = b.id").message, /before it is joined/);
});

test("the planner picks an index for a selective predicate and a scan otherwise", () => {
  const db = fresh();
  run(db, DbCore.SAMPLE_SCRIPTS["index-vs-scan"].sql);
  let r = run(db, "EXPLAIN SELECT * FROM readings WHERE id = 5")[0];
  assert.ok(planOps(r.plan).includes("IndexScan"));
  r = run(db, "EXPLAIN SELECT * FROM readings WHERE celsius > 1")[0];
  assert.ok(planOps(r.plan).includes("SeqScan"), "no index on celsius");
  r = run(db, "EXPLAIN SELECT * FROM readings WHERE sensor > 2")[0];
  assert.ok(planOps(r.plan).includes("SeqScan"), "a range covering most rows is cheaper to scan");
  const scan = r.plan.children[0].children[0];
  assert.match(scan.reason, /selective enough/);
});

test("EXPLAIN does not execute; EXPLAIN ANALYZE fills actual rows", () => {
  const db = fresh();
  run(db, SHOP);
  const plain = run(db, "EXPLAIN SELECT * FROM users WHERE age > 30")[0];
  assert.equal(plain.events.filter((e) => e.type === "row").length, 0);
  assert.equal(plain.plan.actualRows, null);
  assert.equal(plain.columns[0], "plan");
  const analyzed = run(db, "EXPLAIN ANALYZE SELECT * FROM users WHERE age > 30")[0];
  assert.equal(analyzed.plan.actualRows, 4);
  assert.match(analyzed.rows.map((r) => r[0]).join("\n"), /actual rows=6/);
});

// ---------- B+ tree ----------

test("B+ tree stays valid through random inserts and deletes at orders 3–6", () => {
  for (const order of [3, 4, 5, 6]) {
    const rng = DbCore.createRng(order * 101);
    const tree = new DbCore.BPlusTree({ order, unique: true });
    const ref = new Map();
    for (let step = 0; step < 400; step++) {
      const key = Math.floor(rng() * 120);
      if (rng() < 0.6 && !ref.has(key)) {
        tree.insert(key, `r${key}`);
        ref.set(key, `r${key}`);
      } else if (ref.has(key)) {
        assert.equal(tree.delete(key, `r${key}`), true);
        ref.delete(key);
      }
      const errors = tree.check();
      assert.deepEqual(errors, [], `order ${order} step ${step}: ${errors.join("; ")}`);
    }
    const sorted = [...ref.keys()].sort((x, y) => x - y);
    assert.deepEqual(tree.entries().map(([k]) => k), sorted);
    assert.deepEqual(tree.range(30, 60), sorted.filter((k) => k >= 30 && k <= 60).map((k) => `r${k}`));
    assert.deepEqual(tree.range(30, 60, { loInclusive: false, hiInclusive: false }), sorted.filter((k) => k > 30 && k < 60).map((k) => `r${k}`));
    assert.deepEqual(tree.range(null, 10), sorted.filter((k) => k <= 10).map((k) => `r${k}`));
  }
});

test("B+ tree records splits, a new root, borrows and merges", () => {
  const tree = new DbCore.BPlusTree({ order: 4 });
  const events = [];
  for (let k = 1; k <= 20; k++) tree.insert(k, `r${k}`, events);
  assert.ok(events.some((e) => e.type === "split" && e.leaf));
  assert.ok(events.some((e) => e.type === "split" && !e.leaf), "internal split");
  assert.ok(events.some((e) => e.type === "new-root"));
  assert.ok(tree.height() >= 3);
  const del = [];
  for (let k = 1; k <= 17; k++) tree.delete(k, `r${k}`, del);
  assert.ok(del.some((e) => e.type === "borrow"));
  assert.ok(del.some((e) => e.type === "merge"));
  assert.ok(del.some((e) => e.type === "collapse-root"));
  assert.deepEqual(tree.check(), []);
  assert.deepEqual(tree.entries().map(([k]) => k), [18, 19, 20]);
});

test("non-unique B+ tree keeps every rid for a duplicate key", () => {
  const tree = new DbCore.BPlusTree({ order: 3 });
  ["a", "b", "c"].forEach((rid) => tree.insert(7, rid));
  tree.insert(3, "d");
  assert.deepEqual(tree.search(7), ["a", "b", "c"]);
  tree.delete(7, "b");
  assert.deepEqual(tree.search(7), ["a", "c"]);
  assert.equal(tree.size, 2);
  assert.throws(() => {
    const u = new DbCore.BPlusTree({ order: 3, unique: true });
    u.insert(1, "x");
    u.insert(1, "y");
  }, /duplicate key/);
});

// ---------- Buffer pool ----------

function poolWith(policy) {
  const disk = new Map();
  const pool = new DbCore.BufferPool({
    frames: 3,
    policy,
    load: (id) => disk.get(id) || { id, pageLSN: 0 },
    store: (id, page) => disk.set(id, page),
  });
  return { pool, disk };
}

function access(pool, ids, events) {
  for (const id of ids) {
    pool.fetch(id, events);
    pool.unpin(id, false, events);
  }
}

test("LRU and Clock pick different victims for the same access sequence", () => {
  const seq = ["A", "B", "C", "A", "D"];
  const lru = poolWith("lru");
  const lruEvents = [];
  access(lru.pool, seq, lruEvents);
  assert.equal(lruEvents.find((e) => e.type === "evict").pageId, "B", "LRU evicts the least recently used page");

  const clock = poolWith("clock");
  const clockEvents = [];
  access(clock.pool, seq, clockEvents);
  // Every frame has its reference bit set, so the hand clears them all and
  // comes back round to frame 0 (A) — Clock only approximates LRU.
  assert.equal(clockEvents.filter((e) => e.type === "clock-sweep").length, 3);
  assert.equal(clockEvents.find((e) => e.type === "evict").pageId, "A");

  assert.equal(lru.pool.hits, 1);
  assert.equal(lru.pool.misses, 4);
});

test("a dirty page is written back when evicted, and pinned pages are never evicted", () => {
  const { pool, disk } = poolWith("lru");
  const events = [];
  pool.fetch("A", events);
  pool.unpin("A", true, events);
  access(pool, ["B", "C", "D"], events);
  assert.ok(events.some((e) => e.type === "write" && e.pageId === "A"));
  assert.ok(disk.has("A"));
  pool.fetch("X");
  pool.fetch("Y");
  pool.fetch("Z");
  assert.throws(() => pool.fetch("W"), /every frame is pinned/);
});

test("the WAL rule flushes the log before a dirty page reaches disk", () => {
  const db = fresh({ bufferFrames: 3 });
  run(db, "CREATE TABLE t (id INT, v INT)");
  run(db, "BEGIN; INSERT INTO t VALUES (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6), (7, 7), (8, 8), (9, 9), (10, 10), (11, 11), (12, 12), (13, 13)");
  const snap = db.snapshot();
  const written = snap.tables[0].pages.filter((p) => p.onDisk);
  assert.ok(written.length > 0, "a 3-frame pool must steal pages from the open transaction");
  for (const p of written) assert.ok(p.diskLSN <= snap.wal.flushedLsn, `${p.id} reached disk before its log records`);
});

// ---------- Transactions ----------

test("ROLLBACK restores rows and index contents exactly", () => {
  const db = fresh();
  run(db, SHOP + "CREATE INDEX idx_age ON users (age);");
  const before = JSON.stringify(db.snapshot().tables);
  run(db, "BEGIN; UPDATE users SET age = 99 WHERE id < 4; DELETE FROM users WHERE id = 6; INSERT INTO users VALUES (9, 'New', 'X', 1);");
  assert.equal(rows(db, "SELECT COUNT(*) FROM users WHERE age = 99")[0][0], 3);
  const rb = run(db, "ROLLBACK")[0];
  assert.match(rb.message, /5 changes undone/);
  assert.deepEqual(rows(db, "SELECT id, age FROM users ORDER BY id"), [[1, 36], [2, 45], [3, 28], [4, 52], [5, null], [6, 33]]);
  const after = db.snapshot().tables;
  const index = (tables) => tables[0].indexes.map((i) => JSON.stringify(DbCore.BPlusTree.prototype.entries.call(rebuild(i.tree))));
  assert.deepEqual(index(after), index(JSON.parse(before)));
  const clrs = db.snapshot().wal.records.filter((r) => r.type === "clr");
  assert.equal(clrs.length, 5);
});

/** Turns a tree snapshot back into an object entries() can walk. */
function rebuild(snap) {
  return { nodes: new Map(Object.entries(snap.nodes)), root: snap.root, leftmostLeaf: DbCore.BPlusTree.prototype.leftmostLeaf };
}

test("a failing statement inside a transaction leaves no partial changes", () => {
  const db = fresh();
  run(db, SHOP);
  run(db, "BEGIN; INSERT INTO users VALUES (20, 'Keep', NULL, 1)");
  const err = errorOf(db, "INSERT INTO users VALUES (21, 'A', NULL, 1), (22, 'B', NULL, 1), (1, 'Clash', NULL, 1)");
  assert.match(err.message, /UNIQUE/);
  assert.deepEqual(rows(db, "SELECT id FROM users WHERE id >= 20"), [[20]], "only the earlier statement's row remains");
  run(db, "COMMIT");
  assert.deepEqual(rows(db, "SELECT COUNT(*) FROM users"), [[7]]);
  assert.match(errorOf(db, "COMMIT").message, /no transaction is active/);
  run(db, "BEGIN");
  assert.match(errorOf(db, "CREATE TABLE z (id INT)").message, /DDL inside a transaction/);
});

// ---------- Crash & recovery ----------

test("crash recovery keeps committed data and removes uncommitted data even after steal", () => {
  const db = fresh({ bufferFrames: 3 });
  run(db, "CREATE TABLE t (id INT PRIMARY KEY, v INT)");
  run(db, "INSERT INTO t VALUES " + Array.from({ length: 16 }, (_, i) => `(${i + 1}, ${i})`).join(", "));
  run(db, "BEGIN; UPDATE t SET v = -1; INSERT INTO t VALUES (100, 100)");
  const snap = db.snapshot();
  const txnStart = snap.wal.records.find((r) => r.txn === snap.txn.id).lsn;
  assert.ok(snap.tables[0].pages.some((p) => p.diskLSN !== null && p.diskLSN >= txnStart), "uncommitted changes were stolen to disk");

  const crash = db.crash();
  assert.equal(crash.lost.openTxn, snap.txn.id);
  assert.match(db.execute("SELECT 1")[0].error.message, /run recovery/);

  const { summary } = db.recover();
  assert.deepEqual(summary.losers, [snap.txn.id]);
  assert.ok(summary.undone > 0);
  assert.deepEqual(rows(db, "SELECT COUNT(*), SUM(v) FROM t"), [[16, 120]]);
  assert.deepEqual(rows(db, "SELECT v FROM t WHERE id = 7"), [[6]], "the rebuilt primary-key index works");
  assert.deepEqual(db.snapshot().tables[0].indexes[0].tree.size, 16);
});

test("committed work whose pages never reached disk is redone", () => {
  const db = fresh();
  run(db, "CREATE TABLE t (id INT, v INT); INSERT INTO t VALUES (1, 10), (2, 20);");
  assert.equal(db.snapshot().tables[0].pages[0].onDisk, false, "no-force: commit doesn't write the page");
  db.crash();
  const { summary } = db.recover();
  assert.ok(summary.redone >= 2);
  assert.deepEqual(rows(db, "SELECT v FROM t ORDER BY id"), [[10], [20]]);
});

test("recovery is idempotent and a checkpoint shortens redo", () => {
  const make = (withCheckpoint) => {
    const db = fresh({ bufferFrames: 3 });
    run(db, DbCore.SAMPLE_SCRIPTS["crash-recovery"].sql.replace("BEGIN;", withCheckpoint ? "" : "BEGIN;"));
    if (withCheckpoint) {
      db.checkpoint();
      run(db, "BEGIN; UPDATE ledger SET amount = 1 WHERE id = 3");
    }
    return db;
  };
  const db = make(false);
  db.crash();
  const first = db.recover().summary;
  const state1 = rows(db, "SELECT * FROM ledger ORDER BY id");
  db.crash();
  const second = db.recover().summary;
  assert.deepEqual(rows(db, "SELECT * FROM ledger ORDER BY id"), state1);
  assert.equal(second.undone, 0, "losers were already compensated");
  assert.ok(first.undone > 0);

  const noCkpt = fresh({ bufferFrames: 3 });
  run(noCkpt, DbCore.SAMPLE_SCRIPTS["crash-recovery"].sql.replace("BEGIN;", ""));
  run(noCkpt, "BEGIN; UPDATE ledger SET amount = 1 WHERE id = 3");
  noCkpt.crash();
  const full = noCkpt.recover().summary;
  const ckpt = make(true);
  ckpt.crash();
  const short = ckpt.recover().summary;
  assert.ok(short.redoFrom > 1);
  assert.ok(short.redone + short.skipped < full.redone + full.skipped, "redo starts at the checkpoint");
  assert.deepEqual(rows(ckpt, "SELECT * FROM ledger ORDER BY id"), rows(noCkpt, "SELECT * FROM ledger ORDER BY id"));
});

// ---------- Samples & determinism ----------

test("every sample script runs cleanly on a fresh database", () => {
  for (const [id, sample] of Object.entries(DbCore.SAMPLE_SCRIPTS)) {
    const db = fresh();
    const results = db.execute(sample.sql);
    const bad = results.find((r) => r.error);
    assert.equal(bad, undefined, `${id}: ${bad && bad.error.message}`);
    assert.ok(sample.title && sample.description);
  }
});

test("the crash-recovery sample exercises redo, skip and undo", () => {
  const db = fresh();
  run(db, DbCore.SAMPLE_SCRIPTS["crash-recovery"].sql);
  db.crash();
  const { summary } = db.recover();
  assert.ok(summary.redone > 0 && summary.skipped > 0 && summary.undone > 0, JSON.stringify(summary));
});

test("the same script produces identical event traces", () => {
  const trace = () => JSON.stringify(fresh().execute(DbCore.SAMPLE_SCRIPTS.starter.sql + DbCore.SAMPLE_SCRIPTS.joins.sql).map((r) => r.events));
  assert.equal(trace(), trace());
});

test("events describe buffer pool, B+ tree and WAL activity", () => {
  const db = fresh({ bufferFrames: 3 });
  const results = run(db, DbCore.SAMPLE_SCRIPTS["btree-splits"].sql);
  const types = new Set(results.flatMap((r) => r.events.map((e) => e.type)));
  for (const t of ["miss", "hit", "evict", "wal", "log-flush", "btree", "operator", "row"]) assert.ok(types.has(t), `missing ${t} events`);
  const btree = results.flatMap((r) => r.events.filter((e) => e.type === "btree").map((e) => e.event.type));
  for (const t of ["split", "new-root", "merge"]) assert.ok(btree.includes(t), `missing B+ tree ${t}`);
  const snap = db.snapshot();
  assert.deepEqual(snap.tables[0].indexes[0].tree.root.startsWith("n"), true);
  assert.equal(JSON.parse(JSON.stringify(snap)).bufferPool.frames.length, 3, "snapshot is JSON-safe");
});

// ---------- Review regressions ----------

test("ORDER BY / GROUP BY positions count the columns a * expands to", () => {
  const db = fresh();
  run(db, "CREATE TABLE t (id INT PRIMARY KEY, g TEXT, v INT); INSERT INTO t VALUES (1, 'a', 5), (2, 'b', 9), (3, 'c', 7)");
  assert.deepEqual(rows(db, "SELECT * FROM t ORDER BY 3 DESC").map((r) => r[0]), [2, 3, 1]);
  assert.deepEqual(rows(db, "SELECT t.* FROM t ORDER BY 1 DESC").map((r) => r[0]), [3, 2, 1]);
  assert.deepEqual(rows(db, "SELECT v, * FROM t ORDER BY 3").map((r) => r[2]), ["a", "b", "c"], "position 3 is g, after v and id");
  assert.match(errorOf(db, "SELECT * FROM t ORDER BY 4").message, /out of range/);
});

test("ROUND rounds halves away from zero on both sides", () => {
  const db = fresh();
  assert.deepEqual(rows(db, "SELECT ROUND(-2.5), ROUND(2.5), ROUND(-0.5), ROUND(-1.25, 1), ROUND(0.4), ROUND(-0.4)"), [[-3, 3, -1, -1.3, 0, 0]]);
});

test("redo events carry the row they write, so a viewer can replay recovery exactly", () => {
  const db = fresh();
  run(db, "CREATE TABLE t (id INT PRIMARY KEY, v INT); INSERT INTO t VALUES (1, 10), (2, 20)");
  db.crash();
  const { events } = db.recover();
  const redone = events.filter((e) => e.type === "recovery" && e.phase === "redo" && e.applied);
  assert.ok(redone.length >= 2);
  for (const e of redone) assert.ok(Array.isArray(e.values) || e.values === null, "redo event has values");
  assert.deepEqual(redone.find((e) => e.rid === "t#0:1").values, [2, 20]);
});

test("btree-state events describe their index, so a new index can be drawn while it is built", () => {
  const db = fresh();
  run(db, "CREATE TABLE t (id INT PRIMARY KEY, v INT); INSERT INTO t VALUES (1, 10), (2, 20), (3, 30)");
  const [res] = db.execute("CREATE INDEX idx_v ON t (v)");
  const states = res.events.filter((e) => e.type === "btree-state" && e.index === "idx_v");
  assert.equal(states.length, 3);
  assert.deepEqual([states[0].table, states[0].column, states[0].unique], ["t", "v", false]);
  assert.equal(states[2].tree.size, 3);
});
