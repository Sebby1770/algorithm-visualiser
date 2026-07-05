# Changelog

All notable changes to Sort Lab (Algorithm Visualizer).

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