"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const PathCore = require("../pathfinding-core.js");

function cell(type, weight) {
  const w =
    weight != null ? weight : type === "weight" ? 5 : 1;
  return { type, weight: w };
}

function parseGrid(lines) {
  const rows = lines.map((line) => line.trim()).filter(Boolean);
  const grid = [];
  let start = null;
  let end = null;
  for (let r = 0; r < rows.length; r++) {
    const row = [];
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === "S") {
        row.push(cell("start", 1));
        start = { r, c };
      } else if (ch === "E") {
        row.push(cell("end", 1));
        end = { r, c };
      } else if (ch === "#") {
        row.push(cell("wall", 1));
      } else if (ch === "5") {
        row.push(cell("weight", 5));
      } else if (ch === "9") {
        row.push(cell("weight", 9));
      } else {
        row.push(cell("empty", 1));
      }
    }
    grid.push(row);
  }
  return { grid, start, end };
}

function snapshot(grid) {
  return JSON.stringify(grid);
}

function isWalkable(grid, r, c, start, end) {
  if (start && r === start.r && c === start.c) return true;
  if (end && r === end.r && c === end.c) return true;
  return grid[r][c].type !== "wall";
}

function assertValidPath(grid, result, start, end, diagonal) {
  assert.equal(result.found, true);
  assert.ok(result.path.length >= 1, "path should include at least start");
  assert.equal(result.path[0].r, start.r);
  assert.equal(result.path[0].c, start.c);
  const last = result.path[result.path.length - 1];
  assert.equal(last.r, end.r);
  assert.equal(last.c, end.c);
  for (let i = 1; i < result.path.length; i++) {
    const a = result.path[i - 1];
    const b = result.path[i];
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    if (diagonal) {
      assert.ok(dr <= 1 && dc <= 1 && dr + dc > 0, `non-adjacent step ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    } else {
      assert.equal(dr + dc, 1, `non-adjacent 4-dir step ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    }
    assert.ok(isWalkable(grid, b.r, b.c, start, end), `path walks a wall at ${b.r},${b.c}`);
  }
}

function rngFrom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function countType(grid, type) {
  let n = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.type === type) n++;
    }
  }
  return n;
}

test("BFS finds the shortest unweighted path around a wall", () => {
  const { grid, start, end } = parseGrid([
    "S.#.E",
    "..#..",
    ".....",
  ]);
  const result = PathCore.bfs(grid, start, end);
  assertValidPath(grid, result, start, end, false);
  // Shortest 4-dir path is 6 steps (7 cells): right,down,down,right,right,up,up
  // S(0,0) -> (0,1) -> (1,1) -> (2,1) -> (2,2) -> (2,3) -> (1,3) -> (0,3) -> E(0,4)
  // That's 8 cells / 7 steps. Alternate: (0,0)-(1,0)-(2,0)-(2,1)-(2,2)-(2,3)-(2,4)-(1,4)-(0,4) is 9.
  // Best: (0,0)-(0,1)-(1,1)-(1,0) no that's worse.
  // (0,0)-(0,1)-(1,1)-(2,1)-(2,2)-(2,3)-(1,3)-(0,3)-(0,4) = 9 cells, 8 steps.
  // (0,0)-(0,1)-(1,1)-(2,1)-(2,2)-(2,3)-(2,4)-(1,4)-(0,4) = 9 cells.
  // (0,0)-(1,0)-(1,1)-(2,1)-(2,2)-(2,3)-(1,3)-(0,3)-(0,4) = 9.
  // Actually (0,0)-(0,1)-(1,1)-(2,1)-(2,2)-(2,3)-(1,3)-(0,4)? (1,3) to (0,4) is diagonal.
  // 4-dir minimum around the wall column at c=2 from (0,0) to (0,4):
  // Must go to row 1 or 2 to pass c=2. 
  // (0,0)-(0,1)-(1,1)-(1,2)-(1,3)-(0,3)-(0,4) = 7 cells, 6 steps. Wall is only at (0,2), (1,2) is empty!
  // Grid: row1 is "..#.." so (1,2) is wall too. Row2 is open.
  // (0,0)-(0,1)-(1,1)-(2,1)-(2,2)-(2,3)-(1,3)-(0,3)-(0,4) = 9 cells.
  // (0,0)-(1,0)-(2,0)-(2,1)-(2,2)-(2,3)-(2,4)-(1,4)-(0,4) = 9 cells.
  // (0,0)-(0,1)-(1,1)-(2,1)-(2,2)-(2,3)-(2,4)-(1,4)-(0,4) = 9 cells.
  // So shortest length is 9 cells (8 steps).
  assert.equal(result.path.length, 9);
  assert.equal(result.algorithm, "bfs");
  assert.ok(result.nodesExpanded >= result.path.length - 1);
});

