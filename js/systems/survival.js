/* ============================================================
   survival.js — HP / food / water: drain, regen, nest refill, death.
   ------------------------------------------------------------
   Centralized mutators are the ONLY way stats change. Phase 3 pickups and
   Phase 4 enemies just call addFood/addWater/heal/damage — no loop edits.
   Loaded after render.js, before menu.js.
   ============================================================ */

function resetStats() {
  stats.hp = stats.hpMax; stats.food = stats.foodMax; stats.water = stats.waterMax;
  stats.dead = false; stats.deathCause = '';
}

// --- mutator hooks (entry points for pickups / combat / nest) ---
function addFood(n)  { stats.food  = clamp(stats.food  + n, 0, stats.foodMax); }
function addWater(n) { stats.water = clamp(stats.water + n, 0, stats.waterMax); }
function heal(n)     { stats.hp    = clamp(stats.hp    + n, 0, stats.hpMax); }
function damage(n, cause) { stats.hp = clamp(stats.hp - n, 0, stats.hpMax); if (stats.hp <= 0) killAnt(cause || 'Wounds'); }

function killAnt(cause) {
  if (stats.dead) return;
  stats.dead = true; stats.deathCause = cause;
  autoDig = false;            // stop auto-dig on death
  gameScreen = 'dead';        // sim freezes (the shared update gate treats non-'playing' as paused)
  showDeath(cause);
}

// per-frame survival tick — called ONLY during live play (see scenes/manager.js)
function updateStats(dt) {
  if (stats.dead) return;
  const safe = scene && scene.isSafeZone && scene.isSafeZone();
  if (safe) {
    addFood(SURVIVAL.nestRefillFood * dt);
    addWater(SURVIVAL.nestRefillWater * dt);
  } else {
    stats.food  = Math.max(0, stats.food  - SURVIVAL.foodDrain  * dt);
    stats.water = Math.max(0, stats.water - SURVIVAL.waterDrain * dt);
  }
  if (stats.food <= 0 || stats.water <= 0) {
    stats.hp = Math.max(0, stats.hp - SURVIVAL.hpStarve * dt);
    if (stats.hp <= 0) {
      const cause = (stats.food <= 0 && stats.water <= 0) ? 'Hunger and thirst'
                  : (stats.food <= 0) ? 'Starvation' : 'Dehydration';
      killAnt(cause);
    }
  } else if (stats.food / stats.foodMax > SURVIVAL.regenThreshold &&
             stats.water / stats.waterMax > SURVIVAL.regenThreshold) {
    heal(SURVIVAL.hpRegen * dt);
  }
}

// three compact bars, top-left, below the weather chip. Shared HUD (both scenes).
function drawStats() {
  const rows = [
    { icon: '❤️', v: stats.hp / stats.hpMax,       col: '#e0574f', low: '#ff2a2a' },
    { icon: '🍖', v: stats.food / stats.foodMax,   col: '#e0a44a', low: '#ff6a2a' },
    { icon: '💧', v: stats.water / stats.waterMax, col: '#4aa8e0', low: '#2ad0ff' },
  ];
  const x = 10 + safeLeft, y0 = safeTop + 122, bw = 96, bh = 9, gap = 6, lblW = 22;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start'; ctx.font = '13px -apple-system,sans-serif';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], y = y0 + i * (bh + gap);
    ctx.fillStyle = '#fff'; ctx.fillText(r.icon, x, y + bh + 1);
    const bx = x + lblW;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; roundRect(bx, y, bw, bh, 4); ctx.fill();
    const fw = Math.max(0, bw * clamp(r.v, 0, 1));
    if (fw > 0) {
      const low = r.v < SURVIVAL.lowWarn && Math.sin(t * 8) > 0;   // pulse when critically low
      ctx.fillStyle = low ? r.low : r.col;
      roundRect(bx, y, fw, bh, Math.min(4, fw / 2)); ctx.fill();
    }
  }
}

// --- death overlay (HTML) ---
function showDeath(cause) {
  const el = document.getElementById('deathMsg'); if (el) el.textContent = cause + ' took your ant.';
  const d = document.getElementById('death'); if (d) d.classList.remove('hidden');
}
function hideDeath() { const d = document.getElementById('death'); if (d) d.classList.add('hidden'); }
