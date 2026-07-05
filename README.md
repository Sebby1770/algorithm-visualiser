# Sort Lab — Sorting Algorithm Visualizer

An interactive, animated sorting algorithm visualizer built with pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step.

![Sort Lab](https://img.shields.io/badge/algorithms-6-blue) ![PWA](https://img.shields.io/badge/PWA-ready-purple)

## Features

### Algorithms (6)
- Bubble Sort
- Selection Sort
- **Insertion Sort**
- **Merge Sort**
- Quick Sort
- **Heap Sort**

### Dataset Generators
| Type | Description |
|------|-------------|
| Random | Uniform random values |
| Sorted | Already ascending |
| Nearly Sorted | Sorted with ~5% random swaps |
| Reversed | Descending order |
| Few Unique | Limited distinct values |
| Sawtooth | Repeating triangular pattern |

### Metrics & Controls
- Live **comparisons**, **swaps**, **writes**, and **elapsed ms**
- **Pause / Resume** and **Stop** during a run
- **Step Mode** — advance one operation at a time with **Next Step**
- **Algorithm Race** — run two algorithms side-by-side on identical data

### UI & UX
- Modern **lab aesthetic** with sidebar controls and main visualization stage
- **Algorithm profile panel** — Big-O best/avg/worst, stable?, in-place?, memory
- **Run history** — last 8 runs saved to `localStorage`
- **Export CSV** and **Copy Summary** for run data
- **Dark mode** toggle (preference saved)
- **Sound toggle** — Web Audio beeps on compare/swap/write
- **Keyboard shortcuts**: `Space` pause · `S` start · `G` generate · `R` reset
- **Responsive** layout for mobile and desktop
- **Color legend** including pivot (Quick Sort) and write (Merge Sort) states
- **PWA manifest** for installable web app support

## File Structure

```
algorithm-visualiser/
├── index.html      # Lab UI layout
├── style.css       # Theming, sidebar, race mode, responsive
├── script.js       # Algorithms, metrics, race mode, history
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

# Or serve locally (recommended for PWA)
python3 -m http.server
# → http://localhost:8000
```

## How It Works

Each sorting algorithm runs inside a `SortRunner` class. Between every comparison, swap, or write, the runner `await`s a delay tied to the speed slider (or waits for **Next Step** in step mode). CSS classes drive bar colors; metrics update in real time.

### Color Legend

| Color | Meaning |
|-------|---------|
| Blue | Unsorted element |
| Amber | Currently comparing |
| Red | Being swapped |
| Purple | Value written (Merge Sort) |
| Pink | Pivot element (Quick Sort) |
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

## Controls

| Control | Purpose |
|---------|---------|
| Algorithm | Primary sort to run |
| Algorithm Race | Enable dual-pane race mode |
| Race Algorithm | Second algorithm for race mode |
| Dataset | Input data pattern |
| Array Size | Number of bars (10–120) |
| Speed | Animation speed (1 = slow, 100 = fast) |
| Step Mode | Manual single-step advance |
| Generate / Reset | Create new dataset |
| Start | Begin sorting |
| Pause / Resume | Halt or continue animation |
| Stop | Abort current run |
| Next Step | Advance one step (step mode only) |
| Export CSV | Download run history as CSV |
| Copy Summary | Copy last run summary to clipboard |
| 🔊 Sound | Toggle audio feedback |
| 🌙 / ☀️ | Toggle dark/light theme |

## License

MIT — do whatever you like.