/* ============================================================
   DB Lab — UI
   Vanilla JS. The engine lives in db-core.js (DbCore); shared chrome
   (theme, sound, cheat sheet, toast, storage) in lab-common.js.

   Playback stays honest: "Run step-by-step" executes one statement at
   a time, replays that statement's real event trace into the views,
   then re-renders from the engine's own snapshot at the boundary.

   localStorage keys:
     theme, sound   — shared with the other labs
     dbLabHistory   — last 8 DB Lab runs
     dbLabPrefs     — engine + playback settings
   ============================================================ */

const HISTORY_KEY = "dbLabHistory";
const PREFS_KEY = "dbLabPrefs";
const MAX_HISTORY = 8;
const MAX_RESULT_ROWS = 50;
const MAX_SHARE_CHARS = 2000;

const CONCEPTS = {
  btree: {
    title: "B+ trees",
    trivia: "Every key lives in a leaf; internal nodes only route. With hundreds of keys per node, three levels index millions of rows — so a lookup costs a handful of page reads.",
    useCase: "PostgreSQL, MySQL InnoDB and SQLite all index with B+ trees. InnoDB even stores the table itself as a B+ tree on the primary key.",
  },
  bufferpool: {
    title: "Buffer pool replacement",
    trivia: "Disk is orders of magnitude slower than RAM, so the pool decides which pages stay. One big sequential scan can push every useful page out of a plain LRU pool — “sequential flooding”.",
    useCase: "PostgreSQL's shared buffers use a clock sweep; InnoDB inserts new pages at the LRU midpoint so scans can't evict the hot set.",
  },
  wal: {
    title: "Write-ahead logging",
    trivia: "Log first, data later: a change is durable once its log record is on disk, even while the data page is still only in memory.",
    useCase: "PostgreSQL's WAL, SQLite's WAL mode and journaling file systems all follow this rule — and replicas stay in sync by replaying the same log.",
  },
  stealnoforce: {
    title: "Steal / no-force",
    trivia: "Steal lets dirty pages of unfinished transactions reach disk early; no-force means COMMIT only flushes the log. Fast in normal running — but recovery then needs both undo and redo.",
    useCase: "Most production engines choose steal/no-force. The opposite (no-steal/force) needs no undo or redo but pins memory and slows every commit.",
  },
  aries: {
    title: "ARIES recovery",
    trivia: "Analysis finds the losers, Redo repeats history (even for losers), Undo rolls losers back while writing compensation records — so crashing during recovery is harmless.",
    useCase: "Published by C. Mohan at IBM in 1992; its ideas live on in DB2, SQL Server and, in spirit, most modern storage engines.",
  },
  planner: {
    title: "Cost-based planning",
    trivia: "The planner estimates how many rows each step returns and picks the cheapest plan — which is why an index is ignored when a predicate matches most of the table.",
    useCase: "PostgreSQL's EXPLAIN prints the same est-rows and cost numbers; stale statistics are a classic cause of slow queries (hence ANALYZE).",
  },
  joins: {
    title: "Join algorithms",
    trivia: "A nested loop compares every pair; a hash join hashes the smaller input and probes it; an index nested loop probes an index once per outer row.",
    useCase: "Hash joins dominate analytics; index nested loops win for small, selective OLTP lookups; sort-merge joins shine when both inputs are already sorted.",
  },
};

const $ = (id) => document.getElementById(id);
const esc = LabCommon.escapeHtml;

const dom = {
  frames: $("frames"),
  framesValue: $("framesValue"),
  policy: $("policy"),
  rowsPerPage: $("rowsPerPage"),
  rowsPerPageValue: $("rowsPerPageValue"),
  btreeOrder: $("btreeOrder"),
  btreeOrderValue: $("btreeOrderValue"),
  speed: $("speed"),
  speedValue: $("speedValue"),
  stepMode: $("stepMode"),
  teachingMode: $("teachingMode"),
  pauseBtn: $("pauseBtn"),
  stopBtn: $("stopBtn"),
  nextStepBtn: $("nextStepBtn"),
  skipBtn: $("skipBtn"),
  crashBtn: $("crashBtn"),
  recoverBtn: $("recoverBtn"),
  checkpointBtn: $("checkpointBtn"),
  resetDbBtn: $("resetDbBtn"),
  engineStats: $("engineStats"),
  conceptSelect: $("conceptSelect"),
  conceptTitle: $("conceptTitle"),
  learningCard: $("learningCard"),
  learningTrivia: $("learningTrivia"),
  learningUseCase: $("learningUseCase"),
  historyList: $("historyList"),
  statusText: $("statusText"),
  crashBanner: $("crashBanner"),
  crashTitle: $("crashTitle"),
  crashDetail: $("crashDetail"),
  recoverySteps: $("recoverySteps"),
  teachingPanel: $("teachingPanel"),
  teachingText: $("teachingText"),
  sampleSelect: $("sampleSelect"),
  loadSampleBtn: $("loadSampleBtn"),
  sampleDescription: $("sampleDescription"),
  sqlEditor: $("sqlEditor"),
  runBtn: $("runBtn"),
  stepRunBtn: $("stepRunBtn"),
  clearBtn: $("clearBtn"),
  results: $("results"),
  resultsMeta: $("resultsMeta"),
  planView: $("planView"),
  planMeta: $("planMeta"),
  indexSelect: $("indexSelect"),
  treeMeta: $("treeMeta"),
  treeView: $("treeView"),
  poolView: $("poolView"),
  poolMeta: $("poolMeta"),
  walView: $("walView"),
  walMeta: $("walMeta"),
  heapView: $("heapView"),
  heapMeta: $("heapMeta"),
  shareUrlBtn: $("shareUrlBtn"),
  soundToggle: $("soundToggle"),
  themeToggle: $("themeToggle"),
  cheatSheet: $("cheatSheet"),
  cheatSheetBtn: $("cheatSheetBtn"),
  cheatSheetClose: $("cheatSheetClose"),
  toast: $("toast"),
  a11yAnnouncer: $("a11yAnnouncer"),
};

// ---------- Formatting ----------

function valueHtml(v) {
  if (v === null || v === undefined) return '<span class="db-null">NULL</span>';
  return esc(typeof v === "number" ? String(v) : v);
}

function valueText(v) {
  if (v === null || v === undefined) return "NULL";
  return typeof v === "string" ? `'${v}'` : String(v);
}

function rowText(values) {
  return values ? `(${values.map(valueText).join(", ")})` : "empty";
}

function pageOf(rid) {
  return rid ? rid.slice(0, rid.lastIndexOf(":")) : null;
}

function slotOf(rid) {
  return Number(rid.slice(rid.lastIndexOf(":") + 1));
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function walDetail(rec) {
  switch (rec.type) {
    case "insert":
      return `${rec.rid} ← ${rowText(rec.after)}`;
    case "update":
      return `${rec.rid} ${rowText(rec.before)} → ${rowText(rec.after)}`;
    case "delete":
      return `${rec.rid} ✕ ${rowText(rec.before)}`;
    case "clr":
      return `undo LSN ${rec.undoOf}: ${rec.rid} → ${rowText(rec.after)}`;
    case "checkpoint":
      return `active txns [${(rec.active || []).join(", ")}]`;
    default:
      return "";
  }
}

/** Where an error position falls in the script: line number, line text, column. */
function lineInfo(text, position) {
  const before = text.slice(0, position);
  const lineNo = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = text.indexOf("\n", position);
  return { lineNo, lineText: text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd), col: position - lineStart };
}

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ---------- Narration ----------

