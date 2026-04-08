# Sorting Algorithm Visualizer

An interactive, animated sorting algorithm visualizer built with pure HTML, CSS, and vanilla JavaScript — no frameworks, no build step.

## Features

- **Three algorithms**: Bubble Sort, Selection Sort, Quick Sort
- **Live animation** of comparisons and swaps
- **Color-coded states**: unsorted, comparing, swapping, sorted
- **Adjustable speed** (1–100)
- **Adjustable array size** (10–120 bars)
- **Random array generator**
- **Dark mode** with preference saved to `localStorage`
- **Responsive design** — works on desktop and mobile
- **Clean, commented code**

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

## How It Works

Each sorting algorithm is written as an `async` function. Between every comparison and swap, the code `await`s a `sleep()` helper whose delay is inversely tied to the speed slider. CSS classes (`compare`, `swap`, `sorted`) are toggled on bar elements to drive the color changes, and bar heights update directly from the underlying array.

### Color Legend

| Color  | Meaning           |
|--------|-------------------|
| Indigo | Unsorted element  |
| Amber  | Currently comparing |
| Red    | Being swapped     |
| Green  | In final position |

## Algorithms

- **Bubble Sort** — O(n²). Repeatedly swaps adjacent out-of-order pairs.
- **Selection Sort** — O(n²). Finds the minimum in the unsorted region and moves it to the front.
- **Quick Sort** — O(n log n) average. Recursive divide-and-conquer using the Lomuto partition scheme.

## Controls

| Control       | Purpose                                 |
|---------------|-----------------------------------------|
| Algorithm     | Pick which sort to run                  |
| Array Size    | Number of bars (10–120)                 |
| Speed         | Animation speed (1 = slow, 100 = fast)  |
| Generate      | Create a new random array               |
| Start         | Run the selected algorithm              |
| Reset         | Generate a fresh random array           |
| 🌙 / ☀️       | Toggle dark mode                        |

## License

MIT — do whatever you like.
