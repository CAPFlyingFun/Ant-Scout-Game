/* ============================================================
   render.js — everything drawn to the canvas
   ============================================================ */

const rgbStr = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;

function lightAt(cx, cy) {
  if (cy < surfaceRow) return 1;                       // daylight above ground
  if (!seen[idx(cx, cy)]) return 0;                    // never seen -> black
  const dx = (cx + 0.5) * CELL - ant.x, dy = (cy + 0.5) * CELL - ant.y;
  const d = Math.hypot(dx, dy) / (CELL * 6.2);
  if (d <= 1) return Math.max(0.32, 1 - d * 0.7);      // in lantern range
  return 0.15;                                         // fog memory
}

function drawSky(surfScreenY) {
  if (surfScreenY <= 0) return;
  const s = weather.sky;
  const sg = ctx.createLinearGradient(0, 0, 0, Math.max(1, surfScreenY));
  sg.addColorStop(0, rgbStr(s.top)); sg.addColorStop(1, rgbStr(s.bot));
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, surfScreenY);

  const sunX = W * 0.8, sunY = surfScreenY * 0.34;
  if (weather.isDay) {
    if (sunY > 0) {
      const gl = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 95);
      const a = weather.storm ? 0.28 : (weather.precipType !== 'none' || weather.fog ? 0.45 : 0.85);
      gl.addColorStop(0, `rgba(255,247,214,${a})`); gl.addColorStop(1, 'rgba(255,247,214,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(sunX, sunY, 95, 0, 7); ctx.fill();
    }
  } else {
    // stars (only where sky is dark) + a moon
    for (let i = 0; i < 40; i++) {
      const sx = hash01(i * 2.1) * W, sy = hash01(i * 3.7) * surfScreenY;
      if (sy > surfScreenY - 6) continue;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i));
      ctx.fillStyle = `rgba(255,255,255,${0.5 * tw})`; ctx.fillRect(sx | 0, sy | 0, 2, 2);
    }
    if (sunY > 0) {
      const mg = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 40);
      mg.addColorStop(0, 'rgba(235,240,255,.9)'); mg.addColorStop(1, 'rgba(235,240,255,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(sunX, sunY, 40, 0, 7); ctx.fill();
      ctx.fillStyle = '#eef2ff'; ctx.beginPath(); ctx.arc(sunX, sunY, 13, 0, 7); ctx.fill();
      ctx.fillStyle = rgbStr(s.top); ctx.beginPath(); ctx.arc(sunX + 5, sunY - 3, 11, 0, 7); ctx.fill();
    }
  }
}

function drawPrecip(surfScreenY) {
  if (surfScreenY <= 4) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, surfScreenY); ctx.clip();
  if (weather.precipType === 'rain') {
    const lean = wind.strength * 0.5;
    ctx.strokeStyle = 'rgba(190,205,225,.5)'; ctx.lineWidth = 1.3;
    for (const d of weather.rain) {
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - lean, d.y + d.len); ctx.stroke();
    }
  } else if (weather.precipType === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const f of weather.snow) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); }
  }
  ctx.restore();
  if (weather.fog) { ctx.fillStyle = 'rgba(200,204,206,.28)'; ctx.fillRect(0, 0, W, surfScreenY + 20); }
}