/** Plain-English description of one engine event (null = not worth narrating). */
function narrate(ev, policy) {
  switch (ev.type) {
    case "hit":
      return `Page ${ev.pageId} is already in frame ${ev.frame} — a buffer pool hit, no disk read.`;
    case "miss":
      return ev.created
        ? `A brand-new page ${ev.pageId} gets frame ${ev.frame}; nothing to read from disk.`
        : `Page ${ev.pageId} isn't cached — a miss. It is read from disk into frame ${ev.frame}.`;
    case "evict":
      return `The pool is full, so ${policy === "clock" ? "the clock hand" : "LRU"} picks ${ev.pageId} (frame ${ev.frame}) to make room for ${ev.for}${ev.dirty ? " — it is dirty and must be written back first" : ""}.`;
    case "clock-sweep":
      return `Clock: ${ev.pageId} in frame ${ev.frame} was used recently, so its reference bit is cleared and it gets a second chance.`;
    case "write":
      return `Page ${ev.pageId} is written to disk.`;
    case "dirty":
      return `Page ${ev.pageId} now differs from its disk copy — it is marked dirty.`;
    case "alloc":
      return `Table ${ev.table} needs a new heap page: ${ev.pageId}.`;
    case "wal": {
      const r = ev.record;
      if (r.type === "begin") return `Transaction ${r.txn} begins (LSN ${r.lsn}).`;
      if (r.type === "commit") return `Commit record for transaction ${r.txn} appended at LSN ${r.lsn}.`;
      if (r.type === "abort") return `Transaction ${r.txn} is finished as aborted (LSN ${r.lsn}).`;
      if (r.type === "checkpoint") return `Checkpoint record at LSN ${r.lsn}: recovery can start its scan here.`;
      if (r.type === "clr") return `Compensation record LSN ${r.lsn} undoes LSN ${r.undoOf} — so it is never undone twice.`;
      return `Log first: LSN ${r.lsn} records the ${r.type} of ${r.rid} before the page itself changes.`;
    }
    case "log-flush":
      return `The log is forced to disk through LSN ${ev.lsn} (${ev.reason}).`;
    case "row":
      if (ev.op === "scan") return null;
      if (ev.op === "match") return `Matched row ${ev.rid} ${rowText(ev.values)}.`;
      if (ev.op === "insert") return `Row ${rowText(ev.values)} lands in slot ${ev.rid}.`;
      if (ev.op === "update") return `Row ${ev.rid} becomes ${rowText(ev.values)}.`;
      if (ev.op === "delete") return `Row ${ev.rid} is deleted — its slot becomes a tombstone.`;
      if (ev.op === "undo") return `Undo restores ${ev.rid} to ${rowText(ev.values)}.`;
      return null;
    case "btree": {
      const e = ev.event;
      if (e.type === "visit") return null;
      if (e.type === "insert-key") {
        if (e.separator) return `${ev.index}: separator ${valueText(e.key)} is added to internal node ${e.node}.`;
        return `${ev.index}: key ${valueText(e.key)} goes into leaf ${e.node}${e.duplicate ? " (another row with the same key)" : ""}.`;
      }
      if (e.type === "split") {
        return e.leaf
          ? `${ev.index}: leaf ${e.node} is over-full, so it splits into ${e.node} + ${e.newNode}; ${valueText(e.promoted)} is copied up to the parent.`
          : `${ev.index}: internal node ${e.node} splits into ${e.node} + ${e.newNode}; ${valueText(e.promoted)} moves up a level.`;
      }
      if (e.type === "new-root") return `${ev.index}: the root itself split — new root ${e.node}, the tree is one level taller.`;
      if (e.type === "remove-key") return `${ev.index}: key ${valueText(e.key)} is removed from leaf ${e.node}.`;
      if (e.type === "borrow") return `${ev.index}: ${e.to} fell below half full and borrows from sibling ${e.from}.`;
      if (e.type === "merge") return `${ev.index}: ${e.right} is too empty to lend a key, so it merges into ${e.left}.`;
      if (e.type === "collapse-root") return `${ev.index}: the root had one child left — the tree shrinks by a level.`;
      if (e.type === "leaf-next") return `${ev.index}: the range scan follows the leaf chain to ${e.node}.`;
      return null;
    }
    case "hash-build":
      return `Hash join: built a hash table on the ${ev.side} input (${plural(ev.rows, "row")}, ${plural(ev.buckets, "key")}).`;
    case "aggregate":
      return `Aggregation produced ${plural(ev.groups, "group")}.`;
    case "txn":
      if (ev.action === "rollback") return `Transaction ${ev.txn} rolled back (${plural(ev.undone || 0, "change")} undone).`;
      return null;
    case "recovery":
      return ev.detail || null;
    case "ddl":
      return ev.action === "create-table" ? `Created table ${ev.table}.` : ev.action === "create-index" ? `Built index ${ev.index}.` : `Dropped table ${ev.table}.`;
    case "truncated":
      return "Row-level events are capped for this statement; the rest run without narration.";
    default:
      return null;
  }
}

// ---------- View model ----------
/*
  Views draw from a model: a mutable copy of the last engine snapshot.
  During playback applyEvent() patches the model from real events and
  records highlights; at each statement boundary the model is rebuilt
  from a fresh snapshot, so the picture can never drift from the engine.
*/

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function modelFromSnapshot(snap) {
  const s = copy(snap);
  const trees = new Map();
  for (const t of s.tables) {
    for (const idx of t.indexes) trees.set(idx.name, { table: t.name, column: idx.column, unique: idx.unique, tree: idx.tree });
  }
  return { options: s.options, crashed: s.crashed, txn: s.txn, pool: s.bufferPool, wal: s.wal, tables: s.tables, trees };
}

function emptyHighlights() {
  return {
    frames: new Map(),
    nodes: new Map(),
    slots: new Map(),
    pages: new Set(),
    walNew: new Set(),
    planActive: new Set(),
    planDone: new Set(),
    planRows: new Map(),
  };
}

function findPage(model, pageId) {
  const table = model.tables.find((t) => pageId && pageId.startsWith(t.name + "#"));
  return table ? table.pages.find((p) => p.id === pageId) || null : null;
}

