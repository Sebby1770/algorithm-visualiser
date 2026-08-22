# Changelog

All notable changes to Algo Lab (Algorithm Visualizer).

## [2026-08-22] — v6 Sorting Core

### Added
- **Four new sorting algorithms**: Comb Sort, Gnome Sort, Cycle Sort (provably minimal
  writes — great for the writes metric), and a simplified TimSort (insertion-sorted
  minruns + merge passes with the already-ordered shortcut)
- **`sorting-core.js`** — every sorting algorithm now lives in one dependency-free
  module as a pure step generator (works in the browser as `SortCore` and in Node via
  `require`). The page, the tests, and the profiler all consume the same op stream.
- **Complexity Profiler** — one click benchmarks all 14 algorithms at
  n = 16, 32, 64, 128, 256, 512 on the current dataset shape, draws a log-log chart,
  and reports each algorithm's measured growth exponent next to its theoretical class
- **47 sorting unit tests** (`node --test tests/sorting.test.js`): correctness on every
  dataset shape and edge case, stability proofs via tagged keys, cycle sort's ≤ n write
  bound and zero-writes-on-sorted property, exact bubble counts on reversed input, and
  exponent-estimator checks that separate the quadratic sorts from the linearithmic ones

### Changed
- `SortRunner` no longer hardcodes algorithm logic — it animates the `SortCore`
  operation stream (compare / swap / write / touch / counts / mark ops), which keeps
  metrics, narration, heatmap, sound, and step mode identical across all algorithms
- Tournament, race mode, and quiz automatically include the four new algorithms
- Service worker cache bumped to v6 and now precaches `sorting-core.js`

## [2026-08-20] — v5 Path Lab

### Added
- **Path Lab** — second teaching lab for grid pathfinding (`pathfinding.html`)
- Six search algorithms: **BFS**, **DFS**, **Dijkstra**, **A\***, **Greedy Best-First**, **Bidirectional BFS**
- Maze generators: Recursive Backtracker, Prim, Recursive Division, Binary Tree, Scatter Walls
- Interactive grid: wall / weight / erase brushes, draggable start & end, diagonal movement
- Path Lab race mode, teaching mode, step mode, tournament (ranked by path cost, then nodes, then time)
- Algorithm profiles, learning cards, run history (`pathLabHistory`)
- Share URL for Path Lab (algorithm, maze, rows, cols, speed, diagonal)
- Node tests: `node --test tests/pathfinding.test.js`
- Lab switcher linking Sort Lab ↔ Path Lab on both pages

### Changed
- Product branding is now **Algo Lab** (Sort Lab + Path Lab)
- Page titles: “Algo Lab — Sorting Visualizer” / “Algo Lab — Pathfinding Visualizer”
- PWA name is “Algo Lab”; service worker cache bumped to `algo-lab-v5`
- Theme (`theme`) and sound (`sound`) stay shared across both labs
- README covers 10 sorting algorithms and the new pathfinding lab

## [2026-07-05] — v4 Feature Expansion

### Added
- **Counting Sort** and **Cocktail Shaker Sort** — 9th and 10th algorithms with counting-array panel and bidirectional sweep visualization
- **Access Heatmap** — per-index access frequency strip below each visualization pane
- **Algorithm Recommender** — analyzes dataset sortedness and unique-value count; suggests best-fit algorithm with reasoning
- **Quiz Mode** — hides algorithm name during run; guess grid after completion; score persisted in `localStorage`
- **Presentation Mode** — fullscreen overlay with large bars, metrics HUD, and synced heatmap (Esc to exit)
- **Share Run URL** — encodes algorithm, dataset, size, speed, and options in query string; restored on page load
- **Learning Cards** — flip card per algorithm with trivia and real-world use cases
- New legend swatch: **Bucket** (Counting Sort)

### Changed
- Algorithm count increased from 8 to 10
- Benchmark Tournament runs all 10 algorithms
- Run history records quiz-mode runs
- Profile panel blurs algorithm name when Quiz Mode is enabled

## [2026-07-05] — v3 Massive Improvements

### Added
- **Shell Sort** and **Radix Sort** — 7th and 8th algorithms with gap-pair and digit-pass visualizations
- **Teaching Mode** — toggle shows narrated step explanations in a live panel ("Now comparing indices 3 and 7…")
- **Custom Array Input** — textarea accepts comma-separated values or JSON arrays with validation
- **Benchmark Tournament** — runs all 8 algorithms sequentially on identical data; ranked leaderboard with times/comparisons
- **Operations Chart** — canvas sparkline showing cumulative operations over time during a run
- **Comparison Matrix** — table comparing theoretical Big-O vs actual tournament performance
- **Service Worker** (`sw.js`) — caches static assets for offline use
- **Accessibility** — dedicated `aria-live` announcer for teaching narration and run status; teaching panel uses `aria-live="assertive"`
- New legend swatches: **Digit pass** (Radix) and **Gap pair** (Shell)

### Changed
- Algorithm count increased from 6 to 8
- Dataset selector includes **Custom Input** option
- Run history and CSV export include tournament results
- PWA now registers service worker on load

## [2026-07-05] — Major Upgrade

### Added
- **Six sorting algorithms**: Bubble, Selection, Insertion, Merge, Quick, and Heap Sort
- **Dataset generators**: Random, Sorted, Nearly Sorted, Reversed, Few Unique, Sawtooth
- **Live metrics**: Comparisons, swaps, writes, and elapsed milliseconds per pane
- **Playback controls**: Pause/resume, stop, and single-step (Next Step) mode
- **Algorithm Race mode**: Dual-pane side-by-side comparison on identical data
- **Algorithm profile panel**: Big-O best/avg/worst, stability, in-place, memory complexity
- **Run history panel**: Last 8 runs persisted in `localStorage`
- **Export CSV** and **Copy Summary** buttons for run data
- **Sound toggle**: Web Audio beeps on compare/swap/write (saved to `localStorage`)
- **Keyboard shortcuts**: Space (pause), R/G (generate), S (start)
- **Color legend** with pivot and write states for Quick Sort and Merge Sort
- **PWA manifest** (`manifest.json`) for installable web app support
- **Complete UI redesign**: Modern lab aesthetic with sidebar controls and responsive layout

### Changed
- Default theme is now dark mode
- Project branding updated to **Sort Lab**
- Architecture refactored into `SortRunner`, `Metrics`, and `SortLabApp` classes

### Previous (baseline)
- Three algorithms: Bubble, Selection, Quick Sort
- Basic controls, dark mode toggle, random array generator