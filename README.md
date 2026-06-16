# Sorting Algorithm Visualizer

An interactive, animated sorting algorithm visualizer built with pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step.

## Features

- **Six algorithms**: Bubble, Selection, Insertion, Quick, Merge, and Heap Sort
- **Multiple dataset shapes**: random, sorted, nearly sorted, reversed, few unique, and sawtooth
- **Live animation** of comparisons, swaps, writes, pivots, and final positions
- **Run metrics** for comparisons, swaps, writes, and elapsed time
- **Abortable runs** with pause/resume and a stop control for long animations
- **Algorithm profile panel** showing best, average, worst, memory, and stability traits
- **Run history** persisted to `localStorage` for comparing recent experiments
- **Export tools** for downloading run history as CSV or copying a lab summary
- **Adjustable speed** (1–100)
- **Adjustable array size** (10–140 bars)
- **Dark mode** with preference saved to `localStorage`
- **Responsive design** for desktop and mobile

## File Structure

```
sorting-visualizer/
├── index.html    # Page structure and controls
├── style.css     # Theming, layout, bar states
├── script.js     # Algorithms and animation logic
└── README.md     # This file
```

## Running

No build tools or dependencies. Just open `index.html` in any modern browser:

```bash
# macOS
open index.html

# Linux
xdg-open index.html

# Or serve locally
python3 -m http.server
```

## Native App

There is also a SwiftUI version in `iOS/` with two schemes:

- `AlgorithmVisualizer` — iOS app target
- `AlgorithmVisualizerMac` — Mac app target using the same SwiftUI source

Open `iOS/AlgorithmVisualizer.xcodeproj` in Xcode, or regenerate it from `iOS/project.yml` with XcodeGen:

```bash
cd iOS
xcodegen generate
```

The native version includes a bundled header image, Bubble, Selection, and Quick Sort with animated bars, array size and speed controls, and comparison/swap counters.

## How It Works

Each sorting algorithm is written as an `async` function. Between comparisons and writes, the code `await`s a token-aware `sleep()` helper whose delay is inversely tied to the speed slider. CSS classes (`compare`, `pivot`, `swap`, `sorted`) are toggled on bar elements to drive the color changes, and bar heights update directly from the underlying array.

Completed runs are stored in `localStorage` under `sorting-lab-history-v1`, capped to the eight most recent entries.

### Color Legend

| Color  | Meaning           |
|--------|-------------------|
| Indigo | Unsorted element  |
| Amber  | Currently comparing |
| Red    | Pivot element     |
| Cyan   | Moving/writing    |
| Green  | In final position |

## Algorithms

- **Bubble Sort** — O(n²). Repeatedly swaps adjacent out-of-order pairs.
- **Selection Sort** — O(n²). Finds the minimum in the unsorted region and moves it to the front.
- **Insertion Sort** — O(n²). Builds a sorted prefix and performs well on nearly sorted data.
- **Quick Sort** — O(n log n) average. Recursive divide-and-conquer using the Lomuto partition scheme.
- **Merge Sort** — O(n log n). Splits the array and merges ordered runs with linear auxiliary memory.
- **Heap Sort** — O(n log n). Builds a max heap and drains it into the final sorted suffix.

## Controls

| Control       | Purpose                                 |
|---------------|-----------------------------------------|
| Algorithm     | Pick which sort to run                  |
| Dataset       | Pick the generated input pattern        |
| Array Size    | Number of bars (10–140)                 |
| Speed         | Animation speed (1 = slow, 100 = fast)  |
| Generate      | Create a new dataset with the current pattern |
| Start         | Run the selected algorithm              |
| Pause         | Pause or resume the active run          |
| Reset / Stop  | Generate fresh data or stop an active run |
| Dark / Light  | Toggle dark mode                        |
| Copy Summary  | Copy the selected algorithm and latest run summary |
| Export CSV    | Download saved run history              |
| Clear         | Clear saved run history                 |

## License

MIT — do whatever you like.