/** Patches the model with one event; returns the panes that need redrawing. */
function applyEvent(model, hl, ev) {
  const pool = model.pool;
  const touched = new Set();
  const frameAt = (i) => pool.frames[i];
  switch (ev.type) {
    case "hit": {
      const f = frameAt(ev.frame);
      f.refBit = 1;
      f.lastUsed = Math.max(...pool.frames.map((x) => x.lastUsed)) + 1;
      pool.hits++;
      hl.frames.set(ev.frame, "is-hit");
      touched.add("pool");
      break;
    }
    case "miss": {
      Object.assign(frameAt(ev.frame), {
        pageId: ev.pageId,
        dirty: !!ev.created,
        pinCount: 0,
        refBit: 1,
        lastUsed: Math.max(0, ...pool.frames.map((x) => x.lastUsed)) + 1,
      });
      pool.misses++;
      if (!ev.created) pool.diskReads++;
      hl.frames.set(ev.frame, "is-miss");
      const page = findPage(model, ev.pageId);
      if (page) {
        page.inPool = true;
        page.dirty = !!ev.created;
      }
      touched.add("pool").add("heap");
      break;
    }
    case "evict": {
      Object.assign(frameAt(ev.frame), { pageId: null, dirty: false, pinCount: 0, refBit: 0 });
      pool.evictions++;
      if (pool.policy === "clock") pool.hand = (ev.frame + 1) % pool.frames.length;
      hl.frames.set(ev.frame, "is-evict");
      const page = findPage(model, ev.pageId);
      if (page) {
        page.inPool = false;
        page.dirty = false;
      }
      touched.add("pool").add("heap");
      break;
    }
    case "clock-sweep":
      frameAt(ev.frame).refBit = 0;
      pool.hand = (ev.frame + 1) % pool.frames.length;
      hl.frames.set(ev.frame, "is-sweep");
      touched.add("pool");
      break;
    case "write": {
      pool.diskWrites++;
      const f = frameAt(ev.frame);
      if (f) f.dirty = false;
      hl.frames.set(ev.frame, "is-write");
      const page = findPage(model, ev.pageId);
      if (page) {
        page.onDisk = true;
        page.dirty = false;
        page.diskLSN = page.pageLSN;
      }
      touched.add("pool").add("heap");
      break;
    }
    case "dirty": {
      const f = frameAt(ev.frame);
      if (f) f.dirty = true;
      const page = findPage(model, ev.pageId);
      if (page) page.dirty = true;
      touched.add("pool").add("heap");
      break;
    }
    case "alloc": {
      const table = model.tables.find((t) => t.name === ev.table);
      if (table && !table.pages.some((p) => p.id === ev.pageId)) {
        table.pages.push({ id: ev.pageId, pageLSN: 0, diskLSN: null, slots: [], inPool: true, dirty: true, onDisk: false });
      }
      hl.pages.add(ev.pageId);
      touched.add("heap");
      break;
    }
    case "wal": {
      model.wal.records.push(ev.record);
      model.wal.nextLsn = ev.record.lsn + 1;
      hl.walNew.add(ev.record.lsn);
      const page = findPage(model, pageOf(ev.record.rid));
      if (page) page.pageLSN = ev.record.lsn;
      touched.add("wal").add("heap");
      break;
    }
    case "log-flush":
      model.wal.flushedLsn = ev.lsn;
      touched.add("wal");
      break;
    case "row": {
      const pageId = pageOf(ev.rid);
      const page = findPage(model, pageId);
      if (page) {
        const slot = slotOf(ev.rid);
        if (ev.op === "insert" || ev.op === "update" || ev.op === "delete" || ev.op === "undo") {
          const values = ev.op === "delete" ? null : ev.values;
          while (page.slots.length <= slot) page.slots.push({ slot: page.slots.length, rid: `${pageId}:${page.slots.length}`, values: null, deleted: true });
          page.slots[slot] = { slot, rid: ev.rid, values, deleted: !values };
        }
        hl.pages.add(pageId);
        hl.slots.set(ev.rid, ev.op === "scan" || ev.op === "match" ? "is-touched" : ev.op === "undo" || ev.op === "delete" ? "is-undone" : "is-written");
        touched.add("heap");
      }
      break;
    }
    case "btree": {
      const e = ev.event;
      const mark = (id, cls) => id && hl.nodes.set(`${ev.index}@${id}`, cls);
      if (e.type === "visit" || e.type === "leaf-next") mark(e.node, "is-visit");
      else if (e.type === "insert-key" || e.type === "remove-key") mark(e.node, "is-changed");
      else if (e.type === "split") {
        mark(e.node, "is-split");
        mark(e.newNode, "is-split");
      } else if (e.type === "new-root") mark(e.node, "is-split");
      else if (e.type === "borrow") {
        mark(e.from, "is-changed");
        mark(e.to, "is-changed");
      } else if (e.type === "merge") mark(e.left, "is-merge");
      else if (e.type === "collapse-root") mark(e.node, "is-merge");
      touched.add("tree");
      break;
    }
    case "btree-state": {
      const entry = model.trees.get(ev.index);
      if (entry) entry.tree = ev.tree;
      touched.add("tree");
      break;
    }
    case "operator":
      if (ev.action === "open") hl.planActive.add(ev.node);
      else {
        hl.planActive.delete(ev.node);
        hl.planDone.add(ev.node);
        hl.planRows.set(ev.node, (hl.planRows.get(ev.node) || 0) + ev.rows);
      }
      touched.add("plan");
      break;
    case "txn":
      model.txn = ev.action === "begin" ? { id: ev.txn, explicit: !!ev.explicit } : null;
      touched.add("stats");
      break;
    default:
      break;
  }
  return touched;
}

// ---------- Rendering ----------

function renderPool(model, hl) {
  const pool = model.pool;
  const used = pool.frames.filter((f) => f.pageId).sort((a, b) => b.lastUsed - a.lastUsed);
  const rank = new Map(used.map((f, i) => [f.index, i + 1]));
  dom.poolView.innerHTML = pool.frames
    .map((f, i) => {
      const classes = ["db-frame"];
      if (!f.pageId) classes.push("is-empty");
      if (hl.frames.has(i)) classes.push(hl.frames.get(i));
      if (pool.policy === "clock" && pool.hand === i) classes.push("is-hand");
      const badges = [];
      if (f.dirty) badges.push('<span class="db-badge is-dirty">● dirty</span>');
      if (f.pageId) {
        badges.push(
          pool.policy === "clock"
            ? `<span class="db-badge${f.refBit ? " is-on" : ""}" title="Clock reference bit">ref ${f.refBit}</span>`
            : `<span class="db-badge" title="Recency rank: 1 = most recently used">#${rank.get(f.index)} recent</span>`
        );
      }
      if (f.pinCount) badges.push(`<span class="db-badge">pin ${f.pinCount}</span>`);
      const label = `Frame ${i}: ${f.pageId ? f.pageId + (f.dirty ? ", dirty" : "") : "empty"}`;
      return `<div class="${classes.join(" ")}" role="listitem" aria-label="${esc(label)}">
        <span class="db-frame-index">Frame ${i}</span>
        <span class="db-frame-page">${esc(f.pageId || "empty")}</span>
        <span class="db-frame-badges">${badges.join("")}</span>
      </div>`;
    })
    .join("");
  const lookups = pool.hits + pool.misses;
  const rate = lookups ? Math.round((pool.hits / lookups) * 100) : 0;
  dom.poolMeta.innerHTML = `
    <span class="metric"><strong>${pool.policy.toUpperCase()}</strong></span>
    <span class="metric"><strong>${rate}%</strong> hit rate</span>
    <span class="metric"><strong>${pool.hits}</strong> hits</span>
    <span class="metric"><strong>${pool.misses}</strong> misses</span>
    <span class="metric"><strong>${pool.evictions}</strong> evictions</span>
    <span class="metric"><strong>${pool.diskReads}/${pool.diskWrites}</strong> disk R/W</span>`;
}

const WAL_RENDER_CAP = 300;

function renderWal(model, hl) {
  const view = dom.walView;
  const stick = view.scrollTop + view.clientHeight >= view.scrollHeight - 40;
  const { records, flushedLsn } = model.wal;
  const shown = records.slice(-WAL_RENDER_CAP);
  const divider = '<div class="db-wal-flushed" role="separator">durable on disk ▲ · ▼ only in memory</div>';
  let html = records.length > shown.length ? `<p class="db-result-more">${records.length - shown.length} older records not shown</p>` : "";
  if (shown.length && flushedLsn < shown[0].lsn) html += divider;
  for (const rec of shown) {
    const classes = ["db-wal-row", `t-${rec.type}`];
    if (rec.lsn > flushedLsn) classes.push("is-volatile");
    if (hl.walNew.has(rec.lsn)) classes.push("is-new");
    html += `<div class="${classes.join(" ")}">
      <span class="db-wal-lsn">${rec.lsn}</span>
      <span>${rec.txn === null || rec.txn === undefined ? "—" : "T" + rec.txn}</span>
      <span class="db-wal-type">${esc(rec.type)}</span>
      <span class="db-wal-detail">${esc(walDetail(rec))}</span>
    </div>`;
    if (rec.lsn === flushedLsn) html += divider;
  }
  view.innerHTML = html;
  if (stick) view.scrollTop = view.scrollHeight;
  const volatile = records.filter((r) => r.lsn > flushedLsn).length;
  dom.walMeta.innerHTML = `
    <span class="metric"><strong>${records.length}</strong> records</span>
    <span class="metric">flushed to <strong>LSN ${flushedLsn}</strong></span>
    <span class="metric"><strong>${volatile}</strong> volatile</span>`;
}

