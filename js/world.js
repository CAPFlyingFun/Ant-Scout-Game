/* ============================================================
   world.js — depth readout, world generation, reset
   ============================================================ */

// how far below the surface the ant currently is, in millimetres (0 at/above ground)
function depthMM() { return Math.max(0, (ant.y / CELL - surfaceRow)) * MM_PER_CELL; }

function fmtDepth(mm) {
  const u = UNITS[unitIx];
  const v = mm * UNIT_FACTOR[u];
  return v.toFixed(UNIT_DECIMALS[u]) + ' ' + u;
}

function carveDisc(ccx, ccy, rx, ry) {
  for (let cy = Math.floor(ccy - ry); cy <= Math.ceil(ccy + ry); cy++)
    for (let cx = Math.floor(ccx - rx); cx <= Math.ceil(ccx + rx); cx++) {
      if (!inBounds(cx, cy) || cy < surfaceRow) continue;
      const e = ((cx - ccx) / rx) ** 2 + ((cy - ccy) / ry) ** 2;
      if (e <= 1) grid[idx(cx, cy)] = 0;
    }
}

function genWorld() {
  grid = new Uint8Array(COLS * ROWS);
  hp   = new Float32Array(COLS * ROWS).fill(1);
  seen = new Uint8Array(COLS * ROWS);
  for (let cy = surfaceRow; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) grid[idx(cx, cy)] = 1;

  // entrance shaft near the middle
  const entCol = (COLS / 2) | 0;
  for (let cy = surfaceRow; cy < surfaceRow + 4; cy++) { grid[idx(entCol, cy)] = 0; grid[idx(entCol + 1, cy)] = 0; }
  home = { cx: entCol, cy: surfaceRow, x: (entCol + 0.5) * CELL, y: (surfaceRow - 0.4) * CELL };

  // hidden cavern deep down, offset to a side so you must tunnel to it
  const cavCol = 14 + ((Math.random() * (COLS - 28)) | 0);
  const cavRow = Math.floor(ROWS * 0.34) + ((Math.random() * ROWS * 0.16) | 0);  // ~40-59 deep
  carveDisc(cavCol, cavRow, 5.5, 4);
  carveDisc(cavCol - 7, cavRow - 3, 2.4, 2);
  carveDisc(cavCol + 6, cavRow + 3, 2.2, 1.8);
  treasure = { x: (cavCol + 0.5) * CELL, y: (cavRow + 0.5) * CELL, found: false, carried: false, home: false, pulse: 0 };

  // scattered pebbles: some on the surface, some shallow-buried to reward first digs
  pebbles = [];
  for (let i = 0; i < 7; i++) {
    const cx = 6 + ((Math.random() * (COLS - 12)) | 0);
    const surf = Math.random() < 0.5;
    const cy = surf ? surfaceRow - 1 : surfaceRow + 2 + ((Math.random() * 8) | 0);
    pebbles.push({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL, cx, cy, carried: false, buried: !surf, bob: Math.random() * 6 });
  }
}

// (resetGame removed — the scene manager owns fresh-start logic now:
//  UndergroundScene.build() generates the world, .enter() places the ant, and
//  newGame() in scenes.js resets shared flags/particles.)
