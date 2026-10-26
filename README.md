# Algo Lab — Algorithms, Databases & Hypervisors, Visualized

**Live lab:** [https://sebby1770.github.io/algorithm-visualiser/](https://sebby1770.github.io/algorithm-visualiser/)

An interactive systems teaching lab built with pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step, no npm runtime dependencies.

Five labs share the same chrome, theme, and sound toggle:

- **Sort Lab** (`index.html`) — 16 sorting algorithms
- **Path Lab** (`pathfinding.html`) — 9 pathfinding algorithms + maze generators
- **Search Lab** (`search.html`) — 7 searching algorithms
- **DB Lab** (`database.html`) — a working SQL database engine: parser, cost-based planner, B+ tree indexes, buffer pool, write-ahead log, ARIES-style crash recovery
- **Hypervisor Lab** (`hypervisor.html`) — a virtual machine monitor running real guest programs: trap-and-emulate VM exits, EPT vs shadow paging, vCPU scheduling, memory overcommit, live migration

![Sort](https://img.shields.io/badge/sort-16-blue) ![Pathfinding](https://img.shields.io/badge/path-9-indigo) ![Search](https://img.shields.io/badge/search-7-teal) ![DB](https://img.shields.io/badge/SQL-engine-orange) ![Hypervisor](https://img.shields.io/badge/VMM-simulator-pink) ![PWA](https://img.shields.io/badge/PWA-offline-purple)

## Running

No build tools. Open the files in a modern browser, or serve locally (recommended for the service worker / PWA):

```bash
python3 -m http.server
# → http://localhost:8000                    Sort Lab
# → http://localhost:8000/pathfinding.html   Path Lab
# → http://localhost:8000/search.html        Search Lab
# → http://localhost:8000/database.html      DB Lab
# → http://localhost:8000/hypervisor.html    Hypervisor Lab
```

macOS: `open index.html` · Linux: `xdg-open index.html`

> **Note:** The service worker requires HTTP(S). Opening a file directly may not register it.

## Tests

Every engine is a pure module that also loads in Node, covered by Node’s built-in test runner (no packages to install):

```bash
node --test tests/*.test.js
```

| Suite | Covers |
|-------|--------|
| `sorting.test.js`, `pathfinding.test.js`, `search.test.js` | the original three labs |
| `database.test.js` | SQL parsing, NULL logic, joins vs a brute-force join, planner choices, B+ tree property tests (random inserts/deletes at orders 3–6), LRU vs Clock, the WAL rule, rollback, crash recovery after steal, checkpoints, determinism |
| `hypervisor.test.js` | the assembler, instruction semantics, every exit reason and its cost, EPT vs shadow equivalence, lazy allocation, weighted fairness, KSM + copy-on-write, swap data integrity, ballooning, migration convergence, 1500-tick invariant checks of every scenario, determinism |
| `site.test.js` | every page’s scripts/styles exist and are precached, the five-lab switcher is identical everywhere, the manifest and Pages deploy are complete |

CI (`.github/workflows/ci.yml`, Node 20) syntax-checks every browser script with `node --check`, then runs the suites. Static files deploy to GitHub Pages (`.github/workflows/pages.yml`), which copies `*.html *.css *.js` and fails if anything the service worker precaches is missing.

## Sort Lab

### Algorithms (16)

| Algorithm | Best | Average | Worst | Stable | In-place | Memory |
|-----------|------|---------|-------|--------|----------|--------|
| Bubble | O(n) | O(n²) | O(n²) | Yes | Yes | O(1) |
| Selection | O(n²) | O(n²) | O(n²) | No | Yes | O(1) |
| Insertion | O(n) | O(n²) | O(n²) | Yes | Yes | O(1) |
| Merge | O(n log n) | O(n log n) | O(n log n) | Yes | No | O(n) |
| Quick | O(n log n) | O(n log n) | O(n²) | No | Yes | O(log n) |
| Heap | O(n log n) | O(n log n) | O(n log n) | No | Yes | O(1) |
| Shell | O(n log n) | O(n^4/3) | O(n²) | No | Yes | O(1) |
| Radix | O(nk) | O(nk) | O(nk) | Yes | No | O(n + k) |
| Counting | O(n + k) | O(n + k) | O(n + k) | Yes | No | O(k) |
| Cocktail Shaker | O(n) | O(n²) | O(n²) | Yes | Yes | O(1) |
| Comb | O(n log n) | O(n² / 2ᵖ) | O(n²) | No | Yes | O(1) |
| Gnome | O(n) | O(n²) | O(n²) | Yes | Yes | O(1) |
| Odd-Even | O(n) | O(n²) | O(n²) | Yes | Yes | O(1) |
| Pancake | O(n) | O(n²) | O(n²) | No | Yes | O(1) |
| Cycle | O(n²) | O(n²) | O(n²) | No | Yes | O(1) |
| Timsort | O(n) | O(n log n) | O(n log n) | Yes | No | O(n) |

Radix is LSD base 10 (non-negative integers). Comb uses a 1.3 shrink factor. Pancake sorts by prefix reversals. Cycle sort writes each element at most once. Timsort (simplified) finds natural runs, reverses descending runs, insertion-sorts to minrun, then merges pairwise.

Pure implementations live in `sorting-core.js` (`SortCore` in the browser / `module.exports` in Node). Visual runs still use `SortRunner` in `script.js`. Silent tournaments use `SortCore` when it is loaded.

### Dataset generators

Random · Sorted · Nearly Sorted · Reversed · Few Unique · Sawtooth · Custom Input (comma-separated or JSON)

### Features

- Live comparisons, swaps, writes, and elapsed ms
- Pause / Resume, Stop, and Step Mode
- Algorithm Race (dual pane)
- Teaching Mode (narrated steps) — merge sort compares **aux keys**, not overwritten live bars
- Identity colors (stability hues from original indices; equal heights stay distinguishable)
- Bar values shown when n ≤ 24
- Quiz Mode (guess the algorithm — name, Big-O grid, and learning cards stay hidden)
- Presentation Mode
- Access heatmap + operations sparkline
- Algorithm recommender
- Benchmark tournament (all 16) with comparison matrix
- Learning cards (trivia + use cases)
- Run history (last 8, `localStorage` key `sortLabHistory`)
- Share URL, CSV export, copy summary
- Keyboard: `Space` pause · `S` start · `G` generate · `R` reset · `Esc` exit present · `?` cheat sheet

## Path Lab

### Algorithms (9)

| Algorithm | Time | Weighted | Complete | Optimal | Heuristic |
|-----------|------|----------|----------|---------|-----------|
| BFS | O(V + E) | No | Yes | Unweighted shortest | None |
| DFS | O(V + E) | No | Yes | No | None |
| Dijkstra | O((V + E) log V) | Yes | Yes | Yes (non-negative) | None |
| A* | O((V + E) log V) | Yes | Yes | Yes (admissible h) | Manhattan / Chebyshev if diagonal |
| Greedy Best-First | O((V + E) log V) | No | Yes | No | Manhattan / Chebyshev if diagonal |
| Bidirectional BFS | O(V + E) | No | Yes | Unweighted shortest | None |
| Bidirectional Dijkstra | O((V + E) log V) | Yes | Yes | Yes (non-negative) | None |
| Weighted A* | O((V + E) log V) | Yes | Yes | No (w=1.5) | Manhattan / Chebyshev × 1.5 |
| IDA* | O(b^d) | Yes | Yes | Yes (admissible h) | Manhattan / Chebyshev |

Path cost is the sum of cell weights along the path **excluding start, including end**. Empty cells weigh `1`; weight cells weigh `5`. BFS / DFS / bidirectional BFS treat every step as cost 1 when *searching*, but reported path cost still uses actual weights. Bidirectional Dijkstra searches from both terminals with the same cell weights as Dijkstra and reconstructs a cheapest path at the meeting point.

Weighted A* scales the heuristic by `opts.weight` (default **1.5**). IDA* raises the f-cost bound by the minimum overflow; expansions are capped at 20 000.

### Maze generators

| Generator | Notes |
|-----------|--------|
| Empty | Open grid, start left-center, end right-center |
| Recursive Backtracker | Perfect maze (DFS carve); start top-left, end bottom-right |
| Prim | Perfect-ish carve via random frontier |
| Recursive Division | Adds walls with one gap per divider |
| Binary Tree | South/east biased corridors |
| Scatter Walls | Random walls (start/end stay free) |
| Kruskal | Randomized Kruskal (union-find on even/even cells) |

Carved mazes prefer even/even passage cells. Even dimensions get a short corridor so the bottom-right corner stays reachable. All maze helpers **return a new grid** and never mutate an input. Kruskal, recursive backtracker, Prim, and binary-tree mazes attach a `carveOrder` array of newly emptied `{r,c}` cells. Path Lab animates that order (skipped when `prefers-reduced-motion` is set or when the order is longer than 400).

### Features

- Interactive grid: drag to paint **Wall / Weight / Erase**; drag **S** / **E** to move terminals
- **Live re-path**: after a completed search, painting or moving S/E (pointer-up or Space/Enter on the grid) re-runs the last algorithm instantly
- Hover **g / h / f** on A*, Dijkstra, and Weighted A* cells after a search
- Keyboard editor: focus the grid — **Arrows move · Space paint** (Space/Enter on S/E picks up the terminal; Space/Enter also re-paths)
- Diagonal movement toggle (no corner-cutting through walls)
- Race mode + algorithm tournament (rank: path cost → nodes expanded → time)
- Teaching Mode, Step Mode, pause / resume / stop
- Algorithm profile + learning cards
- Run history (last 8, `localStorage` key `pathLabHistory`)
- Share URL encodes algorithm, maze, rows, cols, speed, diagonal, and the painted **map** (`rowsxcols;sr,sc;er,ec;rle`)
- Keyboard: `Arrows` cursor · `Space` paint (grid) / pause · `S` start · `G` maze · `R` reset · `C` clear path · `Esc` stop · `1` wall · `2` weight · `3` erase · `?` cheat sheet

Glyphs (not color alone): **S** start, **E** end, **●** weight.

## Search Lab

### Algorithms (7)

| Algorithm | Average | Worst | Needs sorted |
|-----------|---------|-------|--------------|
| Linear | O(n) | O(n) | No |
| Binary | O(log n) | O(log n) | Yes |
| Jump | O(√n) | O(√n) | Yes |
| Interpolation | O(log log n) | O(n) | Yes |
| Exponential | O(log n) | O(log n) | Yes |
| Ternary | O(log n) | O(log n) | Yes |
| Fibonacci | O(log n) | O(log n) | Yes |

Each core routine returns `{ found, index, probes, probeOrder }` and **never mutates** the input. Binary / jump / interpolation / exponential / ternary / Fibonacci auto-sort the displayed array and show a note.

### Features

- Array as value cells (not bars): current probe, low/high bounds, found, eliminated
- Random sorted or custom datasets, target value, speed, pause / step / reset
- Teaching Mode with `aria-live` narration
- Race: linear vs binary on the same data
- Metrics: probes, found index, elapsed ms
- Algorithm profiles + learning cards
- Share URL: `?algo=&n=&target=`
- Run history (last 8, `localStorage` key `searchLabHistory`)
- Keyboard: `Space` pause · `S` start · `G` generate · `R` reset · `?` cheat sheet

## DB Lab

A small but real relational database engine (`db-core.js`, global `DbCore`) and a page that animates its internals. Every statement is parsed, planned, executed and logged by the engine; the page replays the engine’s own event trace — it never fakes an animation.

### SQL supported

`CREATE TABLE` (INT / REAL / TEXT, `PRIMARY KEY`, `NOT NULL`, `UNIQUE`) · `CREATE [UNIQUE] INDEX` · `DROP TABLE [IF EXISTS]` · `INSERT … VALUES` (multi-row) · `SELECT [DISTINCT]` with inner `JOIN … ON`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY` (columns, aliases, positions), `LIMIT … OFFSET` · `UPDATE` · `DELETE` · `BEGIN` / `COMMIT` / `ROLLBACK` · `EXPLAIN` and `EXPLAIN ANALYZE`

Expressions: arithmetic (INT ÷ INT truncates; ÷ 0 is NULL), `||`, comparisons, `AND`/`OR`/`NOT` with SQL three-valued logic, `IS [NOT] NULL`, `[NOT] BETWEEN`, `[NOT] IN (…)`, `[NOT] LIKE` (case-insensitive), `COUNT(*)`, `COUNT([DISTINCT] x)`, `SUM`, `AVG`, `MIN`, `MAX`, `LOWER`, `UPPER`, `LENGTH`, `ABS`, `ROUND`, `COALESCE`. Strict typing (no silent coercion), constraint errors, and syntax errors that point at the exact character.

### Engine internals

| Layer | What it does |
|-------|--------------|
| Planner | Cost model in page reads with statistics (row count, distinct values, min/max). Chooses **SeqScan vs IndexScan** (and explains why), pushes single-table predicates below joins, and picks **Index Nested Loop**, **Hash Join** (build the smaller side) or **Nested Loop** |
| Executor | Operators materialise rows but emit events in true execution order; nested loops genuinely re-scan their inner input; `actualRows`/`loops` for EXPLAIN ANALYZE |
| B+ tree | Order 3–8, leaf chaining for range scans, real split / borrow / merge / root collapse, and an invariant checker |
| Buffer pool | 3–16 frames, **LRU** or **Clock** (second chance), pin counts, dirty bits, hit/miss/eviction counters; index node pages are charged to the pool too |
| WAL | Log-first changes with page LSNs, forced at COMMIT, and the **WAL rule** enforced before any dirty page reaches disk (steal / no-force) |
| Transactions | Autocommit or `BEGIN`; statement-level atomicity; `ROLLBACK` writes compensation log records (CLRs) |
| Recovery | **Crash** drops the pool, the unflushed log tail and the in-memory indexes; **Recover** runs ARIES-style analysis → redo (repeating history) → undo → index rebuild; **Checkpoint** shortens redo |

Simplifications are deliberate and documented in the code: single session (no locking), DDL written straight through to the catalog, indexes rebuilt rather than logged, tombstoned heap slots never reused.

### Features

- SQL console with seven sample scripts: starter shop, index vs full scan, three join algorithms, GROUP BY & aggregates, transactions & rollback, B+ tree splits & merges, crash & recovery
- **Run** (instant) or **Run step-by-step**: each statement runs on its own and its real events animate the query plan, B+ tree (redrawn after every index operation), buffer pool frames, heap pages and the WAL, with plain-English narration
- Plan tree with estimated vs actual rows, cost, and the planner’s reason for each choice
- Crash banner listing exactly what was lost, plus a five-phase recovery stepper with winners / losers / redone / skipped / undone
- Engine options: frames, LRU / Clock, rows per page, B+ tree order
- Step Mode, pause / stop / skip, concept cards, run history (`dbLabHistory`), share links (`?sample=` or `?sql=` base64url)
- Keyboard: `Ctrl/⌘+Enter` run · `Space` pause · `N` next step · `Esc` stop · `K` crash · `V` recover · `?` cheat sheet

## Hypervisor Lab

A virtual machine monitor simulator (`hypervisor-core.js`, global `HyperCore`). Guests run real programs written in **HV-ASM**, a tiny instruction set with an assembler; one tick is one instruction slot per physical CPU, and everything is deterministic for a seed.

### What it models

| Area | Details |
|------|---------|
| Trap-and-emulate | Ordinary instructions run directly; `OUT`, `IN`, `HLT`, `CLI`/`STI`, `CPUID`, `VMCALL`, `PAUSE` and (under shadow paging) `WRPT` cause **VM exits** that keep the pCPU in the VMM for a per-reason cost |
| Memory virtualization | Guest-virtual → guest-physical (guest page table) → host-physical (p2m / EPT). **EPT**: no exits on page-table writes, 3-reference walks per TLB miss. **Shadow paging**: 1-reference walks but `PT_WRITE` and `SHADOW_PF` exits. Per-vCPU 4-entry TLB tagged by VM |
| Scheduling | **Round-robin**, Xen-style **credit** (weights, UNDER/OVER priority, caps) and CFS-style **fair share**, with a timer interrupt (`EXTINT`) at the end of each quantum |
| Memory overcommit | Lazy allocation (`EPT_VIOLATION` on first touch), **KSM** page sharing with copy-on-write, **ballooning** (hypervisor-requested or `VMCALL 1`), and host **swap** |
| Live migration | Iterative **pre-copy** over a link of configurable bandwidth, dirty-page tracking per round, stop-and-copy with measured downtime, switchover to “host B” |

`checkInvariants()` cross-checks frames, p2m tables, swap, TLBs, shadow tables and run queues; the tests run it throughout 1500 ticks of every scenario.

### Scenarios

Trap-and-emulate · Shadow paging vs EPT · Credit scheduler (512/256/256 weights) · Memory overcommit (24 guest pages on 12 frames) · Live migration (a converging VM vs a dirty writer that never converges) · Noisy neighbour (CPU cap) · Spin lock & PAUSE

### Features

- pCPU timeline: guest time in each VM’s colour, VMM time striped, idle grey; hover to inspect any tick
- VM cards: vCPU registers, pc, interrupt flag and TLB; the program listing with privileged instructions highlighted and a live marker per vCPU; exits by reason; console output; pause / balloon / migrate / destroy
- Host memory map (frames by owner, shared frames with reference counts, swap slots, per-VM p2m strips), the latest address translation drawn stage by stage, TLB statistics
- VM exit log with filter and exits-per-tick sparkline; CPU fairness bars (actual share vs weight entitlement and cap); migration rounds chart and host B
- Live controls: scheduler, EPT / shadow, quantum, KSM; rebuild controls: pCPUs, host frames; **Add a VM** with any sample program or your own HV-ASM (assembler errors shown with line numbers)
- Teaching Mode narration, concept cards, run history (`hypervisorLabHistory`), share links (`?scenario=&paging=&scheduler=&pcpus=`)
- Keyboard: `Space` play/pause · `N` or `.` step · `R` reset · `P` toggle paging · `?` cheat sheet

## Shared UI

- Lab switcher in the top bar: Sort Lab · Path Lab · Search Lab · DB Lab · Hypervisor Lab (wraps on phones)
- Dark / light theme — `localStorage` key `theme` (shared), applied before first paint; native controls follow it via `color-scheme`
- Sound beeps (Web Audio) — `localStorage` key `sound` (shared)
- PWA manifest with a shortcut per lab + service worker (`algo-lab-v8`): network-first with revalidation, cached copies for offline use, and share links with query strings open offline
- Skip link, keyboard cheat sheet (`?`), `aria-live` status and narration, `:focus-visible` outlines, `prefers-reduced-motion` support
- The two newer labs share `lab-common.js` (theme, sound, cheat sheet, toast, clipboard, storage, playback timing)

## File structure

```
algorithm-visualiser/
├── index.html · script.js · sorting-core.js          # Sort Lab
├── pathfinding.html · pathfinding.js · pathfinding-core.js   # Path Lab
├── search.html · search.js · search-core.js          # Search Lab
├── database.html · database.js · database.css · db-core.js   # DB Lab
├── hypervisor.html · hypervisor.js · hypervisor.css · hypervisor-core.js   # Hypervisor Lab
├── lab-common.js              # Shared chrome for the newer labs
├── style.css                  # Shared theme and components
├── tests/                     # node --test suites (one per engine + site.test.js)
├── .github/workflows/         # CI + GitHub Pages deploy
├── sw.js · manifest.json      # PWA
├── CHANGELOG.md · LICENSE · README.md
```

Each `*-core.js` file is a pure, UI-free module: `SortCore`, `PathCore`, `SearchCore`, `DbCore` and `HyperCore` in the browser, `module.exports` in Node.

## License

MIT — do whatever you like.
