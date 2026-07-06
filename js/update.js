/* ============================================================
   update.js — shared per-frame helpers: wind, particle spawners, particle
   decay, and the circle-vs-polygon collision solver. These are used by every
   scene. The shared update() loop lives in scenes.js; scene-specific sim lives
   in each scene_*.js file.
   ============================================================ */

// wind gusts AROUND the weather-driven baseline (wind.base)
function updateWind(dt) {
  wind.phase += dt * (1.0 + wind.base * 0.05);
  wind.gustT -= dt;
  if (wind.gustT <= 0) { wind.gustT = 2 + Math.random() * 3; wind.target = wind.base * (0.7 + Math.random() * 0.8); }
  wind.strength += (wind.target - wind.strength) * dt * 0.6;
}

function burstDirt(x, y) {
  const n = 10 + ((Math.random() * 6) | 0);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3.4;
    const df = clamp((y / CELL - surfaceRow) / (ROWS - surfaceRow), 0, 1);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, life: 26 + Math.random() * 20,
      s: 2 + Math.random() * 2.5, col: `hsl(${30 - df * 8},42%,${58 - df * 26 + (Math.random() * 10 - 5)}%)` });
  }
  shake = Math.min(9, shake + 5);
}

function burstSpark(x, y) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, sp = 0.7 + Math.random() * 3.4;
    sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.7, life: 34 + Math.random() * 36,
      col: Math.random() < 0.5 ? '#ffe680' : '#8fe9ff' });
  }
  shake = Math.min(11, shake + 7);
}

function footDust(x, y) {
  dust.push({ x, y, vx: (Math.random() - 0.5) * 0.5, vy: -0.2 - Math.random() * 0.4, life: 16 + Math.random() * 10, s: 2 + Math.random() * 2 });
}

function decayFx() {
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.vx *= 0.99; p.life--; if (p.life <= 0) parts.splice(i, 1); }
  for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life--; if (p.life <= 0) sparks.splice(i, 1); }
  for (let i = dust.length - 1; i >= 0; i--) { const p = dust[i]; p.x += p.vx; p.y += p.vy; p.life--; if (p.life <= 0) dust.splice(i, 1); }
  if (shake > 0) { shake *= 0.86; if (shake < 0.3) shake = 0; shakeX = (Math.random() - 0.5) * shake * 2; shakeY = (Math.random() - 0.5) * shake * 2; }
  else { shakeX = shakeY = 0; }
}

// Push the ant (a circle) out of one beveled cell polygon and kill the
// velocity that drove it into the surface — so it slides along diagonal walls
// instead of catching on them. Shared: used by the underground collision loop.
function resolveCirclePoly(poly, r) {
  const px = ant.x, py = ant.y, n = poly.length;
  if (n < 3) return;
  // nearest point on the polygon boundary
  let bestD2 = Infinity, bx = 0, by = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const L2 = ex * ex + ey * ey;
    let tt = L2 > 1e-9 ? ((px - a[0]) * ex + (py - a[1]) * ey) / L2 : 0;
    tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
    const qx = a[0] + ex * tt, qy = a[1] + ey * tt;
    const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d2 < bestD2) { bestD2 = d2; bx = qx; by = qy; }
  }
  // inside test: for a convex polygon every edge cross-product shares one sign
  let sign = 0, inside = true;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const cr = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    if (cr > 1e-9) { if (sign < 0) { inside = false; break; } sign = 1; }
    else if (cr < -1e-9) { if (sign > 0) { inside = false; break; } sign = -1; }
  }
  const dist = Math.sqrt(bestD2);
  if (inside) {
    // centre is inside — shove it out through the nearest wall by r
    let nx = bx - px, ny = by - py, nl = Math.hypot(nx, ny);
    if (nl < 1e-6) { nx = 0; ny = -1; nl = 1; }
    nx /= nl; ny /= nl;
    ant.x = bx + nx * r; ant.y = by + ny * r;
    const vn = ant.vx * nx + ant.vy * ny; if (vn < 0) { ant.vx -= vn * nx; ant.vy -= vn * ny; }
  } else if (dist < r) {
    let nx = px - bx, ny = py - by, nl = Math.hypot(nx, ny);
    if (nl < 1e-6) { nx = 0; ny = -1; nl = 1; }
    nx /= nl; ny /= nl;
    const push = r - dist;
    ant.x += nx * push; ant.y += ny * push;
    const vn = ant.vx * nx + ant.vy * ny; if (vn < 0) { ant.vx -= vn * nx; ant.vy -= vn * ny; }
  }
}
