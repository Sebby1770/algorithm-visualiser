# Algo Lab — Sorting & Pathfinding Visualizer

An interactive teaching lab built with pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step, no npm runtime dependencies.

Two labs share the same chrome, theme, and sound toggle:

- **Sort Lab** (`index.html`) — 10 sorting algorithms
- **Path Lab** (`pathfinding.html`) — 6 pathfinding algorithms + maze generators

![Algorithms](https://img.shields.io/badge/sort-10-blue) ![Pathfinding](https://img.shields.io/badge/path-6-indigo) ![PWA](https://img.shields.io/badge/PWA-offline-purple)

## Running

No build tools. Open the files in a modern browser, or serve locally (recommended for the service worker / PWA):

```bash
python3 -m http.server
# → http://localhost:8000          Sort Lab
# → http://localhost:8000/pathfinding.html   Path Lab
```

macOS: `open index.html` · Linux: `xdg-open index.html`

> **Note:** The service worker requires HTTP(S). Opening a file directly may not register it.

## Tests

Pathfinding algorithms and maze generators are covered by Node’s built-in test runner (no packages to install):

```bash
node --test tests/pathfinding.test.js
```

## Sort Lab

### Algorithms (10)

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

### Dataset generators

Random · Sorted · Nearly Sorted · Reversed · Few Unique · Sawtooth · Custom Input (comma-separated or JSON)

### Features

- Live comparisons, swaps, writes, and elapsed ms
- Pause / Resume, Stop, and Step Mode
- Algorithm Race (dual pane)
- Teaching Mode (narrated steps)
- Quiz Mode (guess the algorithm)
- Presentation Mode
- Access heatmap + operations sparkline
- Algorithm recommender
- Benchmark tournament (all 10) with comparison matrix
- Learning cards (trivia + use cases)
- Run history (last 8, `localStorage` key `sortLabHistory`)
- Share URL, CSV export, copy summary
- Keyboard: `Space` pause · `S` start · `G` generate · `R` reset · `Esc` exit present

## Path Lab

### Algorithms (6)

| Algorithm | Time | Weighted | Complete | Optimal | Heuristic |
|-----------|------|----------|----------|---------|-----------|
| BFS | O(V + E) | No | Yes | Unweighted shortest | None |
| DFS | O(V + E) | No | Yes | No | None |
| Dijkstra | O((V + E) log V) | Yes | Yes | Yes (non-negative) | None |
| A* | O((V + E) log V) | Yes | Yes | Yes (admissible h) | Manhattan / Euclidean if diagonal |
| Greedy Best-First | O((V + E) log V) | No | Yes | No | Manhattan / Euclidean if diagonal |
| Bidirectional BFS | O(V + E) | No | Yes | Unweighted shortest | None |

Path cost is the sum of cell weights along the path **excluding start, including end**. Empty cells weigh `1`; weight cells weigh `5`. BFS / DFS / bidirectional BFS treat every step as cost 1 when *searching*, but reported path cost still uses actual weights.

### Maze generators

| Generator | Notes |
|-----------|--------|
| Empty | Open grid, start left-center, end right-center |
| Recursive Backtracker | Perfect maze (DFS carve); start top-left, end bottom-right |
| Prim | Perfect-ish carve via random frontier |
| Recursive Division | Adds walls with one gap per divider |
| Binary Tree | South/east biased corridors |
| Scatter Walls | Random walls (start/end stay free) |

Carved mazes prefer even/even passage cells. Even dimensions get a short corridor so the bottom-right corner stays reachable. All maze helpers **return a new grid** and never mutate an input.

### Features

- Interactive grid: drag to paint **Wall / Weight / Erase**; drag **S** / **E** to move terminals
- Diagonal movement toggle (no corner-cutting through walls)
- Race mode + algorithm tournament (rank: path cost → nodes expanded → time)
- Teaching Mode, Step Mode, pause / resume / stop
- Algorithm profile + learning cards
- Run history (last 8, `localStorage` key `pathLabHistory`)
- Share URL encodes algorithm, maze, rows, cols, speed, diagonal
- Keyboard: `Space` pause · `S` start · `G` maze · `R` reset · `C` clear path · `Esc` stop · `1` wall · `2` weight · `3` erase

Glyphs (not color alone): **S** start, **E** end, **●** weight.

## Shared UI

- Lab switcher in the top bar: Sort Lab ↔ Path Lab
- Dark / light theme — `localStorage` key `theme` (shared)
- Sound beeps (Web Audio) — `localStorage` key `sound` (shared)
- PWA manifest + service worker (`algo-lab-v5`) for offline use
- `aria-live` status and teaching narration

## File structure

```
algorithm-visualiser/
├── index.html              # Sort Lab
├── pathfinding.html        # Path Lab
├── style.css               # Shared theme + path grid
├── script.js               # Sort Lab app
├── pathfinding.js          # Path Lab UI
├── pathfinding-core.js     # Search + mazes (browser + Node)
├── tests/pathfinding.test.js
├── sw.js                   # Service worker
├── manifest.json           # PWA manifest
├── CHANGELOG.md
├── LICENSE                 # MIT
└── README.md
```

`pathfinding-core.js` exports `PathCore` in the browser and `module.exports` in Node.

## License

MIT — do whatever you like.