function renderHeap(model, hl) {
  let pages = 0;
  let rows = 0;
  dom.heapView.innerHTML = model.tables
    .map((t) => {
      pages += t.pages.length;
      const live = t.pages.reduce((n, p) => n + p.slots.filter((s) => !s.deleted).length, 0);
      rows += live;
      const cols = t.columns.map((c) => c.name + (c.primaryKey ? " 🔑" : "")).join(", ");
      const cards = t.pages
        .map((p) => {
          const badges = [
            p.inPool ? '<span class="db-badge is-on">in pool</span>' : "",
            p.dirty ? '<span class="db-badge is-dirty">● dirty</span>' : "",
            p.onDisk ? '<span class="db-badge">on disk</span>' : '<span class="db-badge">not on disk</span>',
          ].join("");
          const slots = p.slots
            .map((s) => {
              const cls = ["db-slot"];
              if (s.deleted) cls.push("is-tombstone");
              if (hl.slots.has(s.rid)) cls.push(hl.slots.get(s.rid));
              const text = s.values ? s.values.map(valueText).join(" · ") : "(deleted)";
              return `<li class="${cls.join(" ")}" title="${esc(s.rid)}"><span class="db-slot-n">${s.slot}</span><span class="db-slot-v">${esc(text)}</span></li>`;
            })
            .join("");
          const disk = p.diskLSN === null || p.diskLSN === undefined ? "never written" : `disk copy LSN ${p.diskLSN}`;
          return `<article class="db-page${hl.pages.has(p.id) ? " is-touched" : ""}">
            <div class="db-page-head"><span class="db-page-id">${esc(p.id)}</span>${badges}</div>
            <div class="db-page-lsn">pageLSN ${p.pageLSN} · ${esc(disk)}</div>
            <ol class="db-slots" start="0">${slots || '<li class="db-slot"><span class="db-slot-n"></span><span class="db-slot-v db-null">no rows</span></li>'}</ol>
          </article>`;
        })
        .join("");
      return `<section class="db-heap-table">
        <h4>${esc(t.name)} <span>(${esc(cols)}) · ${plural(live, "row")} · ${plural(t.pages.length, "page")}</span></h4>
        <div class="db-heap-pages">${cards || '<p class="db-plan-empty">No pages yet — the table is empty.</p>'}</div>
      </section>`;
    })
    .join("");
  dom.heapMeta.innerHTML = `
    <span class="metric"><strong>${model.tables.length}</strong> tables</span>
    <span class="metric"><strong>${rows}</strong> rows</span>
    <span class="metric"><strong>${pages}</strong> pages</span>
    <span class="metric"><strong>${model.options.rowsPerPage}</strong> rows / page</span>`;
}

// ----- B+ tree SVG -----

function keyLabel(k) {
  const text = k === null || k === undefined ? "NULL" : String(k);
  return text.length > 7 ? text.slice(0, 6) + "…" : text;
}

/** Leaves sit side by side; each internal node is centred over its children. */
function layoutTree(tree) {
  const nodes = tree.nodes;
  const levels = [];
  let frontier = [tree.root];
  while (frontier.length && levels.length < 12) {
    levels.push(frontier);
    const next = [];
    for (const id of frontier) {
      const n = nodes[id];
      if (n && !n.leaf) next.push(...n.children);
    }
    frontier = next;
  }
  const longest = Math.max(1, ...Object.values(nodes).flatMap((n) => n.keys.map((k) => keyLabel(k).length)));
  const keyW = Math.min(64, Math.max(26, longest * 7 + 12));
  const nodeH = 26;
  const gapX = 14;
  const gapY = 52;
  const top = 18;
  const pos = {};
  const widthOf = (n) => Math.max(1, n.keys.length) * keyW;
  let x = gapX;
  const leaves = levels[levels.length - 1] || [];
  leaves.forEach((id) => {
    const w = widthOf(nodes[id]);
    pos[id] = { x, y: top + (levels.length - 1) * (nodeH + gapY), w };
    x += w + gapX;
  });
  for (let d = levels.length - 2; d >= 0; d--) {
    for (const id of levels[d]) {
      const n = nodes[id];
      const first = pos[n.children[0]];
      const last = pos[n.children[n.children.length - 1]];
      const w = widthOf(n);
      const cx = first && last ? (first.x + last.x + last.w) / 2 : x / 2;
      pos[id] = { x: cx - w / 2, y: top + d * (nodeH + gapY), w };
    }
  }
  return { pos, levels, keyW, nodeH, width: Math.max(x, 120), height: top + levels.length * (nodeH + gapY) - gapY + 16 };
}

function renderTree(model, hl, selected) {
  const names = [...model.trees.keys()];
  const current = names.includes(selected) ? selected : names[0] || null;
  dom.indexSelect.innerHTML = names.length
    ? names.map((n) => {
        const e = model.trees.get(n);
        return `<option value="${esc(n)}"${n === current ? " selected" : ""}>${esc(n)} — ${esc(e.table)}(${esc(e.column)})</option>`;
      }).join("")
    : "<option>No indexes</option>";
  dom.indexSelect.disabled = !names.length;
  if (!current) {
    dom.treeView.innerHTML = '<p class="db-tree-empty">No indexes yet. A PRIMARY KEY or CREATE INDEX builds one.</p>';
    dom.treeMeta.innerHTML = "";
    return current;
  }
  const entry = model.trees.get(current);
  if (!entry.tree) {
    dom.treeView.innerHTML = '<p class="db-tree-empty">Indexes live in memory only — they were lost in the crash and are rebuilt by recovery.</p>';
    dom.treeMeta.innerHTML = "";
    return current;
  }
  const tree = entry.tree;
  const L = layoutTree(tree);
  const parts = [];
  // Edges first so nodes paint over them.
  for (const level of L.levels) {
    for (const id of level) {
      const n = tree.nodes[id];
      if (n.leaf) continue;
      const p = L.pos[id];
      n.children.forEach((child, i) => {
        const c = L.pos[child];
        if (!c) return;
        const x1 = p.x + i * L.keyW;
        const y1 = p.y + L.nodeH;
        const x2 = c.x + c.w / 2;
        const y2 = c.y;
        parts.push(`<path class="bt-edge" d="M${x1},${y1} C${x1},${y1 + 22} ${x2},${y2 - 22} ${x2},${y2}"/>`);
      });
    }
  }
  const leaves = L.levels[L.levels.length - 1] || [];
  leaves.forEach((id) => {
    const n = tree.nodes[id];
    const a = L.pos[id];
    const b = n.next && L.pos[n.next];
    if (!b) return;
    const y = a.y + L.nodeH / 2;
    parts.push(`<path class="bt-next" d="M${a.x + a.w},${y} L${b.x - 3},${y}" marker-end="url(#btArrow)"/>`);
  });
  for (const level of L.levels) {
    for (const id of level) {
      const n = tree.nodes[id];
      const p = L.pos[id];
      const cls = ["bt-node", n.leaf ? "is-leaf" : "is-internal"];
      const mark = hl.nodes.get(`${current}@${id}`);
      if (mark) cls.push(mark);
      const keys = n.keys.length
        ? n.keys
            .map((k, i) => {
              const cx = p.x + i * L.keyW + L.keyW / 2;
              const divider = i ? `<line class="bt-divider" x1="${p.x + i * L.keyW}" y1="${p.y}" x2="${p.x + i * L.keyW}" y2="${p.y + L.nodeH}"/>` : "";
              return `${divider}<text x="${cx}" y="${p.y + L.nodeH / 2}">${esc(keyLabel(k))}</text>`;
            })
            .join("")
        : `<text x="${p.x + p.w / 2}" y="${p.y + L.nodeH / 2}">∅</text>`;
      const title = `${id} (${n.leaf ? "leaf" : "internal"}): ${n.keys.map((k) => valueText(k)).join(", ") || "empty"}`;
      parts.push(`<g class="${cls.join(" ")}"><title>${esc(title)}</title>
        <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${L.nodeH}"/>${keys}
        <text class="bt-id" x="${p.x + 2}" y="${p.y - 7}" style="text-anchor:start">${esc(id)}</text></g>`);
    }
  }
  const summary = `${current}: B+ tree of order ${tree.order}, height ${tree.height}, ${plural(tree.size, "key")} in ${plural(Object.keys(tree.nodes).length, "node")}`;
  dom.treeView.innerHTML = `<svg width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" role="img" aria-label="${esc(summary)}">
    <defs><marker id="btArrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path class="bt-arrow" d="M0,0 L6,3 L0,6 z"/></marker></defs>
    ${parts.join("")}</svg>`;
  dom.treeMeta.innerHTML = `
    <span class="metric">order <strong>${tree.order}</strong></span>
    <span class="metric">height <strong>${tree.height}</strong></span>
    <span class="metric"><strong>${tree.size}</strong> keys</span>
    <span class="metric"><strong>${Object.keys(tree.nodes).length}</strong> nodes</span>
    <span class="metric">${entry.unique ? "unique" : "non-unique"}</span>`;
  return current;
}

// ----- Plan -----