test("Dijkstra prefers a lower-weight corridor over a short expensive one", () => {
  const { grid, start, end } = parseGrid([
    "S55E",
    "....",
  ]);
  const cheap = PathCore.dijkstra(grid, start, end);
  assertValidPath(grid, cheap, start, end, false);
  assert.ok(
    cheap.path.some((p) => p.r === 1),
    "Dijkstra should detour through the cheap row"
  );
  assert.ok(
    !cheap.path.some((p) => p.r === 0 && (p.c === 1 || p.c === 2)),
    "Dijkstra should not walk the expensive weights"
  );
  // Cheap path: S-(1,0)-(1,1)-(1,2)-(1,3)-E = weights 1+1+1+1 + end 1 = 5
  assert.equal(cheap.pathCost, 5);

  const unweighted = PathCore.bfs(grid, start, end);
  assertValidPath(grid, unweighted, start, end, false);
  assert.equal(unweighted.path.length, 4, "BFS should take the short 3-step route");
  assert.ok(unweighted.pathCost > cheap.pathCost);
});

test("A* finds a path when one exists", () => {
  const { grid, start, end } = parseGrid([
    "S..#..",
    "##.#..",
    "...#E.",
    ".##...",
    "......",
  ]);
  const result = PathCore.astar(grid, start, end);
  assertValidPath(grid, result, start, end, false);
  assert.equal(result.algorithm, "astar");
  assert.ok(result.pathCost > 0);
});

test("A* fails when start is boxed in by walls", () => {
  const { grid, start, end } = parseGrid([
    "S#.",
    "##.",
    "..E",
  ]);
  const result = PathCore.astar(grid, start, end);
  assert.equal(result.found, false);
  assert.deepEqual(result.path, []);
  assert.equal(result.pathCost, 0);
});

test("DFS finds some path if one exists (not necessarily shortest)", () => {
  const { grid, start, end } = parseGrid([
    "S.#.E",
    "..#..",
    ".....",
  ]);
  const result = PathCore.dfs(grid, start, end);
  assertValidPath(grid, result, start, end, false);
  assert.equal(result.algorithm, "dfs");
  const bfs = PathCore.bfs(grid, start, end);
  assert.ok(result.path.length >= bfs.path.length);
});

test("Bidirectional BFS finds a path", () => {
  const { grid, start, end } = parseGrid([
    "S.#.E",
    "..#..",
    ".....",
  ]);
  const result = PathCore.bidirectionalBfs(grid, start, end);
  assertValidPath(grid, result, start, end, false);
  assert.equal(result.algorithm, "bidirectionalBfs");
  const bfs = PathCore.bfs(grid, start, end);
  assert.equal(result.path.length, bfs.path.length, "bidirectional BFS should match BFS length on unweighted grids");
});

test("Unreachable end returns found=false and path=[]", () => {
  const { grid, start, end } = parseGrid([
    "S.#E",
    "..#.",
    "..#.",
  ]);
  for (const name of [
    "bfs",
    "dfs",
    "dijkstra",
    "astar",
    "greedy",
    "bidirectionalBfs",
    "weightedAstar",
    "idaStar",
  ]) {
    const result = PathCore[name](grid, start, end);
    assert.equal(result.found, false, name);
    assert.deepEqual(result.path, [], name);
    assert.equal(result.pathCost, 0, name);
  }
});

