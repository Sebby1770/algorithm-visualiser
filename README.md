# Algo Lab — Sorting, Pathfinding & Search Visualizer

**Live lab:** [https://sebby1770.github.io/algorithm-visualiser/](https://sebby1770.github.io/algorithm-visualiser/)

An interactive teaching lab built with pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step, no npm runtime dependencies.

Three labs share the same chrome, theme, and sound toggle:

- **Sort Lab** (`index.html`) — 14 sorting algorithms
- **Path Lab** (`pathfinding.html`) — 8 pathfinding algorithms + maze generators
- **Search Lab** (`search.html`) — 5 searching algorithms

![Sort](https://img.shields.io/badge/sort-14-blue) ![Pathfinding](https://img.shields.io/badge/path-8-indigo) ![Search](https://img.shields.io/badge/search-5-teal) ![PWA](https://img.shields.io/badge/PWA-offline-purple)

## Running

No build tools. Open the files in a modern browser, or serve locally (recommended for the service worker / PWA):

```bash
python3 -m http.server
# → http://localhost:8000                 Sort Lab
# → http://localhost:8000/pathfinding.html   Path Lab
# → http://localhost:8000/search.html        Search Lab
```

macOS: `open index.html` · Linux: `xdg-open index.html`

> **Note:** The service worker requires HTTP(S). Opening a file directly may not register it.

## Tests

Sorting, pathfinding, and search cores are covered by Node’s built-in test runner (no packages to install):

```bash
node --test tests/pathfinding.test.js tests/sorting.test.js tests/search.test.js
```

CI runs the same command on Node 20 via GitHub Actions (`.github/workflows/ci.yml`). Static files deploy to GitHub Pages (`.github/workflows/pages.yml`).

## Sort Lab

### Algorithms (14)

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

Radix is LSD base 10 (non-negative integers). Comb uses a 1.3 shrink factor. Pancake sorts by prefix reversals.

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
- Benchmark tournament (all 14) with comparison matrix
- Learning cards (trivia + use cases)
- Run history (last 8, `localStorage` key `sortLabHistory`)
- Share URL, CSV export, copy summary
- Keyboard: `Space` pause · `S` start · `G` generate · `R` reset · `Esc` exit present · `?` cheat sheet

## Path Lab

### Algorithms (8)

| Algorithm | Time | Weighted | Complete | Optimal | Heuristic |
|-----------|------|----------|----------|---------|-----------|
| BFS | O(V + E) | No | Yes | Unweighted shortest | None |
| DFS | O(V + E) | No | Yes | No | None |
| Dijkstra | O((V + E) log V) | Yes | Yes | Yes (non-negative) | None |
| A* | O((V + E) log V) | Yes | Yes | Yes (admissible h) | Manhattan / Chebyshev if diagonal |
| Greedy Best-First | O((V + E) log V) | No | Yes | No | Manhattan / Chebyshev if diagonal |
| Bidirectional BFS | O(V + E) | No | Yes | Unweighted shortest | None |
| Weighted A* | O((V + E) log V) | Yes | Yes | No (w=1.5) | Manhattan / Chebyshev × 1.5 |
| IDA* | O(b^d) | Yes | Yes | Yes (admissible h) | Manhattan / Chebyshev |

Path cost is the sum of cell weights along the path **excluding start, including end**. Empty cells weigh `1`; weight cells weigh `5`. BFS / DFS / bidirectional BFS treat every step as cost 1 when *searching*, but reported path cost still uses actual weights.

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

Carved mazes prefer even/even passage cells. Even dimensions get a short corridor so the bottom-right corner stays reachable. All maze helpers **return a new grid** and never mutate an input.

### Features

- Interactive grid: drag to paint **Wall / Weight / Erase**; drag **S** / **E** to move terminals
- **Live re-path**: after a completed search, painting or moving S/E re-runs the last algorithm instantly
- Hover **g / h / f** on A*, Dijkstra, and Weighted A* cells after a search
- Keyboard editor: focus the grid — **Arrows move · Space paint** (Space/Enter on S/E picks up the terminal)
- Diagonal movement toggle (no corner-cutting through walls)
- Race mode + algorithm tournament (rank: path cost → nodes expanded → time)
- Teaching Mode, Step Mode, pause / resume / stop
- Algorithm profile + learning cards
- Run history (last 8, `localStorage` key `pathLabHistory`)
- Share URL encodes algorithm, maze, rows, cols, speed, diagonal, and the painted **map** (`rowsxcols;sr,sc;er,ec;rle`)
- Keyboard: `Arrows` cursor · `Space` paint (grid) / pause · `S` start · `G` maze · `R` reset · `C` clear path · `Esc` stop · `1` wall · `2` weight · `3` erase · `?` cheat sheet

Glyphs (not color alone): **S** start, **E** end, **●** weight.

## Search Lab

### Algorithms (5)

| Algorithm | Average | Worst | Needs sorted |
|-----------|---------|-------|--------------|
| Linear | O(n) | O(n) | No |
| Binary | O(log n) | O(log n) | Yes |
| Jump | O(√n) | O(√n) | Yes |
| Interpolation | O(log log n) | O(n) | Yes |
| Exponential | O(log n) | O(log n) | Yes |

Each core routine returns `{ found, index, probes, probeOrder }` and **never mutates** the input. Binary / jump / interpolation / exponential auto-sort the displayed array and show a note.

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

## Shared UI

- Lab switcher in the top bar: Sort Lab · Path Lab · Search Lab
- Dark / light theme — `localStorage` key `theme` (shared)
- Sound beeps (Web Audio) — `localStorage` key `sound` (shared)
- PWA manifest + service worker (`algo-lab-v6.3`) for offline use
- Skip link to the lab workspace
- Keyboard cheat sheet (`?` or the top-bar `?` button)
- `aria-live` status and teaching narration
- `:focus-visible` outlines; `prefers-reduced-motion` skips animation delay

## File structure

```
algorithm-visualiser/
├── index.html                 # Sort Lab
├── pathfinding.html           # Path Lab
├── search.html                # Search Lab
├── style.css                  # Shared theme + path grid + search cells
├── script.js                  # Sort Lab app (visual SortRunner)
├── sorting-core.js            # Pure sorts (browser + Node)
├── pathfinding.js             # Path Lab UI
├── pathfinding-core.js        # Search + mazes (browser + Node)
├── search.js                  # Search Lab UI
├── search-core.js             # Pure searches (browser + Node)
├── tests/pathfinding.test.js
├── tests/sorting.test.js
├── tests/search.test.js
├── .github/workflows/ci.yml
├── .github/workflows/pages.yml
├── sw.js                      # Service worker
├── manifest.json              # PWA manifest
├── CHANGELOG.md
├── LICENSE                    # MIT
└── README.md
```

`sorting-core.js` exports `SortCore`, `pathfinding-core.js` exports `PathCore`, and `search-core.js` exports `SearchCore` in the browser (`module.exports` in Node).

## License

MIT — do whatever you like.