function planNodeHtml(node, hl) {
  const cls = ["db-plan-node"];
  if (hl.planActive.has(node.id)) cls.push("is-active");
  else if (hl.planDone.has(node.id)) cls.push("is-done");
  const live = hl.planRows.has(node.id) ? hl.planRows.get(node.id) : node.actualRows;
  const actual = live === null || live === undefined ? "" : ` · actual ${live}${node.loops > 1 ? ` (${node.loops} loops)` : ""}`;
  const reason = node.reason ? `<div class="db-plan-reason">Why: ${esc(node.reason)}</div>` : "";
  const children = node.children.length ? `<div class="db-plan-children">${node.children.map((c) => planNodeHtml(c, hl)).join("")}</div>` : "";
  return `<details class="${cls.join(" ")}" open>
    <summary><span class="db-plan-op">${esc(node.op)}</span><span class="db-plan-detail">${esc(node.detail || "")}</span>
    <span class="db-plan-stats">est ${node.estRows} rows · cost ${node.estCost}${actual}</span></summary>
    ${reason}${children}</details>`;
}

function renderPlan(plan, hl, sql) {
  if (!plan) {
    dom.planView.innerHTML = '<p class="db-plan-empty">SELECT, UPDATE, DELETE and EXPLAIN statements show their plan here.</p>';
    dom.planMeta.innerHTML = "";
    return;
  }
  dom.planView.innerHTML = planNodeHtml(plan, hl);
  dom.planMeta.innerHTML = sql ? `<span class="metric" title="${esc(sql)}">${esc(sql.length > 48 ? sql.slice(0, 47) + "…" : sql)}</span>` : "";
}

// ----- Results -----