test("Search algorithms do not mutate the original grid", () => {
  const { grid, start, end } = parseGrid([
    "S.5#E",
    ".#...",
    "..#..",
  ]);
  const before = snapshot(grid);
  PathCore.bfs(grid, start, end);
  PathCore.dfs(grid, start, end);
  PathCore.dijkstra(grid, start, end);
  PathCore.astar(grid, start, end);
  PathCore.greedy(grid, start, end);
  PathCore.bidirectionalBfs(grid, start, end);
  PathCore.weightedAstar(grid, start, end);
  PathCore.idaStar(grid, start, end);
  PathCore.astar(grid, start, end, { diagonal: true });
  assert.equal(snapshot(grid), before);
});

test("Greedy best-first finds a path when one exists", () => {
  const { grid, start, end } = parseGrid([
    "S....",
    ".###.",
    "....E",
  ]);
  const result = PathCore.greedy(grid, start, end);
  assertValidPath(grid, result, start, end, false);
});

test("makeGrid / cloneGrid / setCell helpers", () => {
  const grid = PathCore.makeGrid(3, 4);
  assert.equal(grid.length, 3);
  assert.equal(grid[0].length, 4);
  assert.equal(grid[1][2].type, "empty");
  assert.equal(grid[1][2].weight, 1);

  PathCore.setCell(grid, 1, 2, { type: "weight" });
  assert.equal(grid[1][2].type, "weight");
  assert.equal(grid[1][2].weight, 5);

  const copy = PathCore.cloneGrid(grid);
  copy[0][0].type = "wall";
  assert.equal(grid[0][0].type, "empty");
});

test("heuristic is manhattan, or euclidean when diagonal", () => {
  const a = { r: 0, c: 0 };
  const b = { r: 3, c: 4 };
  assert.equal(PathCore.heuristic(a, b), 7);
  assert.equal(PathCore.heuristic(a, b, { diagonal: true }), 5);
});

test("neighbors skip walls and stay in bounds", () => {
  const { grid } = parseGrid([
    ".#.",
    "S.E",
    "###",
  ]);
  const n = PathCore.neighbors(grid, 1, 1);
  const keys = n.map((p) => p.r + "," + p.c).sort();
  assert.deepEqual(keys, ["1,0", "1,2"]);
});

function assertMazeShape(grid, rows, cols) {
  assert.equal(grid.length, rows);
  assert.equal(grid[0].length, cols);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  assert.ok(start, "maze should mark start");
  assert.ok(end, "maze should mark end");
  assert.notEqual(grid[start.r][start.c].type, "wall");
  assert.notEqual(grid[end.r][end.c].type, "wall");
  assert.ok(countType(grid, "wall") > 0, "maze should contain walls");
}

test("mazeRecursiveBacktracker: shape, terminals, and BFS can reach end", () => {
  const grid = PathCore.mazeRecursiveBacktracker(15, 21, rngFrom(42));
  assertMazeShape(grid, 15, 21);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  const result = PathCore.bfs(grid, start, end);
  assertValidPath(grid, result, start, end, false);
});

test("mazeRecursiveBacktracker works on even dimensions", () => {
  const grid = PathCore.mazeRecursiveBacktracker(10, 12, rngFrom(7));
  assertMazeShape(grid, 10, 12);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  const result = PathCore.bfs(grid, start, end);
  assert.equal(result.found, true, "even-size backtracker maze should be solvable");
  assertValidPath(grid, result, start, end, false);
});

test("mazePrim: shape and terminals", () => {
  const grid = PathCore.mazePrim(11, 15, rngFrom(99));
  assertMazeShape(grid, 11, 15);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  assert.equal(PathCore.bfs(grid, start, end).found, true);
});

test("mazeRecursiveDivision: shape and terminals", () => {
  const grid = PathCore.mazeRecursiveDivision(16, 20, rngFrom(3));
  assertMazeShape(grid, 16, 20);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  assert.equal(PathCore.bfs(grid, start, end).found, true);
});

