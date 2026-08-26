/* ============================================================
   Path Lab — UI
   Vanilla JS. Algorithms live in pathfinding-core.js (PathCore).

   localStorage keys:
     theme          — shared with Sort Lab ("dark" | "light")
     sound          — shared with Sort Lab ("true" | "false")
     pathLabHistory — last 8 Path Lab runs
   ============================================================ */

const ALGORITHM_IDS = ["bfs", "dfs", "dijkstra", "astar", "greedy", "bidirectionalBfs", "weightedAstar", "idaStar"];

const ALGORITHM_PROFILES = {
  bfs: {
    name: "Breadth-First Search",
    time: "O(V + E)",
    space: "O(V)",
    weighted: false,
    complete: true,
    optimal: "Unweighted",
    heuristic: "None",
    description: "Expands the frontier layer by layer. Guarantees a shortest path when every step costs the same.",
  },
  dfs: {
    name: "Depth-First Search",
    time: "O(V + E)",
    space: "O(V)",
    weighted: false,
    complete: true,
    optimal: "No",
    heuristic: "None",
    description: "Dives down one corridor until it must backtrack. Finds a path, not necessarily a short one.",
  },
  dijkstra: {
    name: "Dijkstra",
    time: "O((V + E) log V)",
    space: "O(V)",
    weighted: true,
    complete: true,
    optimal: "Yes (non-negative)",
    heuristic: "None",
    description: "Always expands the cheapest path so far. Optimal on weighted grids with non-negative costs.",
  },
  astar: {
    name: "A*",
    time: "O((V + E) log V)",
    space: "O(V)",
    weighted: true,
    complete: true,
    optimal: "Yes (admissible h)",
    heuristic: "Manhattan / Chebyshev if diagonal",
    description: "Dijkstra plus a heuristic that estimates remaining cost. Usually expands fewer nodes than Dijkstra.",
  },
  greedy: {
    name: "Greedy Best-First",
    time: "O((V + E) log V)",
    space: "O(V)",
    weighted: false,
    complete: true,
    optimal: "No",
    heuristic: "Manhattan / Chebyshev if diagonal",
    description: "Always expands the cell that looks closest to the goal. Fast, but walls can send it the long way.",
  },
  bidirectionalBfs: {
    name: "Bidirectional BFS",
    time: "O(V + E)",
    space: "O(V)",
    weighted: false,
    complete: true,
    optimal: "Unweighted",
    heuristic: "None",
    description: "Runs BFS from both start and end until the frontiers meet. Often much faster on open maps.",
  },
  weightedAstar: {
    name: "Weighted A*",
    time: "O((V + E) log V)",
    space: "O(V)",
    weighted: true,
    complete: true,
    optimal: "No (w=1.5)",
    heuristic: "Manhattan / Chebyshev × 1.5",
    description: "A* with a scaled heuristic (weight 1.5). Faster and greedier; paths may be slightly longer.",
  },
  idaStar: {
    name: "IDA*",
    time: "O(b^d)",
    space: "O(d)",
    weighted: true,
    complete: true,
    optimal: "Yes (admissible h)",
    heuristic: "Manhattan / Chebyshev if diagonal",
    description: "Iterative deepening A*: DFS with a rising f-cost bound. Tiny memory, more re-expansions.",
  },
};

const LEARNING_CARDS = {
  bfs: {
    trivia: "BFS is the graph version of throwing a pebble in a pond — the ripple reaches the goal along a shortest unweighted path.",
    useCase: "Social-network “degrees of separation”, unweighted maze solving, and broadcasting on networks.",
  },
  dfs: {
    trivia: "The maze-generation recursive backtracker in this lab is DFS in disguise — it carves by walking until it must backtrack.",
    useCase: "Cycle detection, topological sort, and exhaustive search in puzzle solvers.",
  },
  dijkstra: {
    trivia: "Edsger Dijkstra invented the algorithm in 1956 and published it in 1959 — originally for finding the shortest walk between two cities.",
    useCase: "Road maps, routing protocols, and any weighted graph with non-negative edge costs.",
  },
  astar: {
    trivia: "A* was created in 1968 for Shakey the robot. With a good heuristic it expands far fewer nodes than Dijkstra.",
    useCase: "Game AI pathfinding, robotics, and GPS routing when you can estimate remaining distance.",
  },
  greedy: {
    trivia: "Greedy best-first is A* with g=0 — it only cares how close a cell looks, never how expensive the trip was.",
    useCase: "Quick “good enough” paths in games when optimality matters less than speed.",
  },
  bidirectionalBfs: {
    trivia: "Two searches meeting in the middle can turn an O(b^d) frontier into roughly O(b^{d/2}) — a huge win on open maps.",
    useCase: "Meeting-in-the-middle queries: word ladders, unweighted maps, and some bidirectional Dijkstra variants.",
  },
  weightedAstar: {
    trivia: "Weighted A* (WA*) inflates h by w>1. With w=1.5 you often expand far fewer nodes than A* while staying near-optimal.",
    useCase: "Anytime planning in robotics and games when a good path now beats a perfect path later.",
  },
  idaStar: {
    trivia: "IDA* was introduced by Korf in 1985. It solves 15-puzzles with A*’s optimality and DFS’s memory.",
    useCase: "Large state spaces (puzzles, combinational search) where storing an Open set would blow RAM.",
  },
};

