# Changelog

All notable changes to Algo Lab (Algorithm Visualizer).

## [2026-08-26] — v6.3 quiz honesty, live re-path, g/h/f

### Fixed
- **Quiz Mode** no longer leaks Big-O: the profile grid (Best/Avg/Worst/Stable) is not rendered, and learning cards are hidden while quiz is on

### Added
- **Live re-path** in Path Lab — after a completed search, painting walls/weights or dragging S/E instantly re-runs the last algorithm
- **g / h / f scores** on A*, Dijkstra, and Weighted A* (hover a cell; `title` shows one decimal)
- **Skip link** (“Skip to lab”) as the first body element on all three pages
- **Keyboard cheat sheet** — press `?` or `Shift+/`, or the top-bar `?` button (ignored while typing in inputs)

### Changed
- PWA cache bumped to `algo-lab-v6.3`

## [2026-08-26] — v6.2 teaching honesty & shareable maps

### Fixed
- **Merge sort teaching compare** uses auxiliary keys (`compareAux`) instead of live bars after writes, so narration matches the values actually being merged.

### Added
- **Identity / stability colors** in Sort Lab — optional hues from original indices so equal keys stay distinguishable (stable vs unstable sorts)
- **Bar value labels** when n ≤ 24
- **Shareable Path Lab maps** — `encodeMap` / `decodeMap` RLE in `pathfinding-core.js`; Share URL includes a `map` param
- **Keyboard maze editor** — focus the grid, arrows move a cursor, Space/Enter paint (or pick up S/E)
- **Reduced-motion** CSS and zero animation delay in Sort / Path labs when `prefers-reduced-motion: reduce`
- `:focus-visible` outlines and `.path-cell.is-cursor` styling

### Changed
- PWA cache bumped to `algo-lab-v6.2`

## [2026-08-26] — v6.1 teaching correctness

### Fixed
- **A* diagonal heuristic** is Chebyshev (`max(dr,dc)`), not Euclidean. Diagonal steps cost 1, so Euclidean overestimated and A* was not optimal. Profiles/README match.
- **Bubble and Cocktail** now stop on a clean pass, so the advertised O(n) best case is real.

## [2026-08-26] — v6 Search Lab

### Added
- **Search Lab** (`search.html`) — third teaching lab for array search
- Five search algorithms: **Linear**, **Binary**, **Jump**, **Interpolation**, **Exponential**
- `search-core.js` (`SearchCore`) — pure, non-mutating searches for browser + Node
- Search UI: value cells, probe / lo / hi / found / eliminated states, teaching mode, linear-vs-binary race
- Share URL (`?algo=&n=&target=`), run history (`searchLabHistory`)
- **Sort Lab:** Comb, Gnome, Odd-Even, and Pancake sorts (14 total)
- `sorting-core.js` (`SortCore`) — pure sorts used by silent tournaments and tests
- **Path Lab:** Weighted A* (heuristic weight 1.5) and IDA* (iterative deepening, 20k expansion cap)
- Kruskal maze generator (randomized union-find on even/even cells)
- Node tests: `tests/sorting.test.js`, `tests/search.test.js`, plus Path Lab coverage for the new searches and Kruskal
- GitHub Actions CI (`node --test tests/*.test.js` on Node 20) and GitHub Pages deploy

### Changed
- Lab switcher is Sort Lab · Path Lab · Search Lab on every page
- Sort tournament runs all 14 algorithms (uses `SortCore` when available)
- Path tournament runs all 8 algorithms
- PWA name/description updated; service worker cache bumped to `algo-lab-v6`
- README documents 14 sorts, 8 path algorithms, Search Lab, tests, and CI

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