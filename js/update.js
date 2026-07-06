/* ============================================================
   update.js — per-frame simulation
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

function tryCarry() {
  if (ant.carry) {                                  // drop
    const dx = Math.cos(ant.angle), dy = Math.sin(ant.angle);
    ant.carry.carried = false; ant.carry.x = ant.x + dx * CELL * 0.6; ant.carry.y = ant.y + dy * CELL * 0.6;
    if (ant.carry === treasure) ant.hasGem = false;
    ant.carry = null;
    return;
  }
  let best = null, bestD = CELL * 1.3;               // pick up nearest pebble (or the found gem)
  for (const p of pebbles) { if (p.carried || p.buried) continue; const d = Math.hypot(p.x - ant.x, p.y - ant.y); if (d < bestD) { bestD = d; best = p; } }
  if (treasure.found && !treasure.carried && !treasure.home) { const d = Math.hypot(treasure.x - ant.x, treasure.y - ant.y); if (d < CELL * 1.4 && d < bestD) best = treasure; }
  if (best) { best.carried = true; ant.carry = best; if (best === treasure) ant.hasGem = true; }
}

function update(dt) {
  t += dt;

  // input: dig is recomputed each frame from held pointers
  input.dig = false;
  for (const [id, role] of pointers) { if (role === 'dig') input.dig = true; }
  readKeyboard();

  if (won) { decayFx(); updateWind(dt); updateWeather(dt); updateCamera(); return; }
  if (intro > 0) intro = Math.max(0, intro - dt * 0.6);

  // movement
  const mv = Math.hypot(input.moveX, input.moveY);
  if (mv > 0.08) {
    const mx = input.moveX / (mv || 1), my = input.moveY / (mv || 1);
    const throttle = Math.min(1, mv);
    ant.vx += mx * MOVE.accel * throttle;
    ant.vy += my * MOVE.accel * throttle;
    // turn toward the input direction gradually (shortest arc) rather than snapping
    const target = Math.atan2(input.moveY, input.moveX);
    let d = target - ant.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    ant.angle += d * MOVE.turn;
  }
  ant.vx *= MOVE.friction; ant.vy *= MOVE.friction;
  let sp = Math.hypot(ant.vx, ant.vy);
  const maxSpd = MOVE.maxSpd * (ant.carry ? 0.78 : 1);
  if (sp > maxSpd) { ant.vx = ant.vx / sp * maxSpd; ant.vy = ant.vy / sp * maxSpd; sp = maxSpd; }
  ant.x += ant.vx; ant.y += ant.vy;
  ant.x = clamp(ant.x, ant.r, WORLD_W - ant.r);
  ant.y = clamp(ant.y, ant.r, WORLD_H - ant.r);
  resolveCollision();
  maxDepthMM = Math.max(maxDepthMM, depthMM());

  // leg animation + footstep dust on the surface
  ant.legT += sp * 0.09 + 0.02;
  if (sp > 1.2 && Math.random() < 0.18 && cellOfY(ant.y) <= surfaceRow) footDust(ant.x + (Math.random() * 8 - 4), ant.y + 6);

  // carry (edge-triggered)
  if (input.carryEdge) { tryCarry(); input.carryEdge = false; }

  // dig the cell ahead of the ant
  const fx = Math.cos(ant.angle), fy = Math.sin(ant.angle);
  const tcx = cellOfX(ant.x + fx * (ant.r + CELL * DIG.reach));
  const tcy = cellOfY(ant.y + fy * (ant.r + CELL * DIG.reach));
  if (input.dig && isSolid(tcx, tcy) && inBounds(tcx, tcy) && tcy >= surfaceRow) {
    if (!digTarget || digTarget.cx !== tcx || digTarget.cy !== tcy) digTarget = { cx: tcx, cy: tcy };
    const id = idx(tcx, tcy);
    hp[id] -= DIG.rate * (60 * dt);
    digProgress = 1 - Math.max(0, hp[id]);
    if (Math.random() < 0.5) {
      const cxp = (tcx + 0.5) * CELL, cyp = (tcy + 0.5) * CELL;
      dust.push({ x: cxp + (Math.random() * CELL - CELL / 2), y: cyp + (Math.random() * CELL - CELL / 2), vx: -fx * 1.5 + (Math.random() - 0.5), vy: -fy * 1.5 - 0.5, life: 12 + Math.random() * 8, s: 2 });
    }
    if (hp[id] <= 0) {
      grid[id] = 0; digProgress = 0; digTarget = null;
      burstDirt((tcx + 0.5) * CELL, (tcy + 0.5) * CELL);
      for (const p of pebbles) { if (p.buried && p.cx === tcx && p.cy === tcy) p.buried = false; }
    }
  } else { digTarget = null; digProgress = 0; }

  // treasure discovery
  if (!treasure.found && Math.hypot(treasure.x - ant.x, treasure.y - ant.y) < CELL * 1.6) {
    treasure.found = true; burstSpark(treasure.x, treasure.y);
    banner = { text: '💎 Treasure found — carry it home!', t: 3.4 };
  }
  treasure.pulse += dt;

  // carried items follow the ant
  for (const p of pebbles) if (p.carried) { p.x = ant.x; p.y = ant.y; }
  if (treasure.carried) { treasure.x = ant.x; treasure.y = ant.y; }

  // win: bring the gem home (above ground, near the entrance)
  if (ant.carry === treasure && cellOfY(ant.y) < surfaceRow && Math.abs(ant.x - home.x) < CELL * 3) {
    won = true; treasure.home = true; treasure.carried = false; ant.carry = null; ant.hasGem = false;
    treasure.x = home.x; treasure.y = home.y + 6; burstSpark(home.x, home.y + 6);
    banner = { text: '🏆 You brought it home!', t: 999 };
  }

  // fog of war
  const acx = cellOfX(ant.x), acy = cellOfY(ant.y);
  const R = 6;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > R * R) continue;
    const cx = acx + dx, cy = acy + dy;
    if (inBounds(cx, cy)) seen[idx(cx, cy)] = 1;
  }

  decayFx();
  updateWind(dt);
  updateWeather(dt);
  updateCamera();
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
// instead of catching on them.
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

function resolveCollision() {
  const r = ant.r;
  for (let iter = 0; iter < 2; iter++) {
    const cx0 = cellOfX(ant.x - r), cx1 = cellOfX(ant.x + r), cy0 = cellOfY(ant.y - r), cy1 = cellOfY(ant.y + r);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (!inBounds(cx, cy) || !isSolid(cx, cy)) continue;   // world border handled by the clamp in update()
      resolveCirclePoly(cellShape(cx, cy), r);
    }
  }
}
