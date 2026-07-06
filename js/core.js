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
}

// grid queries
const inBounds = (cx, cy) => cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS;
const isSolid  = (cx, cy) => (!inBounds(cx, cy) ? true : grid[idx(cx, cy)] === 1);
const cellOfX  = px => Math.floor(px / CELL);
const cellOfY  = py => Math.floor(py / CELL);

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