const MAZE_LABELS = {
  empty: "Empty",
  backtracker: "Recursive Backtracker",
  prim: "Prim",
  division: "Recursive Division",
  binary: "Binary Tree",
  scatter: "Scatter Walls",
  kruskal: "Kruskal",
};

const HISTORY_KEY = "pathLabHistory";
const MAX_HISTORY = 8;

const $ = (id) => document.getElementById(id);

const dom = {
  algorithm: $("algorithm"),
  algorithmRace: $("algorithmRace"),
  maze: $("maze"),
  rows: $("rows"),
  cols: $("cols"),
  rowsValue: $("rowsValue"),
  colsValue: $("colsValue"),
  speed: $("speed"),
  speedValue: $("speedValue"),
  raceMode: $("raceMode"),
  diagonal: $("diagonal"),
  stepMode: $("stepMode"),
  teachingMode: $("teachingMode"),
  soundToggle: $("soundToggle"),
  themeToggle: $("themeToggle"),
  generateBtn: $("generateBtn"),
  startBtn: $("startBtn"),
  pauseBtn: $("pauseBtn"),
  stopBtn: $("stopBtn"),
  nextStepBtn: $("nextStepBtn"),
  clearPathBtn: $("clearPathBtn"),
  resetBtn: $("resetBtn"),
  tournamentBtn: $("tournamentBtn"),
  pathGrid: $("pathGrid"),
  pathGridRace: $("pathGridRace"),
  panePrimary: $("panePrimary"),
  paneSecondary: $("paneSecondary"),
  panePrimaryLabel: $("panePrimaryLabel"),
  paneSecondaryLabel: $("paneSecondaryLabel"),
  metricsPrimary: $("metricsPrimary"),
  metricsSecondary: $("metricsSecondary"),
  profilePanel: $("profilePanel"),
  historyList: $("historyList"),
  statusText: $("statusText"),
  toast: $("toast"),
  teachingPanel: $("teachingPanel"),
  teachingText: $("teachingText"),
  tournamentPanel: $("tournamentPanel"),
  leaderboard: $("leaderboard"),
  a11yAnnouncer: $("a11yAnnouncer"),
  shareUrlBtn: $("shareUrlBtn"),
  learningCard: $("learningCard"),
  learningTrivia: $("learningTrivia"),
  learningUseCase: $("learningUseCase"),
};

function cellKey(r, c) {
  return r + "," + c;
}