function drawGrass(gsy) {
  if (!(gsy > -160 && gsy < H + 20)) return;
  // soil lip + earthy shadow where grass meets ground
  ctx.fillStyle = '#4b6b2f'; ctx.fillRect(0, gsy - 2, W, 4);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, gsy + 2, W, 5);

  const blade = (sx, h, lean, w, col) => {
    const tipX = sx + lean, tipY = gsy - h, cx = sx + lean * 0.55, cy = gsy - h * 0.55;
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.5, gsy);
    ctx.quadraticCurveTo(cx - w * 0.25, cy, tipX, tipY);
    ctx.quadraticCurveTo(cx + w * 0.25, cy, sx + w * 0.5, gsy);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };

  // two passes: distant/darker behind, near/brighter (and much taller) in front
  const layers = [
    { spacing: 10, hMin: 40, hMax: 88,  w: 5.0, amp: 1.2, cols: ['#356e2f', '#3d7d34', '#2f6a2c'] },
    { spacing: 7,  hMin: 62, hMax: 130, w: 6.5, amp: 1.0, cols: ['#5ab054', '#69c163', '#4ea24a', '#7fce6a'] },
  ];
  const wx0 = cam.x - W / 2 - 40, wx1 = cam.x + W / 2 + 40;
  for (const Lr of layers) {
    const i0 = Math.floor(wx0 / Lr.spacing), i1 = Math.ceil(wx1 / Lr.spacing);
    for (let i = i0; i <= i1; i++) {
      const wx = i * Lr.spacing, sx = w2sX(wx);
      const r = hash01(i + Lr.spacing * 13.7);
      const h = Lr.hMin + r * (Lr.hMax - Lr.hMin);
      const phase = r * 6.28, baseLean = (hash01(i * 3.1) - 0.5) * 9;
      const hf = h / 85;
      const sway = (Math.sin(wind.phase + wx * 0.017 + phase) * wind.strength
                  + Math.sin(wind.phase * 2.6 + phase) * 1.3) * Lr.amp * hf;
      const col = Lr.cols[((i % Lr.cols.length) + Lr.cols.length) % Lr.cols.length];
      blade(sx, h, baseLean + sway, Lr.w, col);
      if (r > 0.93) { ctx.fillStyle = '#d9d67a'; ctx.beginPath(); ctx.ellipse(sx + baseLean + sway, gsy - h, 2, 4, 0, 0, 7); ctx.fill(); }
    }
  }
}

