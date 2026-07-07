/* ============================================================
   props.js — reusable collectible / item pipeline (theme-agnostic).
   Any scene can scatter an array of { x, y, kind, sub, taken, respawnT, bob }
   and run it through updateCollectibles() for proximity auto-collect + respawn,
   and drawItem() to render one. Phase 3 uses it for backyard food/water; future
   themes (Phase 6) and enemy pickups (Phase 4) reuse the same shape + loop.
   Loaded after the scene files' shared deps, before maps/surface_backyard.js.
   ============================================================ */

// proximity auto-collect + respawn timers. `onCollect(item)` does the effect
// (call addFood/addWater/etc.) and sets item.respawnT.
function updateCollectibles(items, dt, onCollect, radiusCells) {
  const r = (radiusCells || SURFACE_THEME.pickupRadius) * CELL;
  for (const it of items) {
    if (it.taken) { it.respawnT -= dt; if (it.respawnT <= 0) it.taken = false; continue; }
    if (Math.hypot(ant.x - it.x, ant.y - it.y) < r) { it.taken = true; onCollect(it); }
  }
}

// gentle pickup sparkle (no screen shake, unlike burstSpark)
function pickupSparkle(x, y, col) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * 6.28, sp = 0.5 + Math.random() * 2.2;
    sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.8, life: 22 + Math.random() * 20, col });
  }
}

// dispatcher: draw one collectible (bobbing). Add cases here for new item kinds.
function drawItem(it, sx, sy) {
  const y = sy + Math.sin(t * 3 + it.bob) * 2;
  if (it.kind === 'food') {
    if (it.sub === 'sugar') {                                                    // 🍬 the grand prize
      ctx.fillStyle = `rgba(255,255,255,${0.14 + 0.08 * Math.sin(t * 5 + it.bob)})`;
      ctx.beginPath(); ctx.arc(sx, y, 16, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(sx, y); ctx.rotate(0.2);
      ctx.fillStyle = '#f2efe6'; ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(-7, -7, 14, 4);
      ctx.strokeStyle = 'rgba(150,150,160,.6)'; ctx.lineWidth = 1; ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(t * 7 + it.bob)})`;
      ctx.fillRect(sx + 5, y - 9, 2, 2);
      return;
    }
    ctx.fillStyle = `rgba(255,210,120,${0.10 + 0.05 * Math.sin(t * 4 + it.bob)})`;
    ctx.beginPath(); ctx.arc(sx, y, 11, 0, 7); ctx.fill();                       // warm glow
    if (it.sub === 'crumb') {
      ctx.fillStyle = '#8a6a3c';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(sx + (hash01(it.bob + k) - 0.5) * 6, y + (hash01(it.bob + k + 2) - 0.5) * 6, 2.2, 0, 7); ctx.fill(); }
    } else if (it.sub === 'seed') {
      ctx.fillStyle = '#d8b874'; ctx.beginPath(); ctx.ellipse(sx, y, 5, 3.2, 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(sx - 1, y - 1, 1.5, 1, 0.5, 0, 7); ctx.fill();
    } else {                                                                     // leaf
      ctx.fillStyle = '#5fae4a'; ctx.beginPath(); ctx.ellipse(sx, y, 5.5, 3, -0.6, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(30,70,20,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 4, y + 2); ctx.lineTo(sx + 4, y - 2); ctx.stroke();
    }
  } else {                                                                        // water
    const big = it.sub === 'puddle';
    ctx.fillStyle = `rgba(120,200,255,${0.10 + 0.05 * Math.sin(t * 4 + it.bob)})`;
    ctx.beginPath(); ctx.arc(sx, y, big ? 26 : 11, 0, 7); ctx.fill();            // cool glow
    if (big) {
      ctx.fillStyle = 'rgba(70,150,210,.55)'; ctx.beginPath(); ctx.ellipse(sx, sy, 24, 13, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(150,210,255,.45)'; ctx.beginPath(); ctx.ellipse(sx - 5, sy - 3, 9, 4, 0, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#4aa8e0'; ctx.beginPath(); ctx.arc(sx, y, 5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(sx - 1.6, y - 1.6, 1.6, 0, 7); ctx.fill();
    }
  }
}

// ---------- shared surface-drawing helpers (used by backyard / park) ----------
// one decorative prop (tuft/rock/twig/flower); tuftCols = the theme's greens
function drawProp(p, sx, sy, tuftCols) {
  if (p.kind === 'tuft') {
    ctx.strokeStyle = tuftCols[(p.seed % tuftCols.length + tuftCols.length) % tuftCols.length]; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let b = -1; b <= 1; b++) { ctx.beginPath(); ctx.moveTo(sx + b * 3, sy + 3); ctx.lineTo(sx + b * 3 + Math.cos(p.rot + b * 0.6) * 3, sy + 3 - 11 * p.s); ctx.stroke(); }
  } else if (p.kind === 'rock') {
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(sx, sy + 3 * p.s, 9 * p.s, 4 * p.s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8b8a86'; ctx.beginPath(); ctx.ellipse(sx, sy, 8 * p.s, 6 * p.s, p.rot, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(sx - 2, sy - 2, 3 * p.s, 2 * p.s, p.rot, 0, 7); ctx.fill();
  } else if (p.kind === 'twig') {
    ctx.strokeStyle = '#6e4a28'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    const a = p.rot, len = 12 * p.s;
    ctx.beginPath(); ctx.moveTo(sx - Math.cos(a) * len, sy - Math.sin(a) * len); ctx.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a + 1) * len * 0.5, sy + Math.sin(a + 1) * len * 0.5); ctx.stroke();
  } else { // flower
    ctx.strokeStyle = '#4e8a3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, sy + 5); ctx.lineTo(sx, sy - 3); ctx.stroke();
    const petal = ['#e86a8a', '#e8c84a', '#c98ae0', '#ff9a5a'][(p.seed % 4 + 4) % 4];
    ctx.fillStyle = petal;
    for (let k = 0; k < 5; k++) { const a = p.rot + k * 1.256; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * 3, sy - 3 + Math.sin(a) * 3, 2.2, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#f5e28a'; ctx.beginPath(); ctx.arc(sx, sy - 3, 1.8, 0, 7); ctx.fill();
  }
}

// deterministic ground speckle over the visible viewport (subtle texture)
function drawGroundSpeckle(mx0, mx1, my0, my1) {
  for (let gx = Math.floor(mx0 / 46) * 46; gx < mx1; gx += 46) {
    for (let gy = Math.floor(my0 / 46) * 46; gy < my1; gy += 46) {
      const h = hash01(gx * 0.13 + gy * 0.017);
      if (h < 0.55) continue;
      const sx = w2sX(gx + hash01(gx * 1.1 + gy) * 34 - 17), sy = w2sY(gy + hash01(gx + gy * 1.1) * 34 - 17);
      ctx.fillStyle = h < 0.8 ? 'rgba(0,0,0,.07)' : 'rgba(230,240,200,.06)';
      ctx.fillRect(sx | 0, sy | 0, 3, 3);
    }
  }
}

// sparkles + night tint + precipitation — the tail every surface draw shares
function drawSurfaceFx(day) {
  for (const p of sparks) { const sx = w2sX(p.x), sy = w2sY(p.y); ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillStyle = p.col; ctx.fillRect(sx | 0, sy | 0, 2, 2); }
  ctx.globalAlpha = 1;
  if (!day) { ctx.fillStyle = 'rgba(12,20,46,.42)'; ctx.fillRect(0, 0, W, H); }
  drawPrecip(H);
}
