# Algorithm Lab — Sorting & Pathfinding Visualizer

An interactive, animated algorithm visualizer built with pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step. Two labs in one app: **Sorting** and **Pathfinding**, switchable from the topbar.

![Algorithms](https://img.shields.io/badge/sorting_algorithms-10-blue) ![Pathfinding](https://img.shields.io/badge/pathfinding_algorithms-6-teal) ![PWA](https://img.shields.io/badge/PWA-offline-purple)

## Pathfinding Lab

- **Six algorithms** — BFS, DFS, Dijkstra, A*, Greedy Best-First, Bidirectional BFS
- **Interactive grid** — drag to draw walls or weighted terrain (cost ×5), drag the start/goal markers, and watch the path re-solve live after a run
- **Mazes & terrain** — recursive-division maze (always solvable), random scatter, scattered weights
- **Diagonal movement** option (octile heuristic, no corner-cutting)
- **Per-algorithm profile** — shortest-path guarantee, complexity, weight-awareness
- **Live metrics** — visited cells, path steps, path cost, compute time
- Shortcuts: `V` visualize · `C` clear path · `B` clear board · `M` maze

| Algorithm | Weighted | Shortest path | Complexity |
|-----------|----------|---------------|------------|
| BFS | No | ✅ (unweighted) | O(V + E) |
| DFS | No | ❌ | O(V + E) |
| Dijkstra | Yes | ✅ | O((V + E) log V) |
| A* | Yes | ✅ | O((V + E) log V) |
| Greedy Best-First | Yes | ❌ | O((V + E) log V) |
| Bidirectional BFS | No | ✅ (unweighted) | O(V + E) |

## Sorting Lab

### Algorithms (10)
- Bubble Sort
- Selection Sort
- Insertion Sort
- Merge Sort
- Quick Sort
- Heap Sort
- **Shell Sort** — gap-based insertion with diminishing gaps
- **Radix Sort** — LSD digit passes with bucket visualization
- **Counting Sort** — counting-array panel visualization
- **Cocktail Shaker Sort** — bidirectional bubble sweep

### Dataset Generators
| Type | Description |
|------|-------------|
| Random | Uniform random values |
| Sorted | Already ascending |
| Nearly Sorted | Sorted with ~5% random swaps |
| Reversed | Descending order |
| Few Unique | Limited distinct values |
| Sawtooth | Repeating triangular pattern |
| **Custom Input** | Paste comma-separated values or a JSON array |

### Metrics & Controls
- Live **comparisons**, **swaps**, **writes**, and **elapsed ms**
- **Pause / Resume** and **Stop** during a run
- **Step Mode** — advance one operation at a time with **Next Step**
- **Algorithm Race** — run two algorithms side-by-side on identical data
- **Teaching Mode** — narrated step explanations in a live panel
- **Operations Chart** — sparkline of cumulative operations during a run
- **Benchmark Tournament** — run all 8 algorithms; ranked leaderboard + comparison matrix

### UI & UX
- Modern **lab aesthetic** with sidebar controls and main visualization stage
- **Algorithm profile panel** — Big-O best/avg/worst, stable?, in-place?, memory
- **Run history** — last 8 runs saved to `localStorage`
- **Export CSV** and **Copy Summary** for run data
- **Dark mode** toggle (preference saved)
- **Sound toggle** — Web Audio beeps on compare/swap/write
- **Keyboard shortcuts**: `Space` pause · `S` start · `G` generate · `R` reset
- **Responsive** layout for mobile and desktop
- **Color legend** including pivot, write, digit-pass, and gap-pair states
- **PWA manifest** + **service worker** for installable, offline-capable app
- **Accessibility** — `aria-live` regions for status and teaching narration

## File Structure

```
algorithm-visualiser/
├── index.html      # Lab UI layout (sorting + pathfinding views)
├── style.css       # Theming, sidebar, race mode, pathfinding grid, responsive
├── script.js       # Sorting: algorithms, metrics, race mode, tournament, teaching
├── pathfinding.js  # Pathfinding: grid editor, 6 algorithms, mazes, live re-path
├── sw.js           # Service worker for offline caching
├── manifest.json   # PWA manifest
├── CHANGELOG.md    # Version history
└── README.md       # This file
```

## Running

No build tools or dependencies. Open `index.html` in any modern browser:

```bash
# macOS
open index.html

# Linux
xdg-open index.html

# Or serve locally (recommended for PWA + service worker)
python3 -m http.server
# → http://localhost:8000
```

> **Note:** The service worker requires serving over HTTP(S). Opening `index.html` directly may not register the worker.

## How It Works

Each sorting algorithm runs inside a `SortRunner` class. Between every comparison, swap, or write, the runner `await`s a delay tied to the speed slider (or waits for **Next Step** in step mode). CSS classes drive bar colors; metrics update in real time.

**Teaching Mode** hooks into each operation and narrates what's happening. **Benchmark Tournament** runs algorithms in silent mode (no animation) for fast head-to-head timing.

### Color Legend

| Color | Meaning |
|-------|---------|
| Blue | Unsorted element |
| Amber | Currently comparing |
| Red | Being swapped |
| Purple | Value written (Merge Sort) |
| Pink | Pivot element (Quick Sort) |
| Cyan | Digit pass (Radix Sort) |
| Orange | Gap pair (Shell Sort) |
| Green | In final sorted position |

## Algorithm Complexity

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

## Controls

| Control | Purpose |
|---------|---------|
| Algorithm | Primary sort to run |
| Algorithm Race | Enable dual-pane race mode |
| Race Algorithm | Second algorithm for race mode |
| Dataset | Input data pattern (or Custom Input) |
| Custom Array | Paste values when Custom Input selected |
| Array Size | Number of bars (10–120) |
| Speed | Animation speed (1 = slow, 100 = fast) |
| Step Mode | Manual single-step advance |
| Teaching Mode | Narrated step explanations |
| Generate / Reset | Create new dataset |
| Start | Begin sorting |
| Pause / Resume | Halt or continue animation |
| Stop | Abort current run |
| Next Step | Advance one step (step mode only) |
| 🏆 Benchmark Tournament | Run all 8 algorithms; show leaderboard |
| Export CSV | Download run history as CSV |
| Copy Summary | Copy last run summary to clipboard |
| 🔊 Sound | Toggle audio feedback |
| 🌙 / ☀️ | Toggle dark/light theme |

## License

MIT — do whatever you like.