function formatH(h) {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

class AudioManager {
  constructor() {
    this.enabled = localStorage.getItem("sound") === "true";
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  beep(frequency = 440, duration = 0.03, volume = 0.04) {
    if (!this.enabled) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  expand() {
    this.beep(520, 0.018, 0.03);
  }

  path() {
    this.beep(880, 0.04, 0.045);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem("sound", String(enabled));
  }
}

class GridView {
  constructor(container) {
    this.container = container;
    this.cells = [];
    this.rows = 0;
    this.cols = 0;
    this.overlay = this.emptyOverlay();
    this.frontierKey = null;
  }

  emptyOverlay() {
    return {
      visited: new Set(),
      path: new Set(),
      frontier: new Set(),
    };
  }

  rebuild(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.overlay = this.emptyOverlay();
    this.frontierKey = null;
    this.container.style.setProperty("--path-cols", String(cols));
    this.container.setAttribute("aria-rowcount", String(rows));
    this.container.setAttribute("aria-colcount", String(cols));
    const frag = document.createDocumentFragment();
    this.cells = new Array(rows);
    for (let r = 0; r < rows; r++) {
      const row = new Array(cols);
      for (let c = 0; c < cols; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "path-cell";
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("aria-rowindex", String(r + 1));
        btn.setAttribute("aria-colindex", String(c + 1));
        btn.tabIndex = -1;
        row[c] = btn;
        frag.appendChild(btn);
      }
      this.cells[r] = row;
    }
    this.container.innerHTML = "";
    this.container.appendChild(frag);
  }

  clearOverlay() {
    this.overlay = this.emptyOverlay();
    this.frontierKey = null;
  }

  paintCell(grid, r, c) {
    const btn = this.cells[r] && this.cells[r][c];
    const cell = grid[r] && grid[r][c];
    if (!btn || !cell) return;
    const id = cellKey(r, c);
    btn.className = "path-cell";
    if (cell.type === "wall") btn.classList.add("is-wall");
    if (cell.type === "weight") btn.classList.add("is-weight");
    if (cell.type === "start") btn.classList.add("is-start");
    if (cell.type === "end") btn.classList.add("is-end");
    if (this.overlay.visited.has(id)) btn.classList.add("is-visited");
    if (this.overlay.frontier.has(id)) btn.classList.add("is-frontier");
    if (this.overlay.path.has(id)) btn.classList.add("is-path");

    let glyph = "";
    if (cell.type === "start") glyph = "S";
    else if (cell.type === "end") glyph = "E";
    else if (cell.type === "weight") glyph = "●";
    btn.textContent = glyph;

    let state = cell.type;
    if (this.overlay.path.has(id)) state = "path";
    else if (this.overlay.frontier.has(id)) state = "frontier";
    else if (this.overlay.visited.has(id)) state = "visited";
    btn.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}, ${state}`);
  }

  paintAll(grid) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) this.paintCell(grid, r, c);
    }
  }

  markExpand(grid, r, c) {
    if (this.frontierKey) {
      this.overlay.frontier.delete(this.frontierKey);
      const parts = this.frontierKey.split(",");
      this.paintCell(grid, Number(parts[0]), Number(parts[1]));
    }
    const id = cellKey(r, c);
    this.overlay.visited.add(id);
    this.overlay.frontier.add(id);
    this.frontierKey = id;
    this.paintCell(grid, r, c);
  }

  markPath(grid, r, c) {
    const id = cellKey(r, c);
    this.overlay.frontier.delete(id);
    this.overlay.path.add(id);
    this.paintCell(grid, r, c);
  }

  paintResult(grid, result) {
    this.clearOverlay();
    if (result && result.visitedOrder) {
      result.visitedOrder.forEach((p) => this.overlay.visited.add(cellKey(p.r, p.c)));
    }
    if (result && result.path) {
      result.path.forEach((p) => this.overlay.path.add(cellKey(p.r, p.c)));
    }
    this.paintAll(grid);
  }
}

class PathLabApp {
  constructor() {
    this.audio = new AudioManager();
    this.viewA = new GridView(dom.pathGrid);
    this.viewB = new GridView(dom.pathGridRace);
    this.grid = [];
    this.start = { r: 0, c: 0 };
    this.end = { r: 0, c: 1 };
    this.isRunning = false;
    this.paused = false;
    this.stopped = false;
    this.stepResolver = null;
    this.history = this.loadHistory();
    this.toastTimer = null;
    this.pointer = { painting: false, brush: null, terminal: null };
    this.animStartedAt = 0;
  }

  init() {
    this.initTheme();
    this.initSoundToggle();
    this.loadFromUrl();
    this.bindEvents();
    this.updateProfile();
    this.updateLearningCard();
    this.updateTeachingPanel();
    this.updateRaceVisibility();
    this.renderHistory();
    this.generateBoard();
    this.registerServiceWorker();
    this.setStatus("Ready — press S to search or G to generate a maze");
  }

  initTheme() {
    const saved = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    dom.themeToggle.textContent = saved === "dark" ? "☀️" : "🌙";
    dom.themeToggle.setAttribute("aria-pressed", saved === "dark");
  }

  initSoundToggle() {
    dom.soundToggle.checked = this.audio.enabled;
    dom.soundToggle.setAttribute("aria-pressed", String(this.audio.enabled));
  }

  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  bindEvents() {
    dom.rows.addEventListener("input", () => {
      dom.rowsValue.textContent = dom.rows.value;
    });
    dom.cols.addEventListener("input", () => {
      dom.colsValue.textContent = dom.cols.value;
    });
    dom.rows.addEventListener("change", () => {
      if (!this.isRunning) this.generateBoard();
    });
    dom.cols.addEventListener("change", () => {
      if (!this.isRunning) this.generateBoard();
    });
    dom.speed.addEventListener("input", () => {
      dom.speedValue.textContent = dom.speed.value;
    });

    dom.algorithm.addEventListener("change", () => {
      this.updateProfile();
      this.updateLearningCard();
    });
    dom.raceMode.addEventListener("change", () => {
      this.updateRaceVisibility();
      dom.algorithmRace.disabled = !dom.raceMode.checked || this.isRunning;
      this.syncViews();
    });

    dom.stepMode.addEventListener("change", () => {
      dom.nextStepBtn.disabled = !dom.stepMode.checked || !this.isRunning;
    });
    dom.teachingMode.addEventListener("change", () => this.updateTeachingPanel());

    dom.learningCard.addEventListener("click", () => this.flipLearningCard());
    dom.learningCard.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        this.flipLearningCard();
      }
    });

    dom.shareUrlBtn.addEventListener("click", () => this.copyShareUrl());
    dom.soundToggle.addEventListener("change", () => {
      this.audio.setEnabled(dom.soundToggle.checked);
      dom.soundToggle.setAttribute("aria-pressed", String(dom.soundToggle.checked));
      if (dom.soundToggle.checked) this.audio.beep(660, 0.05, 0.06);
    });

    dom.generateBtn.addEventListener("click", () => this.generateBoard());
    dom.resetBtn.addEventListener("click", () => this.resetBoard());
    dom.clearPathBtn.addEventListener("click", () => this.clearPath());
    dom.startBtn.addEventListener("click", () => this.startSearch());
    dom.pauseBtn.addEventListener("click", () => this.togglePause());
    dom.stopBtn.addEventListener("click", () => this.stopSearch());
    dom.nextStepBtn.addEventListener("click", () => this.nextStep());
    dom.tournamentBtn.addEventListener("click", () => this.runTournament());
    dom.themeToggle.addEventListener("click", () => this.toggleTheme());

    this.bindPointer(dom.pathGrid);
    this.bindPointer(dom.pathGridRace);

    window.addEventListener("pointerup", () => this.endPointer());
    window.addEventListener("pointercancel", () => this.endPointer());

    document.addEventListener("keydown", (e) => this.handleKeyboard(e));
  }

  bindPointer(gridEl) {
    gridEl.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    gridEl.addEventListener("pointermove", (e) => this.onPointerMove(e));
    gridEl.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".path-cell")) e.preventDefault();
    });
  }

  handleKeyboard(e) {
    if (e.target.closest(".learning-card")) return;
    if (e.target.matches("input, select, textarea")) return;

    switch (e.code) {
      case "Space":
        e.preventDefault();
        this.togglePause();
        break;
      case "KeyS":
        this.startSearch();
        break;
      case "KeyG":
        if (!this.isRunning) this.generateBoard();
        break;
      case "KeyR":
        if (!this.isRunning) this.resetBoard();
        break;
      case "KeyC":
        if (!this.isRunning) this.clearPath();
        break;
      case "Escape":
        this.stopSearch();
        break;
      case "Digit1":
      case "Numpad1":
        this.setBrush("wall");
        break;
      case "Digit2":
      case "Numpad2":
        this.setBrush("weight");
        break;
      case "Digit3":
      case "Numpad3":
        this.setBrush("erase");
        break;
      default:
        break;
    }
  }

  getRows() {
    return parseInt(dom.rows.value, 10);
  }

  getCols() {
    return parseInt(dom.cols.value, 10);
  }

  getBrush() {
    const el = document.querySelector('input[name="brush"]:checked');
    return el ? el.value : "wall";
  }

  setBrush(value) {
    const el = document.querySelector(`input[name="brush"][value="${value}"]`);
    if (el) el.checked = true;
  }

  getOpts() {
    return { diagonal: dom.diagonal.checked, start: this.start, end: this.end };
  }

  views() {
    return dom.raceMode.checked ? [this.viewA, this.viewB] : [this.viewA];
  }

  rebuildViews() {
    const rows = this.grid.length;
    const cols = this.grid[0].length;
    this.viewA.rebuild(rows, cols);
    this.viewB.rebuild(rows, cols);
    this.syncViews();
  }

  syncViews() {
    this.views().forEach((view) => view.paintAll(this.grid));
  }

  placeDefaultTerminals(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const start = { r: Math.floor(rows / 2), c: Math.max(0, Math.floor(cols * 0.15)) };
    let end = { r: Math.floor(rows / 2), c: Math.min(cols - 1, Math.floor(cols * 0.85)) };
    if (start.r === end.r && start.c === end.c) {
      end = { r: rows - 1, c: cols - 1 };
    }
    grid[start.r][start.c].type = "start";
    grid[start.r][start.c].weight = 1;
    grid[end.r][end.c].type = "end";
    grid[end.r][end.c].weight = 1;
    this.start = start;
    this.end = end;
  }

  syncTerminalsFromGrid() {
    const start = PathCore.findCell(this.grid, "start");
    const end = PathCore.findCell(this.grid, "end");
    if (start) this.start = start;
    if (end) this.end = end;
  }

  generateBoard() {
    if (this.isRunning) return;
    const rows = this.getRows();
    const cols = this.getCols();
    const maze = dom.maze.value;
    let grid;

    switch (maze) {
      case "backtracker":
        grid = PathCore.mazeRecursiveBacktracker(rows, cols);
        break;
      case "prim":
        grid = PathCore.mazePrim(rows, cols);
        break;
      case "division":
        grid = PathCore.mazeRecursiveDivision(rows, cols);
        break;
      case "binary":
        grid = PathCore.mazeBinaryTree(rows, cols);
        break;
      case "scatter":
        grid = PathCore.scatterWalls(rows, cols, 0.28);
        break;
      case "kruskal":
        grid = PathCore.mazeKruskal(rows, cols);
        break;
      default:
        grid = PathCore.makeGrid(rows, cols);
        this.placeDefaultTerminals(grid);
        this.grid = grid;
        this.rebuildViews();
        this.resetMetrics();
        this.setStatus(`Empty board ${rows}×${cols} — drag S/E, paint walls`);
        return;
    }

    this.grid = grid;
    this.syncTerminalsFromGrid();
    this.rebuildViews();
    this.resetMetrics();
    this.setStatus(`Generated ${MAZE_LABELS[maze] || maze} (${rows}×${cols})`);
  }

  resetBoard() {
    if (this.isRunning) return;
    dom.maze.value = "empty";
    this.grid = PathCore.makeGrid(this.getRows(), this.getCols());
    this.placeDefaultTerminals(this.grid);
    this.rebuildViews();
    this.resetMetrics();
    this.setStatus("Board reset");
    this.announce("Board reset.");
  }

  clearPath() {
    this.viewA.clearOverlay();
    this.viewB.clearOverlay();
    this.syncViews();
    this.setStatus("Path cleared");
  }

  isTerminal(r, c) {
    return (r === this.start.r && c === this.start.c) || (r === this.end.r && c === this.end.c);
  }

  onPointerDown(e) {
    if (this.isRunning) return;
    const cell = e.target.closest(".path-cell");
    if (!cell) return;
    e.preventDefault();
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
    if (r === this.start.r && c === this.start.c) {
      this.pointer.terminal = "start";
    } else if (r === this.end.r && c === this.end.c) {
      this.pointer.terminal = "end";
    } else {
      this.pointer.painting = true;
      this.pointer.brush = this.getBrush();
      this.paintAt(r, c, this.pointer.brush);
    }
  }

  onPointerMove(e) {
    if (this.isRunning) return;
    if (!this.pointer.painting && !this.pointer.terminal) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest ? el.closest(".path-cell") : null;
    if (!cell) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    if (this.pointer.terminal) this.moveTerminal(this.pointer.terminal, r, c);
    else this.paintAt(r, c, this.pointer.brush);
  }

  endPointer() {
    this.pointer.painting = false;
    this.pointer.brush = null;
    this.pointer.terminal = null;
  }

  paintAt(r, c, brush) {
    if (this.isTerminal(r, c)) return;
    if (!this.grid[r] || !this.grid[r][c]) return;
    if (brush === "wall") PathCore.setCell(this.grid, r, c, { type: "wall", weight: 1 });
    else if (brush === "weight") PathCore.setCell(this.grid, r, c, { type: "weight", weight: 5 });
    else PathCore.setCell(this.grid, r, c, { type: "empty", weight: 1 });
    this.views().forEach((view) => view.paintCell(this.grid, r, c));
  }

  moveTerminal(which, r, c) {
    const other = which === "start" ? this.end : this.start;
    if (r === other.r && c === other.c) return;
    if (!this.grid[r] || !this.grid[r][c]) return;
    const prev = this[which];
    if (prev.r === r && prev.c === c) return;
    this.grid[prev.r][prev.c].type = "empty";
    this.grid[prev.r][prev.c].weight = 1;
    this.grid[r][c].type = which;
    this.grid[r][c].weight = 1;
    this[which] = { r, c };
    this.views().forEach((view) => {
      view.paintCell(this.grid, prev.r, prev.c);
      view.paintCell(this.grid, r, c);
    });
  }

  updateRaceVisibility() {
    const racing = dom.raceMode.checked;
    dom.paneSecondary.classList.toggle("hidden", !racing);
    document.body.classList.toggle("race-active", racing);
  }

  updateTeachingPanel() {
    const enabled = dom.teachingMode.checked;
    dom.teachingPanel.classList.toggle("hidden", !enabled);
    if (!enabled) {
      dom.teachingText.textContent = "Enable Teaching Mode to see step-by-step explanations.";
    }
  }

  updateProfile() {
    const profile = ALGORITHM_PROFILES[dom.algorithm.value];
    dom.profilePanel.innerHTML = `
      <h3 class="profile-name">${profile.name}</h3>
      <p class="profile-desc">${profile.description}</p>
      <dl class="profile-grid">
        <div><dt>Time</dt><dd>${profile.time}</dd></div>
        <div><dt>Space</dt><dd>${profile.space}</dd></div>
        <div><dt>Weighted</dt><dd>${yesNo(profile.weighted)}</dd></div>
        <div><dt>Complete</dt><dd>${yesNo(profile.complete)}</dd></div>
        <div><dt>Optimal</dt><dd>${profile.optimal}</dd></div>
        <div><dt>Heuristic</dt><dd>${profile.heuristic}</dd></div>
      </dl>
    `;
    dom.panePrimaryLabel.textContent = profile.name;
  }

  updateLearningCard() {
    const card = LEARNING_CARDS[dom.algorithm.value];
    if (!card) return;
    dom.learningTrivia.textContent = card.trivia;
    dom.learningUseCase.textContent = card.useCase;
    dom.learningCard.classList.remove("flipped");
  }

  flipLearningCard() {
    dom.learningCard.classList.toggle("flipped");
  }

  metricsHtml({ nodesExpanded = 0, pathLength = 0, pathCost = 0, elapsedMs = 0 }) {
    return `
      <span class="metric"><strong>${nodesExpanded}</strong> expanded</span>
      <span class="metric"><strong>${pathLength}</strong> path</span>
      <span class="metric"><strong>${pathCost}</strong> cost</span>
      <span class="metric"><strong>${elapsedMs}</strong> ms</span>
    `;
  }

  resetMetrics() {
    const empty = this.metricsHtml({});
    dom.metricsPrimary.innerHTML = empty;
    dom.metricsSecondary.innerHTML = empty;
  }

  liveElapsed() {
    if (!this.animStartedAt) return 0;
    return Math.round(performance.now() - this.animStartedAt);
  }

  getDelay() {
    const s = Number(dom.speed.value);
    if (s >= 97) return 0;
    return Math.max(0, Math.round(((100 - s) * (100 - s)) / 180));
  }

  async waitStep() {
    if (this.stopped) throw new Error("STOPPED");
    if (dom.stepMode.checked) {
      await new Promise((resolve) => {
        this.stepResolver = resolve;
      });
      if (this.stopped) throw new Error("STOPPED");
      return;
    }
    while (this.paused) {
      await new Promise((r) => setTimeout(r, 50));
      if (this.stopped) throw new Error("STOPPED");
    }
    const delay = this.getDelay();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  nextStep() {
    if (this.stepResolver) {
      const resolve = this.stepResolver;
      this.stepResolver = null;
      resolve();
    }
  }

  setControlsDisabled(disabled) {
    const ids = [
      "algorithm",
      "algorithmRace",
      "maze",
      "rows",
      "cols",
      "speed",
      "raceMode",
      "diagonal",
      "stepMode",
      "teachingMode",
      "generateBtn",
      "startBtn",
      "resetBtn",
      "clearPathBtn",
      "tournamentBtn",
      "shareUrlBtn",
    ];
    ids.forEach((id) => {
      const el = dom[id];
      if (el) el.disabled = disabled;
    });
    document.querySelectorAll('input[name="brush"]').forEach((el) => {
      el.disabled = disabled;
    });
    dom.algorithmRace.disabled = disabled || !dom.raceMode.checked;
    dom.pauseBtn.disabled = !disabled;
    dom.stopBtn.disabled = !disabled;
    dom.nextStepBtn.disabled = !disabled || !dom.stepMode.checked;
  }

  summarizeResult(algorithm, result, computeMs, elapsedMs) {
    const profile = ALGORITHM_PROFILES[algorithm];
    return {
      algorithm,
      name: profile.name,
      found: !!result.found,
      nodesExpanded: result.nodesExpanded,
      pathLength: result.path.length,
      pathCost: result.found ? result.pathCost : null,
      elapsedMs: elapsedMs != null ? elapsedMs : Math.round(computeMs),
      computeMs: Math.round(computeMs),
    };
  }

  async startSearch() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.paused = false;
    this.stopped = false;
    this.setControlsDisabled(true);
    this.viewA.clearOverlay();
    this.viewB.clearOverlay();
    this.syncViews();
    this.resetMetrics();
    this.updateProfile();
    if (dom.raceMode.checked) {
      dom.paneSecondaryLabel.textContent = ALGORITHM_PROFILES[dom.algorithmRace.value].name;
    }

    const algo = dom.algorithm.value;
    const racing = dom.raceMode.checked;
    const opts = this.getOpts();
    const t0 = performance.now();
    const resultA = PathCore.search(algo, this.grid, this.start, this.end, opts);
    const computeA = performance.now() - t0;
    let resultB = null;
    let computeB = 0;
    if (racing) {
      const t1 = performance.now();
      resultB = PathCore.search(dom.algorithmRace.value, this.grid, this.start, this.end, opts);
      computeB = performance.now() - t1;
    }

    const statusMsg = racing
      ? `Racing ${ALGORITHM_PROFILES[algo].name} vs ${ALGORITHM_PROFILES[dom.algorithmRace.value].name}…`
      : `Running ${ALGORITHM_PROFILES[algo].name}…`;
    this.setStatus(statusMsg);
    this.announce(statusMsg);
    this.animStartedAt = performance.now();

    try {
      await this.animateResults(resultA, resultB);
      const elapsed = this.liveElapsed();
      const primary = this.summarizeResult(algo, resultA, computeA, elapsed);
      const secondary = resultB
        ? this.summarizeResult(dom.algorithmRace.value, resultB, computeB, elapsed)
        : null;
      this.recordRun({
        timestamp: new Date().toISOString(),
        mode: racing ? "race" : "single",
        maze: dom.maze.value,
        mazeLabel: MAZE_LABELS[dom.maze.value],
        rows: this.getRows(),
        cols: this.getCols(),
        diagonal: dom.diagonal.checked,
        primary,
        secondary,
      });
      const done = resultA.found
        ? racing
          ? "Race complete"
          : "Path found"
        : "No path found";
      this.setStatus(done);
      this.announce(done + ".");
      if (dom.teachingMode.checked) {
        this.setTeaching(
          resultA.found
            ? `Done. Path length ${resultA.path.length}, cost ${resultA.pathCost}, expanded ${resultA.nodesExpanded}.`
            : "Search finished — the end is unreachable from the start."
        );
      }
    } catch {
      this.setStatus("Search stopped");
      this.announce("Search stopped.");
    } finally {
      this.isRunning = false;
      this.paused = false;
      this.stopped = false;
      this.stepResolver = null;
      dom.pauseBtn.textContent = "Pause";
      this.setControlsDisabled(false);
    }
  }

  async animateResults(resultA, resultB) {
    const pairs = resultB
      ? [
          [this.viewA, resultA, dom.metricsPrimary],
          [this.viewB, resultB, dom.metricsSecondary],
        ]
      : [[this.viewA, resultA, dom.metricsPrimary]];

    const delay = this.getDelay();
    if (delay === 0 && !dom.stepMode.checked) {
      pairs.forEach(([view, result, metricsEl]) => {
        view.paintResult(this.grid, result);
        metricsEl.innerHTML = this.metricsHtml({
          nodesExpanded: result.nodesExpanded,
          pathLength: result.found ? result.path.length : 0,
          pathCost: result.found ? result.pathCost : 0,
          elapsedMs: this.liveElapsed(),
        });
      });
      if (resultA.found) this.audio.path();
      return;
    }

    const maxVisited = Math.max(...pairs.map(([, result]) => result.visitedOrder.length));
    for (let i = 0; i < maxVisited; i++) {
      await this.waitStep();
      pairs.forEach(([view, result, metricsEl]) => {
        const cell = result.visitedOrder[i];
        if (!cell) return;
        view.markExpand(this.grid, cell.r, cell.c);
        metricsEl.innerHTML = this.metricsHtml({
          nodesExpanded: i + 1,
          pathLength: 0,
          pathCost: 0,
          elapsedMs: this.liveElapsed(),
        });
      });
      if (dom.teachingMode.checked && resultA.visitedOrder[i]) {
        const cell = resultA.visitedOrder[i];
        const h = PathCore.heuristic(cell, this.end, this.getOpts());
        this.setTeaching(
          `Expanding (${cell.r},${cell.c}); heuristic=${formatH(h)}; frontier peak=${resultA.frontierPeaks}; expanded=${i + 1}.`
        );
      }
      this.audio.expand();
    }

    const maxPath = Math.max(...pairs.map(([, result]) => (result.found ? result.path.length : 0)));
    for (let i = 0; i < maxPath; i++) {
      await this.waitStep();
      pairs.forEach(([view, result, metricsEl]) => {
        if (!result.found) return;
        const cell = result.path[i];
        if (!cell) return;
        view.markPath(this.grid, cell.r, cell.c);
        metricsEl.innerHTML = this.metricsHtml({
          nodesExpanded: result.nodesExpanded,
          pathLength: i + 1,
          pathCost: result.pathCost,
          elapsedMs: this.liveElapsed(),
        });
      });
      if (dom.teachingMode.checked && resultA.found && resultA.path[i]) {
        const cell = resultA.path[i];
        this.setTeaching(`Tracing path (${cell.r},${cell.c}); length ${i + 1}; cost ${resultA.pathCost}.`);
      }
      this.audio.path();
    }

    pairs.forEach(([, result, metricsEl]) => {
      metricsEl.innerHTML = this.metricsHtml({
        nodesExpanded: result.nodesExpanded,
        pathLength: result.found ? result.path.length : 0,
        pathCost: result.found ? result.pathCost : 0,
        elapsedMs: this.liveElapsed(),
      });
    });
  }

  async runTournament() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.setControlsDisabled(true);
    this.setStatus("Running tournament…");
    this.announce("Running tournament.");

    const opts = this.getOpts();
    const results = [];
    try {
      for (const id of ALGORITHM_IDS) {
        const t0 = performance.now();
        const result = PathCore.search(id, this.grid, this.start, this.end, opts);
        const elapsed = performance.now() - t0;
        results.push(this.summarizeResult(id, result, elapsed, elapsed));
      }

      results.sort((a, b) => {
        if (a.found !== b.found) return a.found ? -1 : 1;
        const ac = a.found ? a.pathCost : Infinity;
        const bc = b.found ? b.pathCost : Infinity;
        if (ac !== bc) return ac - bc;
        if (a.nodesExpanded !== b.nodesExpanded) return a.nodesExpanded - b.nodesExpanded;
        return a.elapsedMs - b.elapsedMs;
      });

      this.renderLeaderboard(results);
      this.recordRun({
        timestamp: new Date().toISOString(),
        mode: "tournament",
        maze: dom.maze.value,
        mazeLabel: MAZE_LABELS[dom.maze.value],
        rows: this.getRows(),
        cols: this.getCols(),
        diagonal: dom.diagonal.checked,
        primary: results[0],
        secondary: null,
        tournamentResults: results,
      });
      this.setStatus(`Tournament complete — ${results[0].name} ranked first`);
      this.announce(`Tournament complete. ${results[0].name} ranked first.`);
    } catch {
      this.setStatus("Tournament stopped");
    } finally {
      this.isRunning = false;
      this.setControlsDisabled(false);
    }
  }

  renderLeaderboard(results) {
    dom.tournamentPanel.hidden = false;
    dom.leaderboard.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Algorithm</th>
            <th>Found</th>
            <th>Cost</th>
            <th>Nodes</th>
            <th>Time (ms)</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map((r, i) => {
              const rankClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "";
              const cost = r.found ? r.pathCost : "—";
              return `
                <tr class="${rankClass}">
                  <td>${i + 1}</td>
                  <td>${r.name}</td>
                  <td>${r.found ? "Yes" : "No"}</td>
                  <td>${cost}</td>
                  <td>${r.nodesExpanded}</td>
                  <td>${r.elapsedMs}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  togglePause() {
    if (!this.isRunning || dom.stepMode.checked) return;
    this.paused = !this.paused;
    dom.pauseBtn.textContent = this.paused ? "Resume" : "Pause";
    const msg = this.paused ? "Paused — Space to resume" : "Running…";
    this.setStatus(msg);
    this.announce(msg);
  }

  stopSearch() {
    if (!this.isRunning) return;
    this.stopped = true;
    this.paused = false;
    this.nextStep();
    this.setStatus("Stopping…");
  }

  recordRun(entry) {
    this.history.unshift(entry);
    this.history = this.history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    this.renderHistory();
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  renderHistory() {
    if (!this.history.length) {
      dom.historyList.innerHTML = '<li class="history-empty">No runs yet</li>';
      return;
    }
    dom.historyList.innerHTML = this.history
      .map((run) => {
        const date = new Date(run.timestamp).toLocaleString();
        const size = `${run.rows}×${run.cols}`;
        const primaryLine = run.primary
          ? `${run.primary.name}: ${run.primary.found ? `cost ${run.primary.pathCost}` : "no path"} / ${run.primary.nodesExpanded} nodes / ${run.primary.elapsedMs}ms`
          : "";
        const secondaryLine = run.secondary
          ? `<span class="history-secondary">${run.secondary.name}: ${run.secondary.found ? `cost ${run.secondary.pathCost}` : "no path"} / ${run.secondary.nodesExpanded} nodes / ${run.secondary.elapsedMs}ms</span>`
          : "";
        return `
          <li class="history-item">
            <span class="history-meta">${date} · ${run.mazeLabel || run.maze} · ${size} · ${run.mode}</span>
            <span class="history-primary">${primaryLine}</span>
            ${secondaryLine}
          </li>
        `;
      })
      .join("");
  }

  buildShareUrl() {
    const params = new URLSearchParams();
    params.set("algo", dom.algorithm.value);
    params.set("maze", dom.maze.value);
    params.set("rows", dom.rows.value);
    params.set("cols", dom.cols.value);
    params.set("speed", dom.speed.value);
    params.set("diag", dom.diagonal.checked ? "1" : "0");
    if (dom.raceMode.checked) {
      params.set("race", "1");
      params.set("raceAlgo", dom.algorithmRace.value);
    }
    if (dom.stepMode.checked) params.set("step", "1");
    if (dom.teachingMode.checked) params.set("teach", "1");
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  clamp(el, value) {
    const min = Number(el.min);
    const max = Number(el.max);
    const n = Number(value);
    if (Number.isNaN(n)) return;
    el.value = String(Math.min(max, Math.max(min, n)));
  }

  loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (!params.toString()) return;

    if (params.has("algo") && ALGORITHM_PROFILES[params.get("algo")]) {
      dom.algorithm.value = params.get("algo");
    }
    if (params.has("maze") && MAZE_LABELS[params.get("maze")]) {
      dom.maze.value = params.get("maze");
    }
    if (params.has("rows")) {
      this.clamp(dom.rows, params.get("rows"));
      dom.rowsValue.textContent = dom.rows.value;
    }
    if (params.has("cols")) {
      this.clamp(dom.cols, params.get("cols"));
      dom.colsValue.textContent = dom.cols.value;
    }
    if (params.has("speed")) {
      this.clamp(dom.speed, params.get("speed"));
      dom.speedValue.textContent = dom.speed.value;
    }
    const diag = params.get("diag") || params.get("diagonal");
    if (diag === "1" || diag === "true") dom.diagonal.checked = true;
    if (params.get("race") === "1") {
      dom.raceMode.checked = true;
      if (params.has("raceAlgo") && ALGORITHM_PROFILES[params.get("raceAlgo")]) {
        dom.algorithmRace.value = params.get("raceAlgo");
      }
    }
    dom.stepMode.checked = params.get("step") === "1";
    dom.teachingMode.checked = params.get("teach") === "1";
  }

  async copyShareUrl() {
    const url = this.buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      this.showToast("Share URL copied");
    } catch {
      this.showToast("Copy failed");
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    dom.themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
    dom.themeToggle.setAttribute("aria-pressed", next === "dark");
    localStorage.setItem("theme", next);
  }

  setStatus(message) {
    dom.statusText.textContent = message;
  }

  setTeaching(message) {
    dom.teachingText.textContent = message;
    this.announce(message);
  }

  announce(message) {
    if (!dom.a11yAnnouncer) return;
    dom.a11yAnnouncer.textContent = "";
    requestAnimationFrame(() => {
      dom.a11yAnnouncer.textContent = message;
    });
  }

  showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => dom.toast.classList.remove("visible"), 2200);
  }
}

const app = new PathLabApp();
app.init();