// The underground scene's full world render (called by UndergroundScene.draw).
// Shared chrome (flash, HUD, action button) is layered on top by the shared
// draw() in scenes.js.
function drawUnderground() {
  ctx.fillStyle = '#0a0808'; ctx.fillRect(0, 0, W, H);          // dark base for underground

  const surfScreenY = w2sY(surfaceRow * CELL);
  drawSky(surfScreenY);

  // visible cell range
  const cx0 = Math.max(0, cellOfX(cam.x - W / 2 - CELL));
  const cx1 = Math.min(COLS - 1, cellOfX(cam.x + W / 2 + CELL));
  const cy0 = Math.max(0, cellOfY(cam.y - H / 2 - CELL));
  const cy1 = Math.min(ROWS - 1, cellOfY(cam.y + H / 2 + CELL));

  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const L = lightAt(cx, cy);
      if (L <= 0) continue;
      if (cy < surfaceRow) continue;                            // sky handled above
      const sx = w2sX(cx * CELL), sy = w2sY(cy * CELL);
      const solid = grid[idx(cx, cy)] === 1;
      if (solid) {
        const depth = (cy - surfaceRow) / (ROWS - surfaceRow);
        const h = (cx * 92821 ^ cy * 53987) & 255, gr = (h / 255 - 0.5) * 8;
        const base = (58 - depth * 24) * L + (1 - L) * 8;
        ctx.fillStyle = `hsl(${30 - depth * 8},${40 - depth * 8}%,${clamp(base + gr, 4, 80)}%)`;
        traceCell(cx, cy, true); ctx.fill();                      // beveled dirt tile (smooth corners)
        if (!isSolid(cx, cy - 1) && grid[idx(cx, cy - 1)] === 0) { ctx.fillStyle = `rgba(0,0,0,${0.28 * L})`; ctx.fillRect(sx, sy, CELL + 1, 3); }
        if (h > 235) { ctx.fillStyle = `hsl(26,26%,${clamp(base - 16, 3, 60)}%)`; ctx.fillRect(sx + CELL * 0.3, sy + CELL * 0.3, 4, 4); }
      } else {
        const floor = 12 * L + (1 - L) * 4;
        ctx.fillStyle = `hsl(28,24%,${clamp(floor, 3, 26)}%)`;
        ctx.fillRect(sx, sy, CELL + 1, CELL + 1);
      }
    }
  }

  const gsy = w2sY(surfaceRow * CELL);
  drawGrass(gsy);
  drawPrecip(surfScreenY);
  drawAnthill(gsy);      // soil mound + entrance hole around the shaft (in front of grass, behind the ant)
  drawHome();

  // NEST safe-zone glow — subtle warm pulse so the player learns where they recover
  if (scene && scene.isSafeZone && scene.isSafeZone()) {
    const hx = w2sX(home.x), hy = w2sY(home.y), rad = SURVIVAL.nestRadius * CELL;
    const pulse = 0.10 + 0.05 * Math.sin(t * 2.2);
    const ng = ctx.createRadialGradient(hx, hy, 6, hx, hy, rad);
    ng.addColorStop(0, `rgba(255,210,140,${pulse})`); ng.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(hx, hy, rad, 0, 7); ctx.fill();
  }

  // pebbles
  for (const p of pebbles) {
    if (p.buried) continue;
    const cy = cellOfY(p.y), cx = cellOfX(p.x);
    if (!p.carried && lightAt(cx, cy) <= 0.05) continue;
    const sx = w2sX(p.x), sy = w2sY(p.y) + (p.carried ? 0 : Math.sin(t * 3 + p.bob) * 1.5);
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
    ctx.fillStyle = '#b9a68c'; ctx.beginPath(); ctx.ellipse(sx, sy, 6, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(sx - 1.6, sy - 1.6, 2, 1.6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(60,44,26,.5)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // treasure gem
  if (treasure.found || treasure.home) {
    const cy = cellOfY(treasure.y), cx = cellOfX(treasure.x);
    const vis = treasure.carried || treasure.home || lightAt(cx, cy) > 0.05;
    if (vis) drawGem(w2sX(treasure.x), w2sY(treasure.y));
  } else {
    const cx = cellOfX(treasure.x), cy = cellOfY(treasure.y);
    if (seen[idx(cx, cy)]) {
      const sx = w2sX(treasure.x), sy = w2sY(treasure.y);
      ctx.fillStyle = `rgba(120,230,255,${0.06 + 0.05 * Math.sin(t * 3)})`; ctx.beginPath(); ctx.arc(sx, sy, 10, 0, 7); ctx.fill();
    }
  }

  // dig target highlight + progress
  if (digTarget) {
    const sx = w2sX((digTarget.cx + 0.5) * CELL), sy = w2sY((digTarget.cy + 0.5) * CELL);
    ctx.strokeStyle = 'rgba(255,240,180,.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(w2sX(digTarget.cx * CELL) + 1, w2sY(digTarget.cy * CELL) + 1, CELL - 1, CELL - 1);
    if (digProgress > 0) { ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, CELL * 0.32, -Math.PI / 2, -Math.PI / 2 + digProgress * Math.PI * 2); ctx.stroke(); }
  }

  // dust, dirt particles
  for (const p of dust) { const sx = w2sX(p.x), sy = w2sY(p.y); ctx.globalAlpha = Math.min(1, p.life / 12); ctx.fillStyle = 'rgba(150,120,80,.5)'; ctx.fillRect(sx | 0, sy | 0, p.s, p.s); }
  ctx.globalAlpha = 1;
  for (const p of parts) { const sx = w2sX(p.x), sy = w2sY(p.y); ctx.globalAlpha = Math.min(1, p.life / 14); ctx.fillStyle = p.col; ctx.fillRect(sx | 0, sy | 0, p.s, p.s); }
  ctx.globalAlpha = 1;

  drawAnt();

  for (const p of sparks) { const sx = w2sX(p.x), sy = w2sY(p.y); ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillStyle = p.col; ctx.fillRect(sx | 0, sy | 0, 2, 2); }
  ctx.globalAlpha = 1;

  // lantern warmth over the ant (underground only)
  if (cellOfY(ant.y) >= surfaceRow) {
    const asx = w2sX(ant.x), asy = w2sY(ant.y);
    const lg = ctx.createRadialGradient(asx, asy, 4, asx, asy, CELL * 6.2);
    lg.addColorStop(0, 'rgba(255,214,150,.16)'); lg.addColorStop(0.6, 'rgba(255,190,120,.05)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(asx, asy, CELL * 6.2, 0, 7); ctx.fill();
  }

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// Anthill mound around the underground entrance: a soil dome rising above the
// grass line with a dark doorway hole in the middle where the ant emerges.
// Drawn in front of the grass and behind the ant, at the surface entrance only.
function drawAnthill(gsy) {
  if (gsy < -160 || gsy > H + 60) return;                 // only near the surface
  const cx = w2sX(home.x);
  const HW = 90, PH = 60;                                   // half-width, peak height above the ground line
  const baseY = gsy + 3, peakY = gsy - PH;

  const domePath = () => {
    ctx.beginPath();
    ctx.moveTo(cx - HW, baseY);
    ctx.bezierCurveTo(cx - HW * 0.62, baseY, cx - HW * 0.5, peakY, cx, peakY);
    ctx.bezierCurveTo(cx + HW * 0.5, peakY, cx + HW * 0.62, baseY, cx + HW, baseY);
    ctx.closePath();
  };

  // soil fill (vertical gradient: sunlit crown -> shadowed base)
  domePath();
  const g = ctx.createLinearGradient(0, peakY, 0, baseY);
  g.addColorStop(0, '#c1904f'); g.addColorStop(0.55, '#95693a'); g.addColorStop(1, '#63431f');
  ctx.fillStyle = g; ctx.fill();

  // grainy loose-soil speckles (clipped to the mound)
  ctx.save(); domePath(); ctx.clip();
  for (let i = 0; i < 40; i++) {
    const rx = cx + (hash01(i * 2.31 + 1) - 0.5) * HW * 1.9;
    const ry = baseY - hash01(i * 3.77 + 2) * PH;
    const d = hash01(i * 5.13 + 4);
    ctx.fillStyle = d < 0.5 ? `rgba(58,38,20,${0.16 + d * 0.28})` : `rgba(215,175,115,${0.10 + d * 0.14})`;
    ctx.fillRect(rx | 0, ry | 0, 3, 3);
  }
  ctx.restore();

  // rim highlight along the sunlit left shoulder
  ctx.strokeStyle = 'rgba(255,228,170,.16)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - HW * 0.72, baseY - PH * 0.3);
  ctx.bezierCurveTo(cx - HW * 0.45, peakY + 6, cx - HW * 0.2, peakY, cx, peakY);
  ctx.stroke();

  // entrance hole in the middle — a rounded doorway that opens toward the top
  const holeW = 25, holeTop = peakY + 13;
  ctx.fillStyle = '#080605';
  ctx.beginPath();
  ctx.moveTo(cx - holeW, baseY + 3);
  ctx.bezierCurveTo(cx - holeW, holeTop + 8, cx - holeW * 0.5, holeTop, cx, holeTop);
  ctx.bezierCurveTo(cx + holeW * 0.5, holeTop, cx + holeW, holeTop + 8, cx + holeW, baseY + 3);
  ctx.closePath();
  ctx.fill();
  // inner shadow for depth
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.beginPath();
  ctx.ellipse(cx, holeTop + (baseY - holeTop) * 0.55, holeW * 0.62, (baseY - holeTop) * 0.4, 0, 0, 7);
  ctx.fill();
  // lit rim around the hole mouth
  ctx.strokeStyle = 'rgba(190,150,95,.5)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - holeW, baseY + 3);
  ctx.bezierCurveTo(cx - holeW, holeTop + 8, cx - holeW * 0.5, holeTop, cx, holeTop);
  ctx.bezierCurveTo(cx + holeW * 0.5, holeTop, cx + holeW, holeTop + 8, cx + holeW, baseY + 3);
  ctx.stroke();
}

function drawHome() {
  const sx = w2sX(home.x), sy = w2sY(home.y);
  if (sx < -40 || sx > W + 40) return;
  ctx.strokeStyle = '#7a4a1f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - CELL * 0.9, sy - 2); ctx.lineTo(sx - CELL * 0.9, sy - 20); ctx.stroke();
  ctx.fillStyle = ant.hasGem ? '#5fe0ff' : '#ffcf4a';
  ctx.beginPath(); ctx.moveTo(sx - CELL * 0.9, sy - 20); ctx.lineTo(sx - CELL * 0.9 + 11, sy - 16.5); ctx.lineTo(sx - CELL * 0.9, sy - 13); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(40,26,14,.55)'; ctx.fillRect(sx - 2, sy, CELL * 2 + 4, 3);
}

function drawGem(sx, sy) {
  const tw = 0.5 + 0.5 * Math.sin(treasure.pulse * 4);
  ctx.save(); ctx.translate(sx, sy);
  ctx.fillStyle = `rgba(150,235,255,${0.16 + 0.16 * tw})`; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
  ctx.fillStyle = '#5fe0ff'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, -1.5); ctx.lineTo(0, 10); ctx.lineTo(-8, -1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c7f6ff'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(3.5, -2); ctx.lineTo(0, 1.5); ctx.lineTo(-3.5, -2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2aa8d0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, -1.5); ctx.lineTo(0, 10); ctx.lineTo(-8, -1.5); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.6 * tw})`; ctx.fillRect(-2, -4, 2, 2);
  ctx.restore();
}

function drawAnt() {
  const sx = w2sX(ant.x), sy = w2sY(ant.y);
  const s = ant.r * 1.5;
  const blink = ant.invuln > 0 && (Math.floor(t * 20) % 2 === 0);   // flicker during i-frames
  ctx.globalAlpha = blink ? 0.4 : 1;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(ant.angle);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(0, 2, s * 1.05, s * 0.7, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#241109'; ctx.lineWidth = Math.max(1.4, s * 0.13); ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const baseX = i * s * 0.42, ph = ant.legT + i * 1.5;
    const swing = Math.sin(ph) * s * 0.30, swing2 = Math.cos(ph) * s * 0.30;
    ctx.beginPath(); ctx.moveTo(baseX, 0); ctx.lineTo(baseX + swing, -s * 0.95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(baseX, 0); ctx.lineTo(baseX - swing2, s * 0.95); ctx.stroke();
  }
  const col = '#c9542f', colDk = '#9c3f22';
  ctx.fillStyle = colDk; ctx.beginPath(); ctx.ellipse(-s * 0.62, 0, s * 0.62, s * 0.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col;  ctx.beginPath(); ctx.ellipse(-s * 0.62, 0, s * 0.5, s * 0.4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = colDk; ctx.beginPath(); ctx.ellipse(-s * 0.05, 0, s * 0.32, s * 0.28, 0, 0, 7); ctx.fill();
  ctx.fillStyle = col;  ctx.beginPath(); ctx.ellipse(s * 0.5, 0, s * 0.36, s * 0.32, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(s * 0.55, -s * 0.12, s * 0.09, s * 0.07, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#241109'; ctx.lineWidth = Math.max(1, s * 0.09);
  const aw = Math.sin(ant.legT * 0.8) * 0.15;
  ctx.beginPath(); ctx.moveTo(s * 0.7, -s * 0.16); ctx.lineTo(s * 1.15, -s * 0.5 + aw * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.7, s * 0.16); ctx.lineTo(s * 1.15, s * 0.5 - aw * s); ctx.stroke();
  if (digTarget) {
    const m = Math.abs(Math.sin(t * 22)) * s * 0.16; ctx.lineWidth = Math.max(1.4, s * 0.12);
    ctx.beginPath(); ctx.moveTo(s * 0.82, -s * 0.14); ctx.lineTo(s * 1.05, -s * 0.05 - m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.82, s * 0.14); ctx.lineTo(s * 1.05, s * 0.05 + m); ctx.stroke();
  }
  if (ant.hitFlash > 0) {                                            // white flash when hit
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(-s * 0.2, 0, s * 0.9, s * 0.6, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
  if (ant.carry) {
    const bx = sx - Math.cos(ant.angle) * s * 0.7, by = sy - Math.sin(ant.angle) * s * 0.7 + Math.sin(t * 6) * 1;
    if (ant.carry === treasure) drawGem(bx, by - 2);
    else { ctx.fillStyle = '#b9a68c'; ctx.beginPath(); ctx.ellipse(bx, by - 3, 6, 5, 0, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(60,44,26,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  ctx.globalAlpha = 1;   // clear the i-frame blink alpha
}

// ---------- on-screen controls ----------
function drawUI() {
  ui = uiLayout();
  const bx = joy.active ? joy.baseX : joyRest.x, by = joy.active ? joy.baseY : joyRest.y;
  ctx.globalAlpha = joy.active ? 0.9 : 0.5;
  ctx.fillStyle = 'rgba(20,16,12,.35)'; ctx.beginPath(); ctx.arc(bx, by, joy.R, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,220,.35)'; ctx.lineWidth = 2; ctx.stroke();
  const kx = joy.active ? joy.kx : bx, ky = joy.active ? joy.ky : by;
  ctx.fillStyle = 'rgba(255,236,210,.85)'; ctx.beginPath(); ctx.arc(kx, ky, joy.R * 0.42, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;

  // Primary action button: DIG underground, BITE on the surface (combat).
  if (scene && (scene.canDig || scene.canBite)) {
    const bite = !scene.canDig && scene.canBite;
    const auto = scene.canDig && autoDig;                     // locked-on auto-dig (double-tap)
    const target = bite && enemyTargetable(scene.enemies);   // a spider is in bite range + arc
    ctx.globalAlpha = (input.dig || auto) ? 1 : 0.72;
    ctx.fillStyle = auto ? 'rgba(80,190,80,.92)'
                  : target ? 'rgba(220,60,50,.95)'
                  : bite ? 'rgba(150,60,50,.62)'
                  : (input.dig ? 'rgba(240,180,60,.9)' : 'rgba(60,42,20,.5)');
    ctx.beginPath(); ctx.arc(ui.digX, ui.digY, ui.digR, 0, 7); ctx.fill();
    ctx.strokeStyle = auto ? 'rgba(210,255,210,.75)' : target ? 'rgba(255,210,200,.85)' : 'rgba(255,240,200,.5)';
    ctx.lineWidth = (auto || target) ? 3 : 2; ctx.stroke();
    const label = auto ? 'AUTO' : bite ? (target ? '⚔️' : 'BITE') : 'DIG';
    ctx.fillStyle = auto ? '#08240a' : bite ? '#fff' : (input.dig ? '#4a2c00' : '#ffdf9a');
    ctx.font = `800 ${Math.round(ui.digR * (label.length > 3 ? 0.32 : 0.42))}px -apple-system,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, ui.digX, ui.digY);

    // GRAB only in dig scenes (carrying pebbles / the gem)
    if (scene.canDig) {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = ant.carry ? 'rgba(90,200,255,.5)' : 'rgba(40,50,60,.5)';
      ctx.beginPath(); ctx.arc(ui.carryX, ui.carryY, ui.carryR, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,255,.45)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#dff0ff'; ctx.font = `700 ${Math.round(ui.carryR * 0.34)}px -apple-system,sans-serif`;
      ctx.fillText(ant.carry ? 'DROP' : 'GRAB', ui.carryX, ui.carryY);
    }
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// Shared transient message banner (weather notices, offline notes, win text).
function drawBanner() {
  if (banner && banner.t > 0) {
    banner.t -= 1 / 60;
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = Math.min(1, banner.t * 2);
    ctx.font = '700 18px -apple-system,sans-serif';
    const bw = ctx.measureText(banner.text).width + 34;
    const by = 128 + safeTop;    // below the stacked top-left HUD so it never overlaps
    ctx.fillStyle = 'rgba(12,10,8,.72)'; roundRect((W - bw) / 2, by, bw, 38, 10); ctx.fill();
    ctx.fillStyle = '#fff4d6'; ctx.textAlign = 'center'; ctx.fillText(banner.text, W / 2, by + 25); ctx.textAlign = 'start';
    ctx.globalAlpha = 1;
    if (banner.t <= 0 && banner.text.indexOf('home') < 0) banner = null;
  }
}

function drawWeatherChip() {
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
  let label;
  if (weather.status === 'ok') {
    label = wmoIcon(weather.code, weather.isDay) + ' ' + (weather.tempF != null ? weather.tempF + '°F · ' : '') + weather.label + (weather.place ? ' · ' + weather.place : '');
  } else if (weather.status === 'loading') {
    label = '⏳ Getting weather…';
  } else {
    label = '🌤️ Tap for live weather';
  }
  ctx.font = '700 13px -apple-system,sans-serif';
  const w = Math.min(W - 20, ctx.measureText(label).width + 20);
  const x = 10 + safeLeft, y = safeTop + 90, h = 26;   // row 3, below the objective pill
  ctx.fillStyle = 'rgba(10,8,6,.5)'; roundRect(x, y, w, h, 8); ctx.fill();
  ctx.fillStyle = '#cfe6ff'; ctx.fillText(label, x + 10, y + 18);
  weather.chip = { x, y, w, h };
}

let _depthUnused = 0;
function drawDepthMeter() {
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
  const cur = depthMM();
  const label = '⛏ ' + fmtDepth(cur);
  ctx.font = '800 16px -apple-system,sans-serif';
  const tw = ctx.measureText(label).width;
  const pw = tw + 26, ph = 32, px = W - pw - 10 - safeRight, py = 10 + safeTop;
  ctx.fillStyle = 'rgba(10,8,6,.55)'; roundRect(px, py, pw, ph, 9); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,160,.25)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#ffe1a6'; ctx.fillText(label, px + 13, py + 21);
  ctx.font = '600 9px -apple-system,sans-serif'; ctx.fillStyle = 'rgba(255,225,166,.5)';
  ctx.fillText('tap', px + pw - 19, py + ph - 4);
  depthPill = { x: px, y: py, w: pw, h: ph };

  const gx = W - 7 - safeRight, gTop = py + ph + 12, gBot = H * 0.55;
  if (gBot > gTop + 20) {
    const maxD = (ROWS - surfaceRow) * MM_PER_CELL;
    ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(gx - 2, gTop, 4, gBot - gTop);
    const frac = clamp(cur / maxD, 0, 1);
    const cy = gTop + frac * (gBot - gTop);
    const mfrac = clamp(maxDepthMM / maxD, 0, 1);
    const my = gTop + mfrac * (gBot - gTop);
    ctx.fillStyle = 'rgba(255,210,120,.35)'; ctx.fillRect(gx - 5, my - 1, 10, 2);
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(gx, cy, 4, 0, 7); ctx.fill();
  }
}

function drawIntro() {
  ctx.globalAlpha = intro;
  ctx.fillStyle = 'rgba(6,5,4,.6)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9c8'; ctx.font = '800 30px -apple-system,sans-serif';
  ctx.fillText('🐜 Ant Scout', W / 2, H * 0.4);
  ctx.fillStyle = '#cdbfa8'; ctx.font = '600 15px -apple-system,sans-serif';
  ctx.fillText('Dig into the earth. Find the buried gem.', W / 2, H * 0.4 + 30);
  ctx.fillText('Joystick to move · hold DIG · GRAB to carry', W / 2, H * 0.4 + 54);
  ctx.textAlign = 'start'; ctx.globalAlpha = 1;
}

function drawWin() {
  ctx.fillStyle = 'rgba(6,10,14,.62)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fe9ff'; ctx.font = '800 32px -apple-system,sans-serif';
  ctx.fillText('🏆 Treasure Home!', W / 2, H * 0.42);
  ctx.fillStyle = '#e7f6ff'; ctx.font = '600 16px -apple-system,sans-serif';
  ctx.fillText('You scouted the cavern and hauled the gem back.', W / 2, H * 0.42 + 34);
  ctx.fillStyle = '#ffd23a'; ctx.font = '700 15px -apple-system,sans-serif';
  ctx.fillText('Deepest dig: ' + fmtDepth(maxDepthMM), W / 2, H * 0.42 + 58);
  const bw = 190, bh = 48, bx = (W - bw) / 2, by = H * 0.42 + 80;
  ctx.fillStyle = 'rgba(255,220,120,.92)'; roundRect(bx, by, bw, bh, 12); ctx.fill();
  ctx.fillStyle = '#4a2c00'; ctx.font = '800 18px -apple-system,sans-serif'; ctx.fillText('Play again', W / 2, by + 30);
  ctx.textAlign = 'start';
  winBtn = { bx, by, bw, bh };
}
