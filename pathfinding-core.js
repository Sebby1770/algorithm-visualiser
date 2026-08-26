/* ============================================================
   Path Lab — algorithms + maze generators
   Works in the browser (global PathCore) and Node (CJS).
   Grids are never mutated by search. Maze generators return a new grid.
   ============================================================ */

(function (root) {
  const EMPTY_WEIGHT = 1;
  const WEIGHT_CELL = 5;

  const DIRS4 = [
    [-1, 0],
    [0, 1],
    [1, 0],
    [0, -1],
  ];
  const DIRS8 = DIRS4.concat([
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ]);

  function coord(r, c) {
    if (c === undefined && r && typeof r === "object") return { r: r.r, c: r.c };
    return { r, c };
  }

  function key(p) {
    return p.r + "," + p.c;
  }

  function rngFn(rng) {
    return typeof rng === "function" ? rng : Math.random;
  }

  function randInt(rng, n) {
    if (n <= 0) return 0;
    const x = rng();
    const i = Math.floor((x >= 0 && x < 1 ? x : 0) * n);
    return i >= n ? n - 1 : i;
  }

  function inBounds(grid, r, c) {
    if (typeof r === "object") {
      c = r.c;
      r = r.r;
    }
    return r >= 0 && c >= 0 && r < grid.length && grid.length > 0 && c < grid[0].length;
  }

  function cellWeight(cell) {
    if (!cell || cell.type === "wall") return Infinity;
    if (typeof cell.weight === "number" && !Number.isNaN(cell.weight)) return cell.weight;
    return cell.type === "weight" ? WEIGHT_CELL : EMPTY_WEIGHT;
  }

  function isBlocked(grid, r, c, opts) {
    if (!inBounds(grid, r, c)) return true;
    if (opts && opts.start && r === opts.start.r && c === opts.start.c) return false;
    if (opts && opts.end && r === opts.end.r && c === opts.end.c) return false;
    return grid[r][c].type === "wall";
  }

  function makeGrid(rows, cols) {
    const grid = new Array(rows);
    for (let r = 0; r < rows; r++) {
      const row = new Array(cols);
      for (let c = 0; c < cols; c++) {
        row[c] = { type: "empty", weight: EMPTY_WEIGHT };
      }
      grid[r] = row;
    }
    return grid;
  }

  function cloneGrid(grid) {
    return grid.map((row) => row.map((cell) => ({ type: cell.type, weight: cell.weight })));
  }

  function setCell(grid, r, c, props) {
    if (!inBounds(grid, r, c) || !props) return grid;
    const cell = grid[r][c];
    if (props.type !== undefined) cell.type = props.type;
    if (props.weight !== undefined) cell.weight = props.weight;
    else if (props.type === "weight") cell.weight = WEIGHT_CELL;
    else if (props.type === "empty" || props.type === "start" || props.type === "end") {
      if (cell.weight == null) cell.weight = EMPTY_WEIGHT;
    }
    return grid;
  }

  /**
   * In-bounds neighbors. Skips walls unless opts.includeWalls.
   * Start/end coordinates (opts.start / opts.end) are always walkable.
   * Diagonal moves do not cut corners through walls.
   */
  function neighbors(grid, r, c, opts) {
    opts = opts || {};
    const dirs = opts.diagonal ? DIRS8 : DIRS4;
    const rows = grid.length;
    const cols = rows ? grid[0].length : 0;
    const out = [];
    for (let i = 0; i < dirs.length; i++) {
      const dr = dirs[i][0];
      const dc = dirs[i][1];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (!opts.includeWalls && isBlocked(grid, nr, nc, opts)) continue;
      if (dr !== 0 && dc !== 0 && !opts.includeWalls) {
        if (isBlocked(grid, r + dr, c, opts) || isBlocked(grid, r, c + dc, opts)) continue;
      }
      out.push({ r: nr, c: nc });
    }
    return out;
  }

  function heuristic(a, b, opts) {
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    // Diagonal steps cost 1 (same as orthogonal), so Chebyshev is admissible.
    // Euclidean overestimates a 1-cost diagonal (~1.41) and A* can miss optimal paths.
    if (opts && opts.diagonal) return Math.max(dr, dc);
    return dr + dc;
  }

  function lookupParent(cameFrom, id) {
    if (!cameFrom) return undefined;
    if (typeof cameFrom.get === "function") return cameFrom.get(id);
    return cameFrom[id];
  }

  /**
   * Parent map keys are "r,c". Walks from end until start (or a null parent).
   */
  function reconstructPath(cameFrom, end, start) {
    const path = [];
    let cur = coord(end);
    const startKey = start ? key(start) : null;
    const seen = new Set();
    while (cur) {
      const id = key(cur);
      if (seen.has(id)) break;
      seen.add(id);
      path.push({ r: cur.r, c: cur.c });
      if (startKey && id === startKey) break;
      const parent = lookupParent(cameFrom, id);
      if (!parent) break;
      cur = parent;
    }
    path.reverse();
    if (start && (path.length === 0 || key(path[0]) !== startKey)) return [];
    return path;
  }

  function computePathCost(grid, path) {
    let cost = 0;
    for (let i = 1; i < path.length; i++) {
      cost += cellWeight(grid[path[i].r][path[i].c]);
    }
    return cost;
  }

  function buildScores(gScore, end, opts, hWeight) {
    const scores = {};
    if (!gScore || typeof gScore.forEach !== "function") return scores;
    const w = typeof hWeight === "number" && hWeight > 0 ? hWeight : 1;
    gScore.forEach((g, id) => {
      const comma = String(id).indexOf(",");
      if (comma < 0) return;
      const cell = { r: Number(id.slice(0, comma)), c: Number(id.slice(comma + 1)) };
      const h = heuristic(cell, end, opts);
      scores[id] = { g: g, h: h, f: g + w * h };
    });
    return scores;
  }

  function finish(algorithm, grid, found, path, visitedOrder, frontierPeak, extra) {
    const ok = !!found && path && path.length > 0;
    const result = {
      found: ok,
      path: ok ? path : [],
      visitedOrder: visitedOrder || [],
      frontierPeaks: frontierPeak || 0,
      pathCost: ok ? computePathCost(grid, path) : 0,
      nodesExpanded: (visitedOrder && visitedOrder.length) || 0,
      algorithm,
    };
    if (extra && extra.scores) result.scores = extra.scores;
    return result;
  }

  function trivial(algorithm, start) {
    const p = [coord(start)];
    return {
      found: true,
      path: p,
      visitedOrder: [coord(start)],
      frontierPeaks: 1,
      pathCost: 0,
      nodesExpanded: 1,
      algorithm,
    };
  }

  function invalid(algorithm) {
    return finish(algorithm, [], false, [], [], 0);
  }

  function sameCell(a, b) {
    return a.r === b.r && a.c === b.c;
  }

  function searchOpts(start, end, opts) {
    const o = Object.assign({}, opts || {}, { start: coord(start), end: coord(end) });
    return o;
  }

  function createMinHeap() {
    const a = [];
    function swap(i, j) {
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    function less(i, j) {
      const x = a[i];
      const y = a[j];
      if (x.pri !== y.pri) return x.pri < y.pri;
      return (x.tie || 0) < (y.tie || 0);
    }
    function up(i) {
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(i, p)) break;
        swap(i, p);
        i = p;
      }
    }
    function down(i) {
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(l, m)) m = l;
        if (r < a.length && less(r, m)) m = r;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    return {
      get size() {
        return a.length;
      },
      push(item) {
        a.push(item);
        up(a.length - 1);
      },
      pop() {
        if (!a.length) return undefined;
        const top = a[0];
        const last = a.pop();
        if (a.length) {
          a[0] = last;
          down(0);
        }
        return top;
      },
    };
  }

  function bfs(grid, start, end, opts) {
    if (!grid || !grid.length) return invalid("bfs");
    start = coord(start);
    end = coord(end);
    if (!inBounds(grid, start) || !inBounds(grid, end)) return invalid("bfs");
    if (sameCell(start, end)) return trivial("bfs", start);

    const o = searchOpts(start, end, opts);
    const q = [coord(start)];
    const cameFrom = new Map();
    const seen = new Set([key(start)]);
    const visitedOrder = [];
    let frontierPeak = 1;

    while (q.length) {
      if (q.length > frontierPeak) frontierPeak = q.length;
      const cur = q.shift();
      visitedOrder.push(cur);
      if (sameCell(cur, end)) {
        return finish("bfs", grid, true, reconstructPath(cameFrom, end, start), visitedOrder, frontierPeak);
      }
      const nbrs = neighbors(grid, cur.r, cur.c, o);
      for (let i = 0; i < nbrs.length; i++) {
        const n = nbrs[i];
        const id = key(n);
        if (seen.has(id)) continue;
        seen.add(id);
        cameFrom.set(id, cur);
        q.push(n);
      }
    }
    return finish("bfs", grid, false, [], visitedOrder, frontierPeak);
  }

  function dfs(grid, start, end, opts) {
    if (!grid || !grid.length) return invalid("dfs");
    start = coord(start);
    end = coord(end);
    if (!inBounds(grid, start) || !inBounds(grid, end)) return invalid("dfs");
    if (sameCell(start, end)) return trivial("dfs", start);

    const o = searchOpts(start, end, opts);
    const stack = [coord(start)];
    const cameFrom = new Map();
    const seen = new Set([key(start)]);
    const visitedOrder = [];
    let frontierPeak = 1;

    while (stack.length) {
      if (stack.length > frontierPeak) frontierPeak = stack.length;
      const cur = stack.pop();
      visitedOrder.push(cur);
      if (sameCell(cur, end)) {
        return finish("dfs", grid, true, reconstructPath(cameFrom, end, start), visitedOrder, frontierPeak);
      }
      const nbrs = neighbors(grid, cur.r, cur.c, o);
      for (let i = nbrs.length - 1; i >= 0; i--) {
        const n = nbrs[i];
        const id = key(n);
        if (seen.has(id)) continue;
        seen.add(id);
        cameFrom.set(id, cur);
        stack.push(n);
      }
    }
    return finish("dfs", grid, false, [], visitedOrder, frontierPeak);
  }

  function dijkstra(grid, start, end, opts) {
    if (!grid || !grid.length) return invalid("dijkstra");
    start = coord(start);
    end = coord(end);
    if (!inBounds(grid, start) || !inBounds(grid, end)) return invalid("dijkstra");
    if (sameCell(start, end)) return trivial("dijkstra", start);

    const o = searchOpts(start, end, opts);
    const heap = createMinHeap();
    const dist = new Map();
    const cameFrom = new Map();
    const closed = new Set();
    const visitedOrder = [];
    const startKey = key(start);
    dist.set(startKey, 0);
    heap.push({ r: start.r, c: start.c, pri: 0, g: 0 });
    let frontierPeak = 1;

    while (heap.size) {
      if (heap.size > frontierPeak) frontierPeak = heap.size;
      const cur = heap.pop();
      const id = key(cur);
      if (closed.has(id)) continue;
      const best = dist.get(id);
      if (best !== undefined && cur.g > best) continue;
      closed.add(id);
      visitedOrder.push({ r: cur.r, c: cur.c });
      if (sameCell(cur, end)) {
        return finish("dijkstra", grid, true, reconstructPath(cameFrom, end, start), visitedOrder, frontierPeak, {
          scores: buildScores(dist, end, o),
        });
      }
      const nbrs = neighbors(grid, cur.r, cur.c, o);
      for (let i = 0; i < nbrs.length; i++) {
        const n = nbrs[i];
        const nid = key(n);
        if (closed.has(nid)) continue;
        const ng = cur.g + cellWeight(grid[n.r][n.c]);
        const prev = dist.get(nid);
        if (prev === undefined || ng < prev) {
          dist.set(nid, ng);
          cameFrom.set(nid, { r: cur.r, c: cur.c });
          heap.push({ r: n.r, c: n.c, pri: ng, g: ng });
        }
      }
    }
    return finish("dijkstra", grid, false, [], visitedOrder, frontierPeak, {
      scores: buildScores(dist, end, o),
    });
  }

  function astar(grid, start, end, opts) {
    if (!grid || !grid.length) return invalid("astar");
    start = coord(start);
    end = coord(end);
    if (!inBounds(grid, start) || !inBounds(grid, end)) return invalid("astar");
    if (sameCell(start, end)) return trivial("astar", start);

    const o = searchOpts(start, end, opts);
    const heap = createMinHeap();
    const gScore = new Map();
    const cameFrom = new Map();
    const closed = new Set();
    const visitedOrder = [];
    const startKey = key(start);
    gScore.set(startKey, 0);
    const h0 = heuristic(start, end, o);
    heap.push({ r: start.r, c: start.c, pri: h0, tie: h0, g: 0 });
    let frontierPeak = 1;

    while (heap.size) {
      if (heap.size > frontierPeak) frontierPeak = heap.size;
      const cur = heap.pop();
      const id = key(cur);
      if (closed.has(id)) continue;
      const bestG = gScore.get(id);
      if (bestG !== undefined && cur.g > bestG) continue;
      closed.add(id);
      visitedOrder.push({ r: cur.r, c: cur.c });
      if (sameCell(cur, end)) {
        return finish("astar", grid, true, reconstructPath(cameFrom, end, start), visitedOrder, frontierPeak, {
          scores: buildScores(gScore, end, o),
        });
      }
      const nbrs = neighbors(grid, cur.r, cur.c, o);
      for (let i = 0; i < nbrs.length; i++) {
        const n = nbrs[i];
        const nid = key(n);
        if (closed.has(nid)) continue;
        const ng = cur.g + cellWeight(grid[n.r][n.c]);
        const prev = gScore.get(nid);
        if (prev === undefined || ng < prev) {
          gScore.set(nid, ng);
          cameFrom.set(nid, { r: cur.r, c: cur.c });
          const h = heuristic(n, end, o);
          heap.push({ r: n.r, c: n.c, pri: ng + h, tie: h, g: ng });
        }
      }
    }
    return finish("astar", grid, false, [], visitedOrder, frontierPeak, {
      scores: buildScores(gScore, end, o),
    });
  }

  function weightedAstar(grid, start, end, opts) {
    if (!grid || !grid.length) return invalid("weightedAstar");
    start = coord(start);
    end = coord(end);
    if (!inBounds(grid, start) || !inBounds(grid, end)) return invalid("weightedAstar");
    if (sameCell(start, end)) return trivial("weightedAstar", start);

    const o = searchOpts(start, end, opts);
    const weight = o.weight != null && typeof o.weight === "number" && o.weight > 0 ? o.weight : 1.5;
    const heap = createMinHeap();
    const gScore = new Map();
    const cameFrom = new Map();
    const closed = new Set();
    const visitedOrder = [];
    const startKey = key(start);
    gScore.set(startKey, 0);
    const h0 = heuristic(start, end, o);
    heap.push({ r: start.r, c: start.c, pri: weight * h0, tie: h0, g: 0 });
    let frontierPeak = 1;

    while (heap.size) {
      if (heap.size > frontierPeak) frontierPeak = heap.size;
      const cur = heap.pop();
      const id = key(cur);
      if (closed.has(id)) continue;
      const bestG = gScore.get(id);
      if (bestG !== undefined && cur.g > bestG) continue;
      closed.add(id);
      visitedOrder.push({ r: cur.r, c: cur.c });
      if (sameCell(cur, end)) {
        return finish("weightedAstar", grid, true, reconstructPath(cameFrom, end, start), visitedOrder, frontierPeak, {
          scores: buildScores(gScore, end, o, weight),
        });
      }
      const nbrs = neighbors(grid, cur.r, cur.c, o);
      for (let i = 0; i < nbrs.length; i++) {
        const n = nbrs[i];
        const nid = key(n);
        if (closed.has(nid)) continue;
        const ng = cur.g + cellWeight(grid[n.r][n.c]);
        const prev = gScore.get(nid);
        if (prev === undefined || ng < prev) {
          gScore.set(nid, ng);
          cameFrom.set(nid, { r: cur.r, c: cur.c });
          const h = heuristic(n, end, o);
          heap.push({ r: n.r, c: n.c, pri: ng + weight * h, tie: h, g: ng });
        }
      }
    }
    return finish("weightedAstar", grid, false, [], visitedOrder, frontierPeak, {
      scores: buildScores(gScore, end, o, weight),
    });
  }

  function greedy(grid, start, end, opts) {
    if (!grid || !grid.length) return invalid("greedy");
    start = coord(start);
    end = coord(end);
    if (!inBounds(grid, start) || !inBounds(grid, end)) return invalid("greedy");
    if (sameCell(start, end)) return trivial("greedy", start);

    const o = searchOpts(start, end, opts);
    const heap = createMinHeap();
    const cameFrom = new Map();
    const seen = new Set([key(start)]);
    const visitedOrder = [];
    heap.push({ r: start.r, c: start.c, pri: heuristic(start, end, o) });
    let frontierPeak = 1;

    while (heap.size) {
      if (heap.size > frontierPeak) frontierPeak = heap.size;
      const cur = heap.pop();
      visitedOrder.push({ r: cur.r, c: cur.c });
      if (sameCell(cur, end)) {
        return finish("greedy", grid, true, reconstructPath(cameFrom, end, start), visitedOrder, frontierPeak);
      }
      const nbrs = neighbors(grid, cur.r, cur.c, o);
      for (let i = 0; i < nbrs.length; i++) {
        const n = nbrs[i];
        const nid = key(n);
        if (seen.has(nid)) continue;
        seen.add(nid);
        cameFrom.set(nid, { r: cur.r, c: cur.c });
        heap.push({ r: n.r, c: n.c, pri: heuristic(n, end, o) });
      }
    }
    return finish("greedy", grid, false, [], visitedOrder, frontierPeak);
  }

  function bidirectionalBfs(grid, start, end, opts) {
    if (!grid || !grid.length) return invalid("bidirectionalBfs");
    start = coord(start);
    end = coord(end);
    if (!inBounds(grid, start) || !inBounds(grid, end)) return invalid("bidirectionalBfs");
    if (sameCell(start, end)) return trivial("bidirectionalBfs", start);

    const o = searchOpts(start, end, opts);
    const qS = [coord(start)];
    const qE = [coord(end)];
    const parentS = new Map();
    const parentE = new Map();
    parentS.set(key(start), null);
    parentE.set(key(end), null);
    const visitedOrder = [];
    let frontierPeak = 2;

    function joinPath(meet) {
      const left = reconstructPath(parentS, meet, start);
      const right = [];
      let cur = lookupParent(parentE, key(meet));
      const guard = new Set([key(meet)]);
      while (cur) {
        const id = key(cur);
        if (guard.has(id)) break;
        guard.add(id);
        right.push({ r: cur.r, c: cur.c });
        if (sameCell(cur, end)) break;
        cur = lookupParent(parentE, id);
      }
      return left.concat(right);
    }

    function expand(queue, parentsThis, parentsOther) {
      const layer = queue.length;
      for (let i = 0; i < layer; i++) {
        const cur = queue.shift();
        visitedOrder.push(cur);
        if (parentsOther.has(key(cur)) && !sameCell(cur, start) && !sameCell(cur, end)) {
          return cur;
        }
        const nbrs = neighbors(grid, cur.r, cur.c, o);
        for (let j = 0; j < nbrs.length; j++) {
          const n = nbrs[j];
          const id = key(n);
          if (parentsThis.has(id)) continue;
          parentsThis.set(id, cur);
          if (parentsOther.has(id)) {
            visitedOrder.push(n);
            return n;
          }
          queue.push(n);
        }
      }
      return null;
    }

    // Adjacent start/end: expand one layer from start first.
    while (qS.length && qE.length) {
      frontierPeak = Math.max(frontierPeak, qS.length + qE.length);
      const meetS = expand(qS, parentS, parentE);
      if (meetS) {
        return finish("bidirectionalBfs", grid, true, joinPath(meetS), visitedOrder, frontierPeak);
      }
      frontierPeak = Math.max(frontierPeak, qS.length + qE.length);
      const meetE = expand(qE, parentE, parentS);
      if (meetE) {
        return finish("bidirectionalBfs", grid, true, joinPath(meetE), visitedOrder, frontierPeak);
      }
    }
    return finish("bidirectionalBfs", grid, false, [], visitedOrder, frontierPeak);
  }

  const IDA_MAX_EXPANSIONS = 20000;

  function idaStar(grid, start, end, opts) {
    if (!grid || !grid.length) return invalid("idaStar");
    start = coord(start);
    end = coord(end);
    if (!inBounds(grid, start) || !inBounds(grid, end)) return invalid("idaStar");
    if (sameCell(start, end)) return trivial("idaStar", start);

    const o = searchOpts(start, end, opts);
    const visitedOrder = [];
    let expansions = 0;
    let frontierPeak = 1;

    function searchBound(bound) {
      const stack = [{ r: start.r, c: start.c, g: 0, nbrIndex: -1, nbrs: null }];
      const pathSet = new Set([key(start)]);
      const cameFrom = new Map();
      let minOverflow = Infinity;

      while (stack.length) {
        if (stack.length > frontierPeak) frontierPeak = stack.length;
        const frame = stack[stack.length - 1];
        const id = key(frame);

        if (frame.nbrIndex < 0) {
          expansions++;
          if (expansions > IDA_MAX_EXPANSIONS) return { status: "cap" };
          visitedOrder.push({ r: frame.r, c: frame.c });
          const f = frame.g + heuristic(frame, end, o);
          if (f > bound) {
            if (f < minOverflow) minOverflow = f;
            stack.pop();
            pathSet.delete(id);
            continue;
          }
          if (sameCell(frame, end)) return { status: "found", cameFrom };
          frame.nbrs = neighbors(grid, frame.r, frame.c, o);
          frame.nbrIndex = 0;
        }

        if (frame.nbrIndex >= frame.nbrs.length) {
          stack.pop();
          pathSet.delete(id);
          continue;
        }

        const n = frame.nbrs[frame.nbrIndex++];
        const nid = key(n);
        if (pathSet.has(nid)) continue;
        pathSet.add(nid);
        cameFrom.set(nid, { r: frame.r, c: frame.c });
        stack.push({
          r: n.r,
          c: n.c,
          g: frame.g + cellWeight(grid[n.r][n.c]),
          nbrIndex: -1,
          nbrs: null,
        });
      }

      if (minOverflow === Infinity) return { status: "fail" };
      return { status: "overflow", bound: minOverflow };
    }

    let bound = heuristic(start, end, o);
    while (expansions <= IDA_MAX_EXPANSIONS) {
      const res = searchBound(bound);
      if (res.status === "found") {
        return finish("idaStar", grid, true, reconstructPath(res.cameFrom, end, start), visitedOrder, frontierPeak);
      }
      if (res.status === "fail" || res.status === "cap") {
        return finish("idaStar", grid, false, [], visitedOrder, frontierPeak);
      }
      bound = res.bound;
    }
    return finish("idaStar", grid, false, [], visitedOrder, frontierPeak);
  }

  const SEARCH = {
    bfs,
    dfs,
    dijkstra,
    astar,
    greedy,
    bidirectionalBfs,
    weightedAstar,
    idaStar,
  };

  function search(algorithm, grid, start, end, opts) {
    const fn = SEARCH[algorithm];
    if (!fn) throw new Error("Unknown algorithm: " + algorithm);
    return fn(grid, start, end, opts);
  }

  function makeWallGrid(rows, cols) {
    const grid = makeGrid(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        grid[r][c].type = "wall";
        grid[r][c].weight = EMPTY_WEIGHT;
      }
    }
    return grid;
  }

  function stampStartEnd(grid, connectEvenCorner) {
    const rows = grid.length;
    const cols = grid[0].length;
    if (connectEvenCorner) {
      const er = (rows - 1) % 2 === 0 ? rows - 1 : rows - 2;
      const ec = (cols - 1) % 2 === 0 ? cols - 1 : cols - 2;
      const sr = 0;
      const sc = 0;
      grid[sr][sc].type = "empty";
      if (er >= 0 && ec >= 0) {
        for (let r = Math.max(0, er); r < rows; r++) {
          grid[r][Math.max(0, ec)].type = "empty";
        }
        for (let c = Math.max(0, ec); c < cols; c++) {
          grid[rows - 1][c].type = "empty";
        }
      }
    }
    grid[0][0].type = "start";
    grid[0][0].weight = EMPTY_WEIGHT;
    grid[rows - 1][cols - 1].type = "end";
    grid[rows - 1][cols - 1].weight = EMPTY_WEIGHT;
    return grid;
  }

  function twoStepNeighbors(r, c, rows, cols) {
    const out = [];
    const dirs = [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ];
    for (let i = 0; i < dirs.length; i++) {
      const nr = r + dirs[i][0];
      const nc = c + dirs[i][1];
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) out.push({ r: nr, c: nc, dr: dirs[i][0], dc: dirs[i][1] });
    }
    return out;
  }

  /**
   * Recursive backtracker (DFS maze). Returns a NEW grid.
   * Passages are carved on even/even cells (perfect maze on that lattice).
   * Start = top-left (0,0), end = bottom-right. Even dimensions get a
   * short corridor so the corner is reachable.
   */
  function mazeRecursiveBacktracker(rows, cols, rng) {
    rng = rngFn(rng);
    const grid = makeWallGrid(rows, cols);
    grid[0][0].type = "empty";
    const stack = [{ r: 0, c: 0 }];

    while (stack.length) {
      const cur = stack[stack.length - 1];
      const options = twoStepNeighbors(cur.r, cur.c, rows, cols).filter((n) => grid[n.r][n.c].type === "wall");
      if (!options.length) {
        stack.pop();
        continue;
      }
      const pick = options[randInt(rng, options.length)];
      const wr = cur.r + pick.dr / 2;
      const wc = cur.c + pick.dc / 2;
      grid[wr][wc].type = "empty";
      grid[pick.r][pick.c].type = "empty";
      stack.push({ r: pick.r, c: pick.c });
    }

    return stampStartEnd(grid, true);
  }

  /**
   * Simplified Prim maze. Returns a NEW grid. Start/end as above.
   */
  function mazePrim(rows, cols, rng) {
    rng = rngFn(rng);
    const grid = makeWallGrid(rows, cols);
    const inMaze = new Set();
    const frontier = [];
    const frontierSet = new Set();

    function addFrontier(r, c) {
      const opts = twoStepNeighbors(r, c, rows, cols);
      for (let i = 0; i < opts.length; i++) {
        const n = opts[i];
        const id = key(n);
        if (inMaze.has(id) || frontierSet.has(id)) continue;
        if (grid[n.r][n.c].type !== "wall") continue;
        frontierSet.add(id);
        frontier.push({ r: n.r, c: n.c });
      }
    }

    grid[0][0].type = "empty";
    inMaze.add("0,0");
    addFrontier(0, 0);

    while (frontier.length) {
      const idx = randInt(rng, frontier.length);
      const cell = frontier.splice(idx, 1)[0];
      frontierSet.delete(key(cell));
      const carved = twoStepNeighbors(cell.r, cell.c, rows, cols).filter((n) => inMaze.has(key(n)));
      if (!carved.length) continue;
      const from = carved[randInt(rng, carved.length)];
      const wr = (cell.r + from.r) / 2;
      const wc = (cell.c + from.c) / 2;
      grid[wr][wc].type = "empty";
      grid[cell.r][cell.c].type = "empty";
      inMaze.add(key(cell));
      addFrontier(cell.r, cell.c);
    }

    return stampStartEnd(grid, true);
  }

  /**
   * Recursive division. Returns a NEW empty grid with added walls.
   * One gap per dividing wall keeps the open cells connected.
   */
  function mazeRecursiveDivision(rows, cols, rng) {
    rng = rngFn(rng);
    const grid = makeGrid(rows, cols);

    function divide(r, c, h, w) {
      if (h < 3 || w < 3) return;
      const horizontal = h > w || (h === w && rng() >= 0.5);

      if (horizontal) {
        const wr = r + 1 + randInt(rng, h - 2);
        const gap = c + randInt(rng, w);
        for (let x = c; x < c + w; x++) {
          if (x !== gap) {
            grid[wr][x].type = "wall";
            grid[wr][x].weight = EMPTY_WEIGHT;
          }
        }
        divide(r, c, wr - r, w);
        divide(wr + 1, c, r + h - wr - 1, w);
      } else {
        const wc = c + 1 + randInt(rng, w - 2);
        const gap = r + randInt(rng, h);
        for (let y = r; y < r + h; y++) {
          if (y !== gap) {
            grid[y][wc].type = "wall";
            grid[y][wc].weight = EMPTY_WEIGHT;
          }
        }
        divide(r, c, h, wc - c);
        divide(r, wc + 1, h, c + w - wc - 1);
      }
    }

    divide(0, 0, rows, cols);
    return stampStartEnd(grid, false);
  }

  /**
   * Binary-tree maze (south/east bias). Returns a NEW grid.
   */
  function mazeBinaryTree(rows, cols, rng) {
    rng = rngFn(rng);
    const grid = makeWallGrid(rows, cols);

    for (let r = 0; r < rows; r += 2) {
      for (let c = 0; c < cols; c += 2) {
        grid[r][c].type = "empty";
        const opts = [];
        if (r + 2 < rows) opts.push([2, 0]);
        if (c + 2 < cols) opts.push([0, 2]);
        if (!opts.length) continue;
        const pick = opts[randInt(rng, opts.length)];
        const nr = r + pick[0];
        const nc = c + pick[1];
        grid[r + pick[0] / 2][c + pick[1] / 2].type = "empty";
        grid[nr][nc].type = "empty";
      }
    }

    return stampStartEnd(grid, true);
  }

  /**
   * Randomized Kruskal maze. Union-find on even/even cells; knock walls
   * between disjoint components. Returns a NEW grid. Even dimensions get
   * the same corner corridor as the other carved mazes.
   */
  function mazeKruskal(rows, cols, rng) {
    rng = rngFn(rng);
    const grid = makeWallGrid(rows, cols);
    const parent = [];
    const rank = [];

    function idx(r, c) {
      return r * cols + c;
    }

    function find(x) {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }

    function union(a, b) {
      a = find(a);
      b = find(b);
      if (a === b) return false;
      if (rank[a] < rank[b]) parent[a] = b;
      else if (rank[a] > rank[b]) parent[b] = a;
      else {
        parent[b] = a;
        rank[a]++;
      }
      return true;
    }

    const edges = [];
    for (let r = 0; r < rows; r += 2) {
      for (let c = 0; c < cols; c += 2) {
        grid[r][c].type = "empty";
        const id = idx(r, c);
        parent[id] = id;
        rank[id] = 0;
        if (c + 2 < cols) edges.push([r, c, r, c + 2, r, c + 1]);
        if (r + 2 < rows) edges.push([r, c, r + 2, c, r + 1, c]);
      }
    }

    for (let i = edges.length - 1; i > 0; i--) {
      const j = randInt(rng, i + 1);
      const t = edges[i];
      edges[i] = edges[j];
      edges[j] = t;
    }

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (union(idx(e[0], e[1]), idx(e[2], e[3]))) {
        grid[e[4]][e[5]].type = "empty";
      }
    }

    return stampStartEnd(grid, true);
  }

  /**
   * Random walls. Returns a NEW grid. Start/end stay free.
   * density is the probability each other cell becomes a wall (default 0.3).
   */
  function scatterWalls(rows, cols, density, rng) {
    rng = rngFn(rng);
    if (density == null || typeof density !== "number" || Number.isNaN(density)) density = 0.3;
    if (density < 0) density = 0;
    if (density > 1) density = 1;
    const grid = makeGrid(rows, cols);
    const lastR = rows - 1;
    const lastC = cols - 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r === 0 && c === 0) || (r === lastR && c === lastC)) continue;
        if (rng() < density) {
          grid[r][c].type = "wall";
          grid[r][c].weight = EMPTY_WEIGHT;
        }
      }
    }
    return stampStartEnd(grid, false);
  }

  function findCell(grid, type) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c].type === type) return { r, c };
      }
    }
    return null;
  }

  const MAP_TYPE_CHARS = { ".": true, "#": true, "5": true };
  const MAX_MAP_DIM = 80;

  function mapToken(type) {
    if (type === "wall") return "#";
    if (type === "weight") return "5";
    return ".";
  }

  function rleEncodeTokens(tokens) {
    let out = "";
    let i = 0;
    while (i < tokens.length) {
      const ch = tokens[i];
      let n = 1;
      while (i + n < tokens.length && tokens[i + n] === ch) n++;
      if (n > 1) out += String(n);
      out += ch;
      i += n;
    }
    return out;
  }

  /**
   * Expand RLE of `.` empty, `#` wall, `5` weight. Optional decimal counts.
   * `5` is both a digit and a type, so parses with expected length + backtracking.
   */
  function expandMapRle(rle, expected) {
    if (typeof rle !== "string" || expected < 0) return null;
    const n = rle.length;
    const out = [];
    const fail = new Set();

    function tryRun(count, type, nextI, rec) {
      if (count < 1 || out.length + count > expected) return false;
      if (nextI > n) return false;
      for (let k = 0; k < count; k++) out.push(type);
      if (rec(nextI)) return true;
      out.length -= count;
      return false;
    }

    function rec(i) {
      if (out.length === expected) return i === n;
      if (i >= n) return false;
      const key = i + "," + out.length;
      if (fail.has(key)) return false;

      const ch = rle[i];
      // `5` is both a count digit and a weight token — try a single type first
      // so `5.#55.` (5 empty, wall, 1 weight, 5 empty) does not become 5 weights.
      if (MAP_TYPE_CHARS[ch]) {
        if (tryRun(1, ch, i + 1, rec)) return true;
      }

      if (ch >= "0" && ch <= "9") {
        let val = 0;
        for (let j = i; j < n; j++) {
          const d = rle[j];
          if (d < "0" || d > "9") break;
          val = val * 10 + (d.charCodeAt(0) - 48);
          if (val > expected - out.length) break;
          const t = rle[j + 1];
          if (t && MAP_TYPE_CHARS[t] && val >= 1) {
            if (tryRun(val, t, j + 2, rec)) return true;
          }
        }
      }

      fail.add(key);
      return false;
    }

    if (!rec(0)) return null;
    return out;
  }

  /**
   * Compact share string: `rows x cols;sr,sc;er,ec;rle`
   * RLE alphabet: `.` empty, `#` wall, `5` weight. Does not mutate grid.
   */
  function encodeMap(grid, start, end) {
    if (!grid || !grid.length || !grid[0] || !grid[0].length) {
      throw new Error("invalid grid");
    }
    if (!start || !end || typeof start.r !== "number" || typeof end.r !== "number") {
      throw new Error("invalid terminals");
    }
    const rows = grid.length;
    const cols = grid[0].length;
    let tokens = "";
    for (let r = 0; r < rows; r++) {
      const row = grid[r];
      if (!row || row.length !== cols) throw new Error("ragged grid");
      for (let c = 0; c < cols; c++) {
        tokens += mapToken(row[c] && row[c].type);
      }
    }
    return (
      rows +
      "x" +
      cols +
      ";" +
      start.r +
      "," +
      start.c +
      ";" +
      end.r +
      "," +
      end.c +
      ";" +
      rleEncodeTokens(tokens)
    );
  }

  /**
   * Inverse of encodeMap. Invalid input returns null.
   */
  function decodeMap(str) {
    if (typeof str !== "string") return null;
    const match = /^(\d+)x(\d+);(\d+),(\d+);(\d+),(\d+);(.*)$/.exec(str.trim());
    if (!match) return null;
    const rows = Number(match[1]);
    const cols = Number(match[2]);
    const sr = Number(match[3]);
    const sc = Number(match[4]);
    const er = Number(match[5]);
    const ec = Number(match[6]);
    const rle = match[7];
    if (!Number.isInteger(rows) || !Number.isInteger(cols)) return null;
    if (rows < 1 || cols < 1 || rows > MAX_MAP_DIM || cols > MAX_MAP_DIM) return null;
    if (sr < 0 || sc < 0 || sr >= rows || sc >= cols) return null;
    if (er < 0 || ec < 0 || er >= rows || ec >= cols) return null;
    const tokens = expandMapRle(rle, rows * cols);
    if (!tokens) return null;

    const grid = makeGrid(rows, cols);
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tokens[k++];
        if (t === "#") setCell(grid, r, c, { type: "wall", weight: EMPTY_WEIGHT });
        else if (t === "5") setCell(grid, r, c, { type: "weight" });
        else setCell(grid, r, c, { type: "empty", weight: EMPTY_WEIGHT });
      }
    }
    setCell(grid, sr, sc, { type: "start", weight: EMPTY_WEIGHT });
    setCell(grid, er, ec, { type: "end", weight: EMPTY_WEIGHT });
    return { grid, start: { r: sr, c: sc }, end: { r: er, c: ec } };
  }

  const api = {
    EMPTY_WEIGHT,
    WEIGHT_CELL,
    makeGrid,
    cloneGrid,
    setCell,
    neighbors,
    heuristic,
    reconstructPath,
    cellWeight,
    findCell,
    encodeMap,
    decodeMap,
    bfs,
    dfs,
    dijkstra,
    astar,
    greedy,
    bidirectionalBfs,
    weightedAstar,
    idaStar,
    search,
    mazeRecursiveBacktracker,
    mazePrim,
    mazeRecursiveDivision,
    mazeBinaryTree,
    mazeKruskal,
    scatterWalls,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PathCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
