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
function updateCollectibles(items, dt, onCollect) {
  const r = SURFACE_THEME.pickupRadius * CELL;
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
