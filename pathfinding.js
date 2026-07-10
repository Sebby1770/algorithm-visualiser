/* ============================================================
   Path Lab — Pathfinding visualizer mode
   BFS, DFS, Dijkstra, A*, Greedy Best-First, Bidirectional BFS
   ============================================================ */
"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  const WEIGHT_COST = 5;

  const PATH_ALGORITHMS = {
    bfs: {
      name: "Breadth-First Search",
      weighted: false,
      guarantee: "Shortest path guaranteed (unweighted)",
      complexity: "O(V + E)",
      description:
        "Expands outward level by level from the start. Ignores cell weights, but always finds the path with the fewest steps.",
    },
    dfs: {
      name: "Depth-First Search",
      weighted: false,
      guarantee: "No shortest-path guarantee",
      complexity: "O(V + E)",
      description:
        "Dives as deep as possible before backtracking. Fast to implement, but the path it finds can be wildly suboptimal.",
    },
    dijkstra: {
      name: "Dijkstra's Algorithm",
      weighted: true,
      guarantee: "Shortest path guaranteed (weighted)",
      complexity: "O((V + E) log V)",
      description:
        "Always settles the cheapest unvisited cell next. Respects weights, and is the gold standard for weighted shortest paths.",
    },
    astar: {
      name: "A* Search",
      weighted: true,
      guarantee: "Shortest path guaranteed (admissible heuristic)",
      complexity: "O((V + E) log V)",
      description:
        "Dijkstra plus a distance-to-goal heuristic. Explores far fewer cells while keeping the shortest-path guarantee.",
    },
    greedy: {
      name: "Greedy Best-First",
      weighted: true,
      guarantee: "No shortest-path guarantee",
      complexity: "O((V + E) log V)",
      description:
        "Chases the goal using only the heuristic. Very fast and very focused — but happily walks into traps and detours.",
    },
    bibfs: {
      name: "Bidirectional BFS",
      weighted: false,
      guarantee: "Shortest path guaranteed (unweighted)",
      complexity: "O(V + E)",
      description:
        "Runs one BFS from the start and one from the goal until the frontiers meet — often exploring far less than one-sided BFS.",
    },
  };

  const GRID_PRESETS = {
    small: { cols: 25, rows: 15 },
    medium: { cols: 37, rows: 21 },
    large: { cols: 49, rows: 27 },
  };

  /* ---------- Binary min-heap keyed by priority ---------- */
  class MinHeap {
    constructor() {
      this.items = [];
    }

    get size() {
      return this.items.length;
    }

    push(node, priority) {
      this.items.push({ node, priority });
      let i = this.items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (this.items[parent].priority <= this.items[i].priority) break;
        [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
        i = parent;
      }
    }

    pop() {
      const top = this.items[0];
      const last = this.items.pop();
      if (this.items.length > 0) {
        this.items[0] = last;
        let i = 0;
        for (;;) {
          const left = i * 2 + 1;
          const right = left + 1;
          let smallest = i;
          if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) smallest = left;
          if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) smallest = right;
          if (smallest === i) break;
          [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
          i = smallest;
        }
      }
      return top.node;
    }
  }

  /* ---------- Path Lab application ---------- */
  class PathLabApp {
    constructor() {
      this.dom = {
        workspace: $("pathWorkspace"),
        algorithm: $("pfAlgorithm"),
        gridSize: $("pfGridSize"),
        speed: $("pfSpeed"),
        speedValue: $("pfSpeedValue"),
        brush: $("pfBrush"),
        diagonal: $("pfDiagonal"),
        visualizeBtn: $("pfVisualizeBtn"),
        clearPathBtn: $("pfClearPathBtn"),
        clearBoardBtn: $("pfClearBoardBtn"),
        mazeType: $("pfMazeType"),
        mazeBtn: $("pfMazeBtn"),
        grid: $("pfGrid"),
        status: $("pfStatus"),
        metrics: $("pfMetrics"),
        profile: $("pfProfile"),
        toast: $("toast"),
      };

      this.cols = 0;
      this.rows = 0;
      this.walls = null; // Uint8Array
      this.weights = null; // Uint8Array of 1 | WEIGHT_COST
      this.cellEls = [];
      this.start = 0;
      this.end = 0;
      this.runId = 0;
      this.isRunning = false;
      this.lastRunAlgorithm = null;
      this.pointer = { painting: false, brush: null, dragging: null, lastIndex: -1 };

      this.bindEvents();
      this.buildGrid(this.dom.gridSize.value);
      this.renderProfile();
      this.setStatus("Draw walls, drop weights, then hit Visualize.");
    }

    /* ---------- Grid construction ---------- */
    buildGrid(preset) {
      const { cols, rows } = GRID_PRESETS[preset] || GRID_PRESETS.medium;
      this.cols = cols;
      this.rows = rows;
      this.walls = new Uint8Array(cols * rows);
      this.weights = new Uint8Array(cols * rows).fill(1);
      // Even coordinates are room cells in recursive-division mazes (walls
      // only occupy odd rows/cols), so even endpoints are never sealed in.
      const even = (n) => n - (n % 2);
      const midRow = even(Math.floor(rows / 2));
      this.start = this.index(midRow, even(Math.floor(cols / 5)));
      this.end = this.index(midRow, even(cols - 1 - Math.floor(cols / 5)));
      this.lastRunAlgorithm = null;

      this.dom.grid.style.setProperty("--pf-cols", cols);
      this.dom.grid.innerHTML = "";
      this.cellEls = new Array(cols * rows);
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < cols * rows; i++) {
        const cell = document.createElement("div");
        cell.className = "pf-cell";
        cell.dataset.index = i;
        this.cellEls[i] = cell;
        fragment.appendChild(cell);
      }
      this.dom.grid.appendChild(fragment);
      this.paintEndpoints();
      this.updateMetrics(null);
    }

    index(row, col) {
      return row * this.cols + col;
    }

    rowOf(i) {
      return Math.floor(i / this.cols);
    }

    colOf(i) {
      return i % this.cols;
    }

    paintEndpoints() {
      this.cellEls.forEach((el, i) => {
        el.classList.toggle("start", i === this.start);
        el.classList.toggle("end", i === this.end);
      });
    }

    /* ---------- Event wiring ---------- */
    bindEvents() {
      this.dom.gridSize.addEventListener("change", () => {
        this.cancelRun();
        this.buildGrid(this.dom.gridSize.value);
        this.setStatus("Fresh grid ready.");
      });

      this.dom.speed.addEventListener("input", () => {
        this.dom.speedValue.textContent = this.dom.speed.value;
      });

      this.dom.algorithm.addEventListener("change", () => {
        this.renderProfile();
        this.instantRepath();
      });

      this.dom.diagonal.addEventListener("change", () => this.instantRepath());

      this.dom.visualizeBtn.addEventListener("click", () => this.visualize());
      this.dom.clearPathBtn.addEventListener("click", () => {
        this.cancelRun();
        this.clearSearchArtifacts();
        this.lastRunAlgorithm = null;
        this.updateMetrics(null);
        this.setStatus("Path cleared — walls kept.");
      });
      this.dom.clearBoardBtn.addEventListener("click", () => {
        this.cancelRun();
        this.buildGrid(this.dom.gridSize.value);
        this.setStatus("Board cleared.");
      });
      this.dom.mazeBtn.addEventListener("click", () => this.generateMaze());

      const grid = this.dom.grid;
      grid.addEventListener("pointerdown", (e) => this.onPointerDown(e));
      grid.addEventListener("pointermove", (e) => this.onPointerMove(e));
      window.addEventListener("pointerup", () => this.onPointerUp());
      grid.addEventListener("contextmenu", (e) => e.preventDefault());

      document.addEventListener("keydown", (e) => {
        if (document.body.dataset.mode !== "path") return;
        if (e.target.matches("input, select, textarea")) return;
        switch (e.code) {
          case "KeyV":
            this.visualize();
            break;
          case "KeyC":
            this.dom.clearPathBtn.click();
            break;
          case "KeyB":
            this.dom.clearBoardBtn.click();
            break;
          case "KeyM":
            this.generateMaze();
            break;
          default:
            break;
        }
      });
    }

    cellFromEvent(e) {
      // Mouse: the event target is the cell. Touch: implicit pointer capture
      // pins the target to the first cell, so hit-test the coordinates.
      let cell = e.target && e.target.closest ? e.target.closest(".pf-cell") : null;
      if (!cell) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        cell = el && el.closest ? el.closest(".pf-cell") : null;
      }
      return cell ? parseInt(cell.dataset.index, 10) : -1;
    }

    onPointerDown(e) {
      if (this.isRunning) return;
      const i = this.cellFromEvent(e);
      if (i < 0) return;
      e.preventDefault();
      if (e.target.releasePointerCapture && e.pointerId !== undefined) {
        try {
          e.target.releasePointerCapture(e.pointerId);
        } catch (_) {
          /* pointer already released */
        }
      }

      if (i === this.start) {
        this.pointer.dragging = "start";
      } else if (i === this.end) {
        this.pointer.dragging = "end";
      } else {
        this.pointer.painting = true;
        const brush = this.dom.brush.value;
        // First cell decides paint vs erase for the whole stroke
        if (brush === "wall") this.pointer.brush = this.walls[i] ? "erase" : "wall";
        else if (brush === "weight") this.pointer.brush = this.weights[i] > 1 ? "erase" : "weight";
        else this.pointer.brush = "erase";
        this.applyBrush(i);
      }
      this.pointer.lastIndex = i;
    }

    onPointerMove(e) {
      if (!this.pointer.painting && !this.pointer.dragging) return;
      const i = this.cellFromEvent(e);
      if (i < 0 || i === this.pointer.lastIndex) return;
      this.pointer.lastIndex = i;

      if (this.pointer.dragging) {
        if (this.walls[i]) return;
        if (this.pointer.dragging === "start" && i !== this.end) this.start = i;
        if (this.pointer.dragging === "end" && i !== this.start) this.end = i;
        this.paintEndpoints();
        this.instantRepath();
      } else {
        this.applyBrush(i);
      }
    }

    onPointerUp() {
      const wasEditing = this.pointer.painting;
      this.pointer.painting = false;
      this.pointer.dragging = null;
      this.pointer.brush = null;
      this.pointer.lastIndex = -1;
      if (wasEditing) this.instantRepath();
    }

    applyBrush(i) {
      if (i === this.start || i === this.end) return;
      const el = this.cellEls[i];
      if (this.pointer.brush === "wall") {
        this.walls[i] = 1;
        this.weights[i] = 1;
      } else if (this.pointer.brush === "weight") {
        this.walls[i] = 0;
        this.weights[i] = WEIGHT_COST;
      } else {
        this.walls[i] = 0;
        this.weights[i] = 1;
      }
      el.classList.toggle("wall", this.walls[i] === 1);
      el.classList.toggle("weight", this.weights[i] > 1);
    }

    /* ---------- Neighbors ---------- */
    neighbors(i, allowDiagonal) {
      const r = this.rowOf(i);
      const c = this.colOf(i);
      const out = [];
      const open = (rr, cc) =>
        rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols && !this.walls[this.index(rr, cc)];

      const orth = [
        [r - 1, c],
        [r, c + 1],
        [r + 1, c],
        [r, c - 1],
      ];
      for (const [rr, cc] of orth) {
        if (open(rr, cc)) out.push({ node: this.index(rr, cc), diagonal: false });
      }

      if (allowDiagonal) {
        const diag = [
          [r - 1, c + 1, r - 1, c, r, c + 1],
          [r + 1, c + 1, r + 1, c, r, c + 1],
          [r + 1, c - 1, r + 1, c, r, c - 1],
          [r - 1, c - 1, r - 1, c, r, c - 1],
        ];
        for (const [rr, cc, ar, ac, br, bc] of diag) {
          // No corner cutting: both orthogonal sides must be open
          if (open(rr, cc) && open(ar, ac) && open(br, bc)) {
            out.push({ node: this.index(rr, cc), diagonal: true });
          }
        }
      }
      return out;
    }

    stepCost(target, diagonal) {
      return this.weights[target] * (diagonal ? Math.SQRT2 : 1);
    }

    heuristic(i, allowDiagonal) {
      const dr = Math.abs(this.rowOf(i) - this.rowOf(this.end));
      const dc = Math.abs(this.colOf(i) - this.colOf(this.end));
      // Octile distance with diagonals, Manhattan without — both admissible
      if (allowDiagonal) return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
      return dr + dc;
    }

    /* ---------- Search algorithms ----------
       Each returns { visited: number[], path: number[]|null, cost: number } */
    runAlgorithm(id, allowDiagonal) {
      switch (id) {
        case "bfs":
          return this.searchFrontier(allowDiagonal, { useStack: false });
        case "dfs":
          return this.searchFrontier(allowDiagonal, { useStack: true });
        case "dijkstra":
          return this.searchHeap(allowDiagonal, { useCost: true, useHeuristic: false });
        case "astar":
          return this.searchHeap(allowDiagonal, { useCost: true, useHeuristic: true });
        case "greedy":
          return this.searchHeap(allowDiagonal, { useCost: false, useHeuristic: true });
        case "bibfs":
          return this.searchBidirectional(allowDiagonal);
        default:
          return { visited: [], path: null, cost: 0 };
      }
    }

    searchFrontier(allowDiagonal, { useStack }) {
      const visited = [];
      const prev = new Int32Array(this.cols * this.rows).fill(-1);
      const seen = new Uint8Array(this.cols * this.rows);
      const frontier = [this.start];
      seen[this.start] = 1;

      while (frontier.length > 0) {
        const current = useStack ? frontier.pop() : frontier.shift();
        visited.push(current);
        if (current === this.end) return this.finishSearch(visited, prev);
        for (const { node } of this.neighbors(current, allowDiagonal)) {
          if (!seen[node]) {
            seen[node] = 1;
            prev[node] = current;
            frontier.push(node);
          }
        }
      }
      return { visited, path: null, cost: 0 };
    }

    searchHeap(allowDiagonal, { useCost, useHeuristic }) {
      const total = this.cols * this.rows;
      const visited = [];
      const prev = new Int32Array(total).fill(-1);
      const dist = new Float64Array(total).fill(Infinity);
      const settled = new Uint8Array(total);
      const heap = new MinHeap();

      dist[this.start] = 0;
      heap.push(this.start, useHeuristic ? this.heuristic(this.start, allowDiagonal) : 0);

      while (heap.size > 0) {
        const current = heap.pop();
        if (settled[current]) continue;
        settled[current] = 1;
        visited.push(current);
        if (current === this.end) return this.finishSearch(visited, prev);

        for (const { node, diagonal } of this.neighbors(current, allowDiagonal)) {
          if (settled[node]) continue;
          const candidate = dist[current] + this.stepCost(node, diagonal);
          if (candidate < dist[node]) {
            dist[node] = candidate;
            prev[node] = current;
            const h = useHeuristic ? this.heuristic(node, allowDiagonal) : 0;
            heap.push(node, (useCost ? candidate : 0) + h);
          }
        }
      }
      return { visited, path: null, cost: 0 };
    }

    searchBidirectional(allowDiagonal) {
      if (this.start === this.end) return { visited: [this.start], path: [this.start], cost: 0 };
      const total = this.cols * this.rows;
      const visited = [];
      const prevA = new Int32Array(total).fill(-1);
      const prevB = new Int32Array(total).fill(-1);
      const sideOf = new Int8Array(total); // 0 unseen, 1 from start, 2 from end
      let frontA = [this.start];
      let frontB = [this.end];
      sideOf[this.start] = 1;
      sideOf[this.end] = 2;

      const expand = (frontier, side, prev) => {
        const next = [];
        for (const current of frontier) {
          visited.push(current);
          for (const { node } of this.neighbors(current, allowDiagonal)) {
            if (sideOf[node] === 0) {
              sideOf[node] = side;
              prev[node] = current;
              next.push(node);
            } else if (sideOf[node] !== side) {
              return { next, meet: node, from: current };
            }
          }
        }
        return { next, meet: -1, from: -1 };
      };

      while (frontA.length > 0 && frontB.length > 0) {
        const expandFromStart = frontA.length <= frontB.length;
        const result = expandFromStart
          ? expand(frontA, 1, prevA)
          : expand(frontB, 2, prevB);

        if (result.meet !== -1) {
          if (expandFromStart) prevA[result.meet] = result.from;
          else prevB[result.meet] = result.from;
          // Stitch: walk prevA back to start, prevB forward to end
          const left = [];
          for (let n = result.meet; n !== -1; n = prevA[n]) left.push(n);
          left.reverse();
          const right = [];
          for (let n = prevB[result.meet]; n !== -1; n = prevB[n]) right.push(n);
          const path = left.concat(right);
          return { visited, path, cost: this.pathCost(path) };
        }
        if (expandFromStart) frontA = result.next;
        else frontB = result.next;
      }
      return { visited, path: null, cost: 0 };
    }

    finishSearch(visited, prev) {
      const path = [];
      for (let n = this.end; n !== -1; n = prev[n]) path.push(n);
      path.reverse();
      return { visited, path, cost: this.pathCost(path) };
    }

    pathCost(path) {
      let cost = 0;
      for (let i = 1; i < path.length; i++) {
        const diagonal =
          this.rowOf(path[i]) !== this.rowOf(path[i - 1]) &&
          this.colOf(path[i]) !== this.colOf(path[i - 1]);
        cost += this.stepCost(path[i], diagonal);
      }
      return cost;
    }

    /* ---------- Visualization ---------- */
    speedDelay() {
      const speed = parseInt(this.dom.speed.value, 10);
      return Math.max(0, Math.round((100 - speed) * 0.6));
    }

    visitsPerTick() {
      const speed = parseInt(this.dom.speed.value, 10);
      if (speed > 90) return 6;
      if (speed > 70) return 3;
      if (speed > 40) return 2;
      return 1;
    }

    clearSearchArtifacts() {
      this.dom.grid.classList.remove("instant");
      this.cellEls.forEach((el) => el.classList.remove("visited", "path"));
    }

    cancelRun() {
      this.runId += 1;
      this.isRunning = false;
      this.dom.visualizeBtn.disabled = false;
    }

    async visualize() {
      if (this.isRunning) return;
      this.clearSearchArtifacts();
      const algorithmId = this.dom.algorithm.value;
      const allowDiagonal = this.dom.diagonal.checked;
      const myRun = ++this.runId;
      this.isRunning = true;
      this.dom.visualizeBtn.disabled = true;
      this.setStatus(`Running ${PATH_ALGORITHMS[algorithmId].name}…`);

      const t0 = performance.now();
      const result = this.runAlgorithm(algorithmId, allowDiagonal);
      const elapsed = performance.now() - t0;

      const delay = this.speedDelay();
      const batch = this.visitsPerTick();
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      for (let i = 0; i < result.visited.length; i += batch) {
        if (this.runId !== myRun) return;
        for (let j = i; j < Math.min(i + batch, result.visited.length); j++) {
          const node = result.visited[j];
          if (node !== this.start && node !== this.end) this.cellEls[node].classList.add("visited");
        }
        await sleep(delay);
      }

      if (this.runId !== myRun) return;

      if (result.path) {
        for (const node of result.path) {
          if (this.runId !== myRun) return;
          if (node !== this.start && node !== this.end) this.cellEls[node].classList.add("path");
          await sleep(Math.max(delay, 12));
        }
        this.setStatus(
          `${PATH_ALGORITHMS[algorithmId].name}: path found — ${result.path.length - 1} steps, cost ${result.cost.toFixed(1)}.`
        );
      } else {
        this.setStatus(`${PATH_ALGORITHMS[algorithmId].name}: no path — the goal is walled off.`);
      }

      this.updateMetrics({ ...result, elapsed });
      this.lastRunAlgorithm = algorithmId;
      this.isRunning = false;
      this.dom.visualizeBtn.disabled = false;
    }

    /* Re-run the last algorithm instantly (no animation) after board edits */
    instantRepath() {
      if (!this.lastRunAlgorithm || this.isRunning) return;
      this.clearSearchArtifacts();
      this.dom.grid.classList.add("instant");
      const t0 = performance.now();
      const result = this.runAlgorithm(this.lastRunAlgorithm, this.dom.diagonal.checked);
      const elapsed = performance.now() - t0;
      for (const node of result.visited) {
        if (node !== this.start && node !== this.end) this.cellEls[node].classList.add("visited");
      }
      if (result.path) {
        for (const node of result.path) {
          if (node !== this.start && node !== this.end) this.cellEls[node].classList.add("path");
        }
      }
      this.updateMetrics({ ...result, elapsed });
    }

    /* ---------- Mazes ---------- */
    generateMaze() {
      if (this.isRunning) return;
      this.cancelRun();
      this.buildGrid(this.dom.gridSize.value);
      const type = this.dom.mazeType.value;

      if (type === "division") {
        this.recursiveDivision(0, 0, this.cols, this.rows);
        this.setStatus("Recursive division maze built.");
      } else if (type === "scatter") {
        for (let i = 0; i < this.walls.length; i++) {
          if (i !== this.start && i !== this.end && Math.random() < 0.28) this.walls[i] = 1;
        }
        this.setStatus("Random scatter field built.");
      } else {
        for (let i = 0; i < this.weights.length; i++) {
          if (i !== this.start && i !== this.end && Math.random() < 0.3) this.weights[i] = WEIGHT_COST;
        }
        this.setStatus("Weighted terrain built — try Dijkstra vs A*.");
      }

      this.cellEls.forEach((el, i) => {
        el.classList.toggle("wall", this.walls[i] === 1);
        el.classList.toggle("weight", this.weights[i] > 1);
      });
    }

    recursiveDivision(x, y, width, height) {
      if (width < 3 || height < 3) return;

      // Walls live on odd global rows/cols, gaps on even ones — a gap can
      // never be covered by a later perpendicular wall, so the maze stays
      // fully connected.
      const pick = (list) => list[Math.floor(Math.random() * list.length)];
      const horizontal = height > width || (height === width && Math.random() < 0.5);

      if (horizontal) {
        const wallRows = [];
        for (let r = y + 1; r < y + height - 1; r++) if (r % 2 === 1) wallRows.push(r);
        const gapCols = [];
        for (let c = x; c < x + width; c++) if (c % 2 === 0) gapCols.push(c);
        if (wallRows.length === 0 || gapCols.length === 0) return;
        const wallRow = pick(wallRows);
        const gapCol = pick(gapCols);
        for (let c = x; c < x + width; c++) {
          const i = this.index(wallRow, c);
          if (c !== gapCol && i !== this.start && i !== this.end) this.walls[i] = 1;
        }
        this.recursiveDivision(x, y, width, wallRow - y);
        this.recursiveDivision(x, wallRow + 1, width, y + height - wallRow - 1);
      } else {
        const wallCols = [];
        for (let c = x + 1; c < x + width - 1; c++) if (c % 2 === 1) wallCols.push(c);
        const gapRows = [];
        for (let r = y; r < y + height; r++) if (r % 2 === 0) gapRows.push(r);
        if (wallCols.length === 0 || gapRows.length === 0) return;
        const wallCol = pick(wallCols);
        const gapRow = pick(gapRows);
        for (let r = y; r < y + height; r++) {
          const i = this.index(r, wallCol);
          if (r !== gapRow && i !== this.start && i !== this.end) this.walls[i] = 1;
        }
        this.recursiveDivision(x, y, wallCol - x, height);
        this.recursiveDivision(wallCol + 1, y, x + width - wallCol - 1, height);
      }
    }

    /* ---------- UI panels ---------- */
    renderProfile() {
      const profile = PATH_ALGORITHMS[this.dom.algorithm.value];
      this.dom.profile.innerHTML = `
        <h2 class="panel-title">${profile.name}</h2>
        <p class="panel-sub">${profile.description}</p>
        <div class="pf-profile-facts">
          <span class="pf-fact ${profile.guarantee.startsWith("Shortest") ? "good" : "warn"}">${profile.guarantee}</span>
          <span class="pf-fact">${profile.complexity}</span>
          <span class="pf-fact">${profile.weighted ? "Respects weights" : "Ignores weights"}</span>
        </div>`;
    }

    updateMetrics(result) {
      if (!result) {
        this.dom.metrics.innerHTML = "";
        return;
      }
      const items = [
        ["Visited", result.visited.length],
        ["Path steps", result.path ? result.path.length - 1 : "—"],
        ["Path cost", result.path ? result.cost.toFixed(1) : "—"],
        ["Compute", `${result.elapsed.toFixed(2)} ms`],
      ];
      this.dom.metrics.innerHTML = items
        .map(([label, value]) => `<span class="metric"><strong>${value}</strong> ${label}</span>`)
        .join("");
    }

    setStatus(text) {
      this.dom.status.textContent = text;
    }
  }

  /* ---------- Mode switching (Sorting ⇄ Pathfinding) ---------- */
  const MODE_KEY = "algoLabMode";

  function setMode(mode, { persist = true } = {}) {
    const isPath = mode === "path";
    document.body.dataset.mode = isPath ? "path" : "sort";
    $("sortWorkspace").hidden = isPath;
    $("pathWorkspace").hidden = !isPath;
    $("modeSortBtn").classList.toggle("active", !isPath);
    $("modeSortBtn").setAttribute("aria-selected", String(!isPath));
    $("modePathBtn").classList.toggle("active", isPath);
    $("modePathBtn").setAttribute("aria-selected", String(isPath));
    const sub = document.querySelector(".brand-sub");
    if (sub) sub.textContent = isPath ? "Pathfinding Visualizer" : "Sorting Algorithm Visualizer";
    if (persist) {
      try {
        localStorage.setItem(MODE_KEY, isPath ? "path" : "sort");
      } catch (_) {
        /* private browsing */
      }
    }
  }

  $("modeSortBtn").addEventListener("click", () => setMode("sort"));
  $("modePathBtn").addEventListener("click", () => setMode("path"));

  const urlMode = new URLSearchParams(window.location.search).get("mode");
  let savedMode = null;
  try {
    savedMode = localStorage.getItem(MODE_KEY);
  } catch (_) {
    /* private browsing */
  }
  setMode(urlMode || savedMode || "sort", { persist: false });

  window.pathLab = new PathLabApp();
})();
