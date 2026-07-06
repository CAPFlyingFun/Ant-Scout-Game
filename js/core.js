/* ============================================================
   core.js — canvas, resize, grid helpers, camera, transforms
   ============================================================ */

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // Read all four safe-area insets (notch / status bar / home indicator) so the
  // canvas HUD dodges them in BOTH orientations (page uses viewport-fit=cover).
  // #safeprobe's padding is set to the env(safe-area-inset-*) values in CSS.
  const probe = document.getElementById('safeprobe');
  if (probe) {
    const cs = getComputedStyle(probe);
    safeTop    = parseFloat(cs.paddingTop)    || 0;
    safeLeft   = parseFloat(cs.paddingLeft)   || 0;
    safeRight  = parseFloat(cs.paddingRight)  || 0;
    safeBottom = parseFloat(cs.paddingBottom) || 0;
  }
}

// grid queries
const inBounds = (cx, cy) => cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS;
const isSolid  = (cx, cy) => (!inBounds(cx, cy) ? true : grid[idx(cx, cy)] === 1);
const cellOfX  = px => Math.floor(px / CELL);
const cellOfY  = py => Math.floor(py / CELL);

// Beveled outline of a solid cell (world coords). A convex corner — where the
// two orthogonally-adjacent cells are BOTH open — is chamfered so tunnels read
// as smooth diagonals instead of a blocky staircase. A single beveled corner
// cuts the square clean in half (a triangle); a cell with several open sides
// uses a half chamfer so the shape never degenerates. Straight walls stay
// square. Used by BOTH the renderer and the collision solver so look == feel.
function cellShape(cx, cy) {
  const x0 = cx * CELL, y0 = cy * CELL, x1 = x0 + CELL, y1 = y0 + CELL;
  const oL = !isSolid(cx - 1, cy), oR = !isSolid(cx + 1, cy);
  const oU = !isSolid(cx, cy - 1), oD = !isSolid(cx, cy + 1);
  const bTL = oL && oU, bTR = oR && oU, bBR = oR && oD, bBL = oL && oD;
  const b = (bTL + bTR + bBR + bBL) === 1 ? CELL : CELL * 0.5;   // full triangle vs half chamfer
  const p = [];
  const add = (x, y) => { const n = p.length; if (n === 0 || p[n - 1][0] !== x || p[n - 1][1] !== y) p.push([x, y]); };
  if (bTL) { add(x0, y0 + b); add(x0 + b, y0); } else add(x0, y0);   // top-left
  if (bTR) { add(x1 - b, y0); add(x1, y0 + b); } else add(x1, y0);   // top-right
  if (bBR) { add(x1, y1 - b); add(x1 - b, y1); } else add(x1, y1);   // bottom-right
  if (bBL) { add(x0 + b, y1); add(x0, y1 - b); } else add(x0, y1);   // bottom-left
  const n = p.length;
  if (n > 1 && p[0][0] === p[n - 1][0] && p[0][1] === p[n - 1][1]) p.pop();
  return p;
}

// Trace a cell's beveled outline as a canvas path in SCREEN space. `inflate`
// nudges each vertex out from the cell centre ~1px so neighbouring dirt tiles
// overlap and don't show hairline seams (matching the old CELL+1 fill trick).
function traceCell(cx, cy, inflate) {
  const ccx = (cx + 0.5) * CELL, ccy = (cy + 0.5) * CELL;
  const f = inflate ? (CELL + 1.0) / CELL : 1;
  const pts = cellShape(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const vx = ccx + (pts[i][0] - ccx) * f, vy = ccy + (pts[i][1] - ccy) * f;
    const X = w2sX(vx), Y = w2sY(vy);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.closePath();
}

// camera follow (leads slightly in the direction of travel; clamped to world)
function updateCamera() {
  const lead = 22;
  const tx = ant.x + ant.vx * lead;
  const ty = ant.y + ant.vy * lead;
  cam.x += (tx - cam.x) * 0.12;
  cam.y += (ty - cam.y) * 0.12;
  if (WORLD_W > W) cam.x = clamp(cam.x, W / 2, WORLD_W - W / 2);
  if (WORLD_H > H) cam.y = clamp(cam.y, H / 2, WORLD_H - H / 2);
}

// world -> screen (includes shake offset)
const w2sX = wx => wx - cam.x + W / 2 + shakeX;
const w2sY = wy => wy - cam.y + H / 2 + shakeY;

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