test("mazeBinaryTree: shape and terminals", () => {
  const grid = PathCore.mazeBinaryTree(13, 13, rngFrom(5));
  assertMazeShape(grid, 13, 13);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  assert.equal(PathCore.bfs(grid, start, end).found, true);
});

test("scatterWalls: start/end free, some walls, dimensions match", () => {
  const grid = PathCore.scatterWalls(12, 18, 0.4, rngFrom(11));
  assertMazeShape(grid, 12, 18);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  assert.equal(start.r, 0);
  assert.equal(start.c, 0);
  assert.equal(end.r, 11);
  assert.equal(end.c, 17);
});

function openGrid(rows, cols) {
  const grid = PathCore.makeGrid(rows, cols);
  const start = { r: 0, c: 0 };
  const end = { r: rows - 1, c: cols - 1 };
  grid[start.r][start.c].type = "start";
  grid[end.r][end.c].type = "end";
  return { grid, start, end };
}

test("weightedAstar finds a path on an open grid", () => {
  const { grid, start, end } = openGrid(8, 10);
  const before = snapshot(grid);
  const result = PathCore.weightedAstar(grid, start, end);
  assertValidPath(grid, result, start, end, false);
  assert.equal(result.algorithm, "weightedAstar");
  assert.ok(result.pathCost > 0);
  const viaSearch = PathCore.search("weightedAstar", grid, start, end);
  assert.equal(viaSearch.found, true);
  assert.equal(snapshot(grid), before);
});

test("idaStar finds a path on an open grid", () => {
  const { grid, start, end } = openGrid(8, 10);
  const before = snapshot(grid);
  const result = PathCore.idaStar(grid, start, end);
  assertValidPath(grid, result, start, end, false);
  assert.equal(result.algorithm, "idaStar");
  assert.ok(result.pathCost > 0);
  assert.equal(snapshot(grid), before);
});

test("mazeKruskal: start/end walkable and BFS can reach end", () => {
  const grid = PathCore.mazeKruskal(15, 21, rngFrom(42));
  assertMazeShape(grid, 15, 21);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  assert.notEqual(grid[start.r][start.c].type, "wall");
  assert.notEqual(grid[end.r][end.c].type, "wall");
  const result = PathCore.bfs(grid, start, end);
  assertValidPath(grid, result, start, end, false);
});

test("mazeKruskal works on even dimensions", () => {
  const grid = PathCore.mazeKruskal(10, 12, rngFrom(7));
  assertMazeShape(grid, 10, 12);
  const start = PathCore.findCell(grid, "start");
  const end = PathCore.findCell(grid, "end");
  const result = PathCore.bfs(grid, start, end);
  assert.equal(result.found, true, "even-size Kruskal maze should be solvable");
  assertValidPath(grid, result, start, end, false);
});

test("maze generators do not mutate a source grid", () => {
  const source = PathCore.makeGrid(11, 13);
  PathCore.setCell(source, 3, 4, { type: "wall" });
  const before = snapshot(source);
  PathCore.mazeRecursiveBacktracker(11, 13, rngFrom(1));
  PathCore.mazePrim(11, 13, rngFrom(2));
  PathCore.mazeRecursiveDivision(11, 13, rngFrom(3));
  PathCore.mazeBinaryTree(11, 13, rngFrom(4));
  PathCore.mazeKruskal(11, 13, rngFrom(5));
  PathCore.scatterWalls(11, 13, 0.3, rngFrom(6));
  assert.equal(snapshot(source), before);
});

test("reconstructPath follows a parent map", () => {
  const cameFrom = new Map();
  cameFrom.set("0,1", { r: 0, c: 0 });
  cameFrom.set("0,2", { r: 0, c: 1 });
  const path = PathCore.reconstructPath(cameFrom, { r: 0, c: 2 }, { r: 0, c: 0 });
  assert.deepEqual(path, [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
  ]);
});