function resultCardHtml(r, script) {
  const head = `<div class="db-result-head"><span class="db-result-sql">${esc(r.sql.length > 400 ? r.sql.slice(0, 399) + "…" : r.sql)}</span>
    <span class="db-result-msg">${esc(r.error ? "Error: " + r.error.message : r.message)}</span></div>`;
  if (r.error) {
    let caret = "";
    if (r.error.position !== null && r.error.position !== undefined && script) {
      const info = lineInfo(script, r.error.position);
      caret = `<pre class="db-result-caret">line ${info.lineNo}: ${esc(info.lineText)}\n${" ".repeat(String(info.lineNo).length + 7 + info.col)}<span class="caret">^</span></pre>`;
    }
    return `<article class="db-result is-error">${head}${caret}</article>`;
  }
  if (!r.columns.length) return `<article class="db-result">${head}</article>`;
  const rows = r.rows.slice(0, MAX_RESULT_ROWS);
  const table = `<div class="db-result-table"><table class="data-table">
    <thead><tr>${r.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${valueHtml(v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${r.columns.length}" class="db-null">no rows</td></tr>`}</tbody>
  </table></div>`;
  const more = r.rows.length > rows.length ? `<p class="db-result-more">+ ${r.rows.length - rows.length} more rows</p>` : "";
  return `<article class="db-result">${head}${table}${more}</article>`;
}

function renderStats(model) {
  const rows = model.tables.reduce((n, t) => n + t.pages.reduce((m, p) => m + p.slots.filter((s) => !s.deleted).length, 0), 0);
  const pages = model.tables.reduce((n, t) => n + t.pages.length, 0);
  const trees = [...model.trees.values()].filter((e) => e.tree);
  const maxH = trees.length ? Math.max(...trees.map((e) => e.tree.height)) : 0;
  const lookups = model.pool.hits + model.pool.misses;
  const cells = [
    ["State", model.crashed ? "CRASHED" : "running"],
    ["Transaction", model.txn ? `T${model.txn.id} open` : "autocommit"],
    ["Tables", model.tables.length],
    ["Rows", rows],
    ["Heap pages", pages],
    ["Indexes", model.trees.size ? `${model.trees.size} (h ≤ ${maxH})` : "0"],
    ["WAL", `${model.wal.records.length} · LSN ${model.wal.flushedLsn}`],
    ["Hit rate", lookups ? `${Math.round((model.pool.hits / lookups) * 100)}%` : "—"],
  ];
  dom.engineStats.innerHTML = cells.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join("");
}

// ---------- App ----------

const SAMPLE_CONCEPT = {
  starter: "planner",
  "index-vs-scan": "planner",
  joins: "joins",
  aggregates: "planner",
  transactions: "wal",
  "btree-splits": "btree",
  "crash-recovery": "stealnoforce",
};

const STOP = new Error("STOPPED");

class DbLabApp {
  constructor() {
    this.audio = new LabCommon.AudioManager();
    const prefs = LabCommon.loadJSON(PREFS_KEY, {});
    this.prefs = {
      frames: prefs.frames || 6,
      policy: prefs.policy === "clock" ? "clock" : "lru",
      rowsPerPage: prefs.rowsPerPage || 4,
      btreeOrder: prefs.btreeOrder || 4,
      speed: prefs.speed || 60,
      stepMode: !!prefs.stepMode,
      teaching: prefs.teaching !== false,
    };
    this.db = DbCore.createDatabase({
      bufferFrames: this.prefs.frames,
      policy: this.prefs.policy,
      rowsPerPage: this.prefs.rowsPerPage,
      btreeOrder: this.prefs.btreeOrder,
    });
    this.model = modelFromSnapshot(this.db.snapshot());
    this.hl = emptyHighlights();
    this.selectedIndex = null;
    this.currentPlan = null;
    this.currentSql = "";
    this.playing = false;
    this.paused = false;
    this.stopped = false;
    this.skipping = false;
    this.stepResolver = null;
    this.tabEscapes = false;
    this.history = LabCommon.loadJSON(HISTORY_KEY, []);
    if (!Array.isArray(this.history)) this.history = [];
    this.cheat = null;
  }

  init() {
    LabCommon.initTheme(dom.themeToggle);
    LabCommon.initSound(dom.soundToggle, this.audio);
    this.cheat = LabCommon.initCheatSheet({ dialog: dom.cheatSheet, openBtn: dom.cheatSheetBtn, closeBtn: dom.cheatSheetClose });
    this.applyPrefsToControls();
    this.populateSamples();
    this.populateConcepts();
    this.bindEvents();
    this.renderHistory();
    const fromUrl = this.loadFromUrl();
    if (!fromUrl) {
      dom.sqlEditor.value = DbCore.SAMPLE_SCRIPTS.starter.sql;
      dom.sampleSelect.value = "starter";
      this.updateSampleDescription();
      this.run({ record: false });
      this.setStatus("Starter shop loaded and run — edit the SQL, or press “Run step-by-step” to watch the engine work");
    } else {
      this.syncFromEngine();
    }
    this.updateButtons();
    LabCommon.registerServiceWorker();
  }

  // ----- controls -----

  applyPrefsToControls() {
    dom.frames.value = String(this.prefs.frames);
    dom.framesValue.textContent = String(this.prefs.frames);
    dom.policy.value = this.prefs.policy;
    dom.rowsPerPage.value = String(this.prefs.rowsPerPage);
    dom.rowsPerPageValue.textContent = String(this.prefs.rowsPerPage);
    dom.btreeOrder.value = String(this.prefs.btreeOrder);
    dom.btreeOrderValue.textContent = String(this.prefs.btreeOrder);
    dom.speed.value = String(this.prefs.speed);
    dom.speedValue.textContent = String(this.prefs.speed);
    dom.stepMode.checked = this.prefs.stepMode;
    dom.teachingMode.checked = this.prefs.teaching;
    this.updateTeachingPanel();
  }

  savePrefs() {
    this.prefs = {
      frames: Number(dom.frames.value),
      policy: dom.policy.value,
      rowsPerPage: Number(dom.rowsPerPage.value),
      btreeOrder: Number(dom.btreeOrder.value),
      speed: Number(dom.speed.value),
      stepMode: dom.stepMode.checked,
      teaching: dom.teachingMode.checked,
    };
    LabCommon.saveJSON(PREFS_KEY, this.prefs);
  }

  populateSamples() {
    dom.sampleSelect.innerHTML = Object.entries(DbCore.SAMPLE_SCRIPTS)
      .map(([id, s]) => `<option value="${esc(id)}">${esc(s.title)}</option>`)
      .join("");
    this.updateSampleDescription();
  }

  updateSampleDescription() {
    const s = DbCore.SAMPLE_SCRIPTS[dom.sampleSelect.value];
    dom.sampleDescription.textContent = s ? s.description : "";
  }

  populateConcepts() {
    dom.conceptSelect.innerHTML = Object.entries(CONCEPTS)
      .map(([id, c]) => `<option value="${id}">${esc(c.title)}</option>`)
      .join("");
    this.showConcept("btree");
  }

  showConcept(id) {
    const c = CONCEPTS[id];
    if (!c) return;
    dom.conceptSelect.value = id;
    dom.conceptTitle.textContent = c.title;
    dom.learningTrivia.textContent = c.trivia;
    dom.learningUseCase.textContent = c.useCase;
    dom.learningCard.classList.remove("flipped");
  }

  bindEvents() {
    dom.runBtn.addEventListener("click", () => this.run());
    dom.stepRunBtn.addEventListener("click", () => this.runStepByStep());
    dom.clearBtn.addEventListener("click", () => {
      dom.results.innerHTML = "";
      dom.resultsMeta.innerHTML = "";
    });
    dom.loadSampleBtn.addEventListener("click", () => this.loadSample(dom.sampleSelect.value));
    dom.sampleSelect.addEventListener("change", () => this.updateSampleDescription());
    dom.pauseBtn.addEventListener("click", () => this.togglePause());
    dom.stopBtn.addEventListener("click", () => this.stopPlayback());
    dom.nextStepBtn.addEventListener("click", () => this.nextStep());
    dom.skipBtn.addEventListener("click", () => this.skipStatement());
    dom.crashBtn.addEventListener("click", () => this.crash());
    dom.recoverBtn.addEventListener("click", () => this.recover());
    dom.checkpointBtn.addEventListener("click", () => this.checkpoint());
    dom.resetDbBtn.addEventListener("click", () => this.resetDb("Database reset — empty, same settings"));
    dom.shareUrlBtn.addEventListener("click", () => this.copyShareUrl());
    dom.indexSelect.addEventListener("change", () => {
      this.selectedIndex = dom.indexSelect.value;
      this.selectedIndex = renderTree(this.model, this.hl, this.selectedIndex);
    });
    dom.conceptSelect.addEventListener("change", () => this.showConcept(dom.conceptSelect.value));
    dom.learningCard.addEventListener("click", () => dom.learningCard.classList.toggle("flipped"));
    dom.learningCard.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        dom.learningCard.classList.toggle("flipped");
      }
    });

    dom.frames.addEventListener("input", () => {
      dom.framesValue.textContent = dom.frames.value;
    });
    dom.frames.addEventListener("change", () => this.changePool());
    dom.policy.addEventListener("change", () => this.changePool());
    const rebuild = (input, label) => {
      input.addEventListener("input", () => {
        label.textContent = input.value;
      });
      input.addEventListener("change", () => {
        this.savePrefs();
        this.resetDb(`Database rebuilt empty: ${dom.rowsPerPage.value} rows per page, B+ tree order ${dom.btreeOrder.value} — press Run to reload your script`);
      });
    };
    rebuild(dom.rowsPerPage, dom.rowsPerPageValue);
    rebuild(dom.btreeOrder, dom.btreeOrderValue);
    dom.speed.addEventListener("input", () => {
      dom.speedValue.textContent = dom.speed.value;
      this.savePrefs();
    });
    dom.stepMode.addEventListener("change", () => {
      this.savePrefs();
      if (!dom.stepMode.checked) this.nextStep();
      this.updateButtons();
    });
    dom.teachingMode.addEventListener("change", () => {
      this.savePrefs();
      this.updateTeachingPanel();
    });

    dom.sqlEditor.addEventListener("keydown", (e) => this.handleEditorKey(e));
    dom.sqlEditor.addEventListener("input", () => {
      this.tabEscapes = false;
    });
    dom.sqlEditor.addEventListener("blur", () => {
      this.tabEscapes = false;
    });
    document.addEventListener("keydown", (e) => this.handleKeyboard(e));
  }

  handleEditorKey(e) {
    if (e.key === "Escape") {
      // Esc releases the Tab key so keyboard users can leave the editor.
      this.tabEscapes = true;
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && !this.tabEscapes && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const el = dom.sqlEditor;
      const { selectionStart: a, selectionEnd: b, value } = el;
      el.value = value.slice(0, a) + "  " + value.slice(b);
      el.selectionStart = el.selectionEnd = a + 2;
    }
  }

  handleKeyboard(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      this.run();
      return;
    }
    if (LabCommon.isTypingTarget(e.target)) return;
    if (LabCommon.isCheatSheetKey(e)) {
      e.preventDefault();
      this.cheat.toggle();
      return;
    }
    if (this.cheat.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {
      case "Space":
        if (this.playing) {
          e.preventDefault();
          this.togglePause();
        }
        break;
      case "KeyN":
        this.nextStep();
        break;
      case "Escape":
        this.stopPlayback();
        break;
      case "KeyK":
        this.crash();
        break;
      case "KeyV":
        this.recover();
        break;
      default:
        break;
    }
  }

  updateTeachingPanel() {
    dom.teachingPanel.classList.toggle("hidden", !dom.teachingMode.checked);
  }

  updateButtons() {
    const crashed = this.db.crashed;
    const busy = this.playing;
    dom.runBtn.disabled = busy || crashed;
    dom.stepRunBtn.disabled = busy || crashed;
    dom.loadSampleBtn.disabled = busy;
    dom.crashBtn.disabled = busy || crashed;
    dom.recoverBtn.disabled = busy || !crashed;
    dom.checkpointBtn.disabled = busy || crashed;
    dom.resetDbBtn.disabled = busy;
    [dom.frames, dom.policy, dom.rowsPerPage, dom.btreeOrder].forEach((el) => (el.disabled = busy));
    dom.pauseBtn.disabled = !busy;
    dom.stopBtn.disabled = !busy;
    dom.skipBtn.disabled = !busy;
    dom.nextStepBtn.disabled = !busy || !dom.stepMode.checked;
    dom.pauseBtn.textContent = this.paused ? "Resume" : "Pause";
    dom.runBtn.title = crashed ? "The database crashed — press Recover first" : "Ctrl/⌘ + Enter";
  }

  setStatus(text) {
    dom.statusText.textContent = text;
  }

  teach(text) {
    if (!text || !dom.teachingMode.checked) return;
    dom.teachingText.textContent = text;
  }

  // ----- rendering -----

  renderAll() {
    renderPool(this.model, this.hl);
    renderWal(this.model, this.hl);
    renderHeap(this.model, this.hl);
    this.selectedIndex = renderTree(this.model, this.hl, this.selectedIndex);
    renderPlan(this.currentPlan, this.hl, this.currentSql);
    renderStats(this.model);
  }

  renderTouched(touched) {
    if (touched.has("pool")) renderPool(this.model, this.hl);
    if (touched.has("wal")) renderWal(this.model, this.hl);
    if (touched.has("heap")) renderHeap(this.model, this.hl);
    if (touched.has("tree")) this.selectedIndex = renderTree(this.model, this.hl, this.selectedIndex);
    if (touched.has("plan")) renderPlan(this.currentPlan, this.hl, this.currentSql);
    if (touched.has("stats") || touched.has("pool") || touched.has("wal")) renderStats(this.model);
  }

  /** Re-reads the engine; keeps highlights so the last changes stay visible. */
  syncFromEngine() {
    this.model = modelFromSnapshot(this.db.snapshot());
    this.renderAll();
    this.updateButtons();
  }

  /** Marks what the given events changed, without animating them. */
  highlightChanges(events) {
    for (const ev of events) {
      if (ev.type === "row" && ev.op !== "scan" && ev.op !== "match") {
        this.hl.slots.set(ev.rid, ev.op === "delete" || ev.op === "undo" ? "is-undone" : "is-written");
        this.hl.pages.add(pageOf(ev.rid));
      }
      if (ev.type === "wal") this.hl.walNew.add(ev.record.lsn);
      if (ev.type === "btree") {
        const e = ev.event;
        if (e.type === "split" || e.type === "new-root") this.hl.nodes.set(`${ev.index}@${e.newNode || e.node}`, "is-split");
      }
      if (ev.type === "btree" && ev.event.type !== "visit" && ev.event.type !== "leaf-next") this.selectedIndex = this.selectedIndex || ev.index;
    }
  }

  showResults(results, script, append = false) {
    if (!append) dom.results.innerHTML = "";
    for (const r of results) dom.results.insertAdjacentHTML("beforeend", resultCardHtml(r, script));
    const all = [...dom.results.querySelectorAll(".db-result")];
    const errors = dom.results.querySelectorAll(".db-result.is-error").length;
    dom.resultsMeta.innerHTML = `<span class="metric"><strong>${all.length}</strong> statements</span>${errors ? `<span class="metric"><strong>${errors}</strong> error</span>` : ""}`;
  }

  lastPlanOf(results) {
    for (let i = results.length - 1; i >= 0; i--) if (results[i].plan) return results[i];
    return null;
  }

  // ----- running SQL -----

  run({ record = true } = {}) {
    if (this.playing || this.db.crashed) {
      if (this.db.crashed) this.setStatus("The database crashed — press Recover before running SQL");
      return;
    }
    const script = dom.sqlEditor.value;
    const results = this.db.execute(script);
    this.hl = emptyHighlights();
    this.highlightChanges(results.flatMap((r) => r.events));
    const planned = this.lastPlanOf(results);
    this.currentPlan = planned ? planned.plan : null;
    this.currentSql = planned ? planned.sql : "";
    this.syncFromEngine();
    this.showResults(results, script);
    const failed = results.find((r) => r.error);
    const rows = results.reduce((n, r) => n + r.rows.length, 0);
    const msg = failed
      ? `Stopped at an error after ${plural(results.length - 1, "statement")}: ${failed.error.message}`
      : `Ran ${plural(results.length, "statement")} — ${plural(rows, "row")} returned`;
    this.setStatus(msg);
    LabCommon.announce(dom.a11yAnnouncer, msg);
    if (failed) this.audio.alert();
    if (record) this.recordRun({ mode: "run", results, script });
  }

  async runStepByStep() {
    if (this.playing || this.db.crashed) return;
    const script = dom.sqlEditor.value;
    const split = DbCore.splitStatements(script);
    const results = [];
    dom.results.innerHTML = "";
    this.beginPlayback();
    try {
      for (let i = 0; i < split.statements.length && !this.stopped; i++) {
        const stmt = split.statements[i];
        this.hl = emptyHighlights();
        this.model = modelFromSnapshot(this.db.snapshot());
        const [result] = this.db.execute(stmt.sql);
        if (result.error && result.error.position !== null && result.error.position !== undefined) result.error.position += stmt.start;
        this.currentPlan = result.plan;
        this.currentSql = stmt.sql;
        this.renderAll();
        this.setStatus(`Statement ${i + 1} of ${split.statements.length}: ${stmt.sql.length > 70 ? stmt.sql.slice(0, 69) + "…" : stmt.sql}`);
        this.teach(`Running statement ${i + 1}: ${stmt.sql.split("\n")[0]}`);
        await this.playEvents(result.events);
        results.push(result);
        this.syncFromEngine();
        this.showResults([result], script, true);
        if (result.error) break;
      }
      if (!this.stopped && split.error && !results.some((r) => r.error)) {
        const parseFail = { sql: split.error.sql, kind: null, columns: [], rows: [], rowsAffected: 0, message: split.error.message, plan: null, events: [], error: { message: split.error.message, position: split.error.position } };
        results.push(parseFail);
        this.showResults([parseFail], script, true);
      }
    } finally {
      const stopped = this.stopped;
      this.endPlayback();
      this.syncFromEngine();
      const failed = results.find((r) => r.error);
      this.setStatus(
        stopped
          ? `Stopped after ${plural(results.length, "statement")} (statements already run stay applied)`
          : failed
          ? `Stopped at an error: ${failed.error.message}`
          : `Finished ${plural(results.length, "statement")} step by step`
      );
      if (results.length) this.recordRun({ mode: "step", results, script });
    }
  }

  beginPlayback() {
    this.playing = true;
    this.paused = false;
    this.stopped = false;
    this.skipping = false;
    this.updateButtons();
  }

  endPlayback() {
    this.playing = false;
    this.paused = false;
    this.skipping = false;
    this.stepResolver = null;
    this.updateButtons();
  }

  /** Steps the views through real events. Quiet events apply without a pause. */
  async playEvents(events, onEvent = null) {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (this.stopped || this.skipping) {
        applyEvent(this.model, this.hl, ev);
        if (onEvent) onEvent(ev);
        continue;
      }
      const isPoolEvent = ["hit", "miss", "evict", "write", "clock-sweep"].includes(ev.type);
      if (isPoolEvent) this.hl.frames.clear();
      const touched = applyEvent(this.model, this.hl, ev);
      if (onEvent) onEvent(ev);
      const text = narrate(ev, this.model.pool.policy);
      const visible = text !== null || (ev.type === "btree" && ev.event.type === "visit") || (ev.type === "row" && ev.op === "scan");
      if (ev.type === "btree" && ev.event.type !== "visit") this.selectedIndex = this.selectedIndex || ev.index;
      if (!visible) {
        if (ev.type === "btree-state") {
          this.renderTouched(touched);
          this.hl.nodes.clear();
        }
        continue;
      }
      this.renderTouched(touched);
      if (text) {
        this.teach(text);
        LabCommon.announce(dom.a11yAnnouncer, dom.teachingMode.checked ? text : "");
      }
      this.playSound(ev);
      try {
        await this.waitStep();
      } catch (err) {
        if (err !== STOP) throw err;
      }
    }
    this.skipping = false;
  }

  playSound(ev) {
    if (ev.type === "hit") this.audio.beep(760, 0.02, 0.025);
    else if (ev.type === "miss") this.audio.beep(420, 0.03, 0.03);
    else if (ev.type === "evict") this.audio.alert();
    else if (ev.type === "log-flush") this.audio.success();
    else if (ev.type === "btree" && ev.event.type === "split") this.audio.beep(980, 0.05, 0.04);
  }

  async waitStep() {
    if (this.stopped) throw STOP;
    if (dom.stepMode.checked) {
      await new Promise((resolve) => {
        this.stepResolver = resolve;
      });
      if (this.stopped) throw STOP;
      return;
    }
    while (this.paused && !this.stopped && !this.skipping) await LabCommon.sleep(60);
    const delay = LabCommon.delayForSpeed(dom.speed.value);
    if (delay && !this.skipping) await LabCommon.sleep(delay);
  }

  resolveStep() {
    if (this.stepResolver) {
      const resolve = this.stepResolver;
      this.stepResolver = null;
      resolve();
    }
  }

  togglePause() {
    if (!this.playing) return;
    this.paused = !this.paused;
    this.updateButtons();
    this.setStatus(this.paused ? "Paused — Space to resume" : "Playing…");
  }

  nextStep() {
    this.resolveStep();
  }

  skipStatement() {
    if (!this.playing) return;
    this.skipping = true;
    this.resolveStep();
  }

  stopPlayback() {
    if (!this.playing) return;
    this.stopped = true;
    this.resolveStep();
    this.setStatus("Stopping…");
  }

  // ----- failure & durability -----

  crash() {
    if (this.playing || this.db.crashed) return;
    const { lost } = this.db.crash();
    const lsns = lost.records.map((r) => r.lsn);
    const parts = [
      `${plural(lost.logRecords, "unflushed log record")}${lsns.length ? ` (LSN ${lsns[0]}–${lsns[lsns.length - 1]})` : ""}`,
      `${plural(lost.dirtyPages.length, "dirty page")}${lost.dirtyPages.length ? ` (${lost.dirtyPages.slice(0, 6).join(", ")}${lost.dirtyPages.length > 6 ? ", …" : ""})` : ""}`,
    ];
    dom.crashDetail.textContent =
      `Lost: ${parts.join(" and ")}, plus every in-memory index.` +
      (lost.openTxn ? ` Transaction T${lost.openTxn} was still open — after restart it is a loser.` : "") +
      " Disk and the durable log are all that survived. Press Recover.";
    dom.crashTitle.textContent = "⚡ The database crashed.";
    dom.crashBanner.hidden = false;
    dom.crashBanner.classList.remove("is-recovered");
    this.setRecoveryPhase(null);
    this.hl = emptyHighlights();
    this.currentPlan = null;
    this.syncFromEngine();
    this.showConcept("stealnoforce");
    this.audio.alert();
    this.setStatus("⚡ Crash! Memory is gone — press Recover (V) to restart the database");
    this.teach("Power loss: the buffer pool, unflushed log records and the indexes are gone. Only pages already written to disk and the durable part of the log remain.");
    LabCommon.announce(dom.a11yAnnouncer, "The database crashed.");
  }

  setRecoveryPhase(phase) {
    const order = ["analysis", "redo", "undo", "rebuild", "done"];
    const at = phase ? order.indexOf(phase) : -1;
    dom.recoverySteps.querySelectorAll("li").forEach((li) => {
      const i = order.indexOf(li.dataset.phase);
      li.classList.toggle("is-active", i === at && phase !== "done");
      li.classList.toggle("is-done", i < at || (phase === "done" && i <= at));
    });
  }

  async recover() {
    if (this.playing || !this.db.crashed) return;
    this.model = modelFromSnapshot(this.db.snapshot());
    this.hl = emptyHighlights();
    const { events, summary } = this.db.recover();
    this.showConcept("aries");
    this.beginPlayback();
    this.setStatus("Recovering: analysis → redo → undo → rebuild indexes");
    try {
      await this.playEvents(events, (ev) => {
        if (ev.type === "recovery") this.setRecoveryPhase(ev.phase);
      });
    } finally {
      this.endPlayback();
      this.setRecoveryPhase("done");
      this.syncFromEngine();
    }
    const msg = `Recovered. Winners [${summary.winners.map((t) => "T" + t).join(", ") || "none"}], losers [${summary.losers.map((t) => "T" + t).join(", ") || "none"}]. Redo applied ${summary.redone} and skipped ${summary.skipped} (pages already newer); undo rolled back ${summary.undone}.`;
    dom.crashBanner.classList.add("is-recovered");
    dom.crashTitle.textContent = "✓ Restarted after the crash.";
    dom.crashDetail.textContent = msg;
    this.setStatus(msg);
    this.teach(msg);
    this.audio.success();
    LabCommon.announce(dom.a11yAnnouncer, msg);
  }

  checkpoint() {
    if (this.playing || this.db.crashed) return;
    const { events } = this.db.checkpoint();
    this.hl = emptyHighlights();
    events.forEach((ev) => applyEvent(this.model, this.hl, ev));
    this.syncFromEngine();
    const written = events.filter((e) => e.type === "write").length;
    const msg = `Checkpoint: ${plural(written, "dirty page")} written, log flushed to LSN ${this.model.wal.flushedLsn}. Recovery will start its scan here.`;
    this.setStatus(msg);
    this.teach(msg);
  }

  resetDb(message) {
    if (this.playing) return;
    this.db.reset({ rowsPerPage: Number(dom.rowsPerPage.value), btreeOrder: Number(dom.btreeOrder.value), bufferFrames: Number(dom.frames.value), policy: dom.policy.value });
    this.hl = emptyHighlights();
    this.currentPlan = null;
    this.currentSql = "";
    this.selectedIndex = null;
    dom.crashBanner.hidden = true;
    dom.results.innerHTML = "";
    dom.resultsMeta.innerHTML = "";
    this.syncFromEngine();
    if (message) {
      this.setStatus(message);
      LabCommon.toast(dom.toast, message.split(" — ")[0]);
    }
  }

  changePool() {
    if (this.playing) return;
    this.savePrefs();
    const { events } = this.db.setOptions({ bufferFrames: Number(dom.frames.value), policy: dom.policy.value });
    const written = events.filter((e) => e.type === "write").length;
    this.hl = emptyHighlights();
    this.syncFromEngine();
    const msg = `Buffer pool is now ${dom.frames.value} frames with ${dom.policy.value === "clock" ? "Clock" : "LRU"} replacement${written ? ` (${plural(written, "dirty page")} flushed first)` : ""}`;
    this.setStatus(msg);
    LabCommon.toast(dom.toast, msg);
  }

  loadSample(id) {
    const sample = DbCore.SAMPLE_SCRIPTS[id];
    if (!sample || this.playing) return;
    dom.sampleSelect.value = id;
    this.updateSampleDescription();
    dom.sqlEditor.value = sample.sql;
    this.resetDb(null);
    this.showConcept(SAMPLE_CONCEPT[id] || "planner");
    this.setStatus(`Loaded “${sample.title}” into a fresh database — press Run, or Run step-by-step to watch`);
  }

  // ----- sharing & history -----

  copyShareUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    const text = dom.sqlEditor.value;
    const sampleId = Object.keys(DbCore.SAMPLE_SCRIPTS).find((id) => DbCore.SAMPLE_SCRIPTS[id].sql === text);
    if (sampleId) {
      url.searchParams.set("sample", sampleId);
    } else {
      const encoded = base64UrlEncode(text);
      if (encoded.length > MAX_SHARE_CHARS) {
        LabCommon.toast(dom.toast, "Script is too long to share in a link");
        return;
      }
      url.searchParams.set("sql", encoded);
    }
    LabCommon.copyText(url.toString()).then(() => LabCommon.toast(dom.toast, "Share URL copied"));
    history.replaceState(null, "", url.search);
  }

  loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const sample = params.get("sample");
    if (sample && DbCore.SAMPLE_SCRIPTS[sample]) {
      dom.sampleSelect.value = sample;
      this.updateSampleDescription();
      dom.sqlEditor.value = DbCore.SAMPLE_SCRIPTS[sample].sql;
      this.showConcept(SAMPLE_CONCEPT[sample] || "planner");
      this.setStatus(`Loaded the shared sample “${DbCore.SAMPLE_SCRIPTS[sample].title}” — press Run`);
      return true;
    }
    const sql = params.get("sql");
    if (sql && sql.length <= MAX_SHARE_CHARS) {
      try {
        dom.sqlEditor.value = base64UrlDecode(sql);
        this.setStatus("Loaded a shared script — read it, then press Run");
        return true;
      } catch {
        LabCommon.toast(dom.toast, "That share link couldn't be decoded");
      }
    }
    return false;
  }

  recordRun({ mode, results, script }) {
    const sampleId = Object.keys(DbCore.SAMPLE_SCRIPTS).find((id) => DbCore.SAMPLE_SCRIPTS[id].sql === script);
    this.history.unshift({
      timestamp: new Date().toISOString(),
      mode,
      label: sampleId ? DbCore.SAMPLE_SCRIPTS[sampleId].title : (results[0] && results[0].sql.slice(0, 48)) || "script",
      statements: results.length,
      errors: results.filter((r) => r.error).length,
      rows: results.reduce((n, r) => n + r.rows.length, 0),
      events: results.reduce((n, r) => n + r.events.length, 0),
    });
    this.history = this.history.slice(0, MAX_HISTORY);
    LabCommon.saveJSON(HISTORY_KEY, this.history);
    this.renderHistory();
  }

  renderHistory() {
    if (!this.history.length) {
      dom.historyList.innerHTML = '<li class="history-empty">No runs yet</li>';
      return;
    }
    dom.historyList.innerHTML = this.history
      .map((h) => {
        const time = new Date(h.timestamp).toLocaleTimeString();
        return `<li class="history-item">
          <span class="history-primary">${esc(h.label)} · ${h.mode === "step" ? "step-by-step" : "run"}</span>
          <span class="history-meta">${esc(time)} · ${plural(h.statements, "statement")} · ${plural(h.rows, "row")} · ${plural(h.events, "event")}${h.errors ? ` · ${plural(h.errors, "error")}` : ""}</span>
        </li>`;
      })
      .join("");
  }
}

const app = new DbLabApp();
app.init();
