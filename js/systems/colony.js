/* ============================================================
   colony.js — the COLONY economy + forager AI (Phase 5A).
   ------------------------------------------------------------
   A second resource layer, SEPARATE from the scout's survival: a shared food
   stockpile, AI forager ants that roam the surface / collect food / haul it
   home / deposit it, hatching new foragers from stored food up to a cap, and
   nest HP that surface enemies damage.

   Layering, so Phase 5B (roles: soldier/builder + active defense) slots in
   WITHOUT reworking the economy:
     • The economy (colony.* in state.js) is GLOBAL and persists across scenes.
     • The forager ENTITIES live on the surface scene (SurfaceScene.ants) — they
       only exist where the nest mouth is.
     • Each ant is a data object with a `state` machine. 5B adds new jobs as more
       states/types on the SAME ants array and reuses updateColony()/hatching;
       role assignment just spends colony.food / colony.population.
   Loaded in the SYSTEMS block, after combat.js, before scenes/manager.js.
   ============================================================ */

// shared handle to the surface anthill so updateColony() can hatch without the scene
let colonyAnthill = { x: 0, y: 0 };

function resetColony() {
  colony.food = COLONY.startFood;
  colony.nestHpMax = COLONY.nestHpMax; colony.nestHp = COLONY.nestHpMax;
  colony.hatchT = 0; colony.totalCollected = 0; colony.underAttack = false; colony.population = 0;
}

// one forager entity. state: 'out' (roam/search) | 'toFood' | 'home' (haul) | 'idle' (rest at nest)
function spawnForager(x, y) {
  return { x, y, vx: 0, vy: 0, angle: Math.random() * 6.28, state: 'out',
           target: null, carrying: false, wanderT: 0, idleT: 0, legT: Math.random() * 6 };
}

// deposit food into the shared stockpile (used by foragers AND the scout)
function depositFood(amount) {
  colony.food += amount; colony.totalCollected += amount;
}

function moveForager(f, mx, my) {
  f.x += mx * FORAGER.speed; f.y += my * FORAGER.speed;
  if (mx || my) f.angle = Math.atan2(my, mx);
}

// forager AI — call each SURFACE frame. anthill={x,y}; items = surface collectibles; bounds={w,h}
function updateForagers(ants, dt, anthill, items, bounds) {
  colony.population = ants.length;
  for (const f of ants) {
    f.legT += dt * 6;

    if (f.state === 'idle') {                              // brief rest at the nest, then head out
      f.idleT -= dt; if (f.idleT <= 0) f.state = 'out';
      continue;
    }
    if (f.state === 'out') {                               // roam, looking for food
      let best = null, bd = FORAGER.searchRadius * CELL;   // nearest available food within searchRadius
      for (const it of items) {
        if (it.taken || it.kind !== 'food') continue;
        const d = Math.hypot(it.x - f.x, it.y - f.y);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) { f.target = best; f.state = 'toFood'; }
      else {                                               // wander (correlated turns)
        f.wanderT -= dt;
        if (f.wanderT <= 0) { f.wanderT = 1 + Math.random() * 2; f.angle += (Math.random() - 0.5) * FORAGER.wanderJitter; }
        moveForager(f, Math.cos(f.angle), Math.sin(f.angle));
      }
    }
    else if (f.state === 'toFood') {                       // go grab the targeted item
      const it = f.target;
      if (!it || it.taken) { f.target = null; f.state = 'out'; }   // someone else got it
      else {
        const dx = it.x - f.x, dy = it.y - f.y, d = Math.hypot(dx, dy) || 1;
        moveForager(f, dx / d, dy / d);
        if (d < FORAGER.r + CELL * 0.4) {
          it.taken = true;
          // deplete properly on the item's timer; one-time drops (killed-spider food) vanish
          if (it.noRespawn) it.gone = true;
          else it.respawnT = (SURFACE_THEME.food && SURFACE_THEME.food.respawnSec) || it.respawnSec || 0;
          f.carrying = true; f.target = null; f.state = 'home';
        }
      }
    }
    else if (f.state === 'home') {                         // haul it back to the nest
      const dx = anthill.x - f.x, dy = anthill.y - f.y, d = Math.hypot(dx, dy) || 1;
      moveForager(f, dx / d, dy / d);
      if (d < COLONY.depositRadius * CELL) {
        if (f.carrying) { depositFood(FORAGER.carryValue); f.carrying = false; }
        f.idleT = FORAGER.idleAtNestSec; f.state = 'idle';
      }
    }

    if (bounds) { f.x = clamp(f.x, FORAGER.r, bounds.w - FORAGER.r); f.y = clamp(f.y, FORAGER.r, bounds.h - FORAGER.r); }
  }
}

// economy tick — call each live frame (any scene). `ants` = surface ants array,
// or null when not on the surface (regen ticks everywhere; foragers only hatch
// where the nest mouth is, i.e. the surface).
function updateColony(dt, ants) {
  if (colony.hatchT > 0) colony.hatchT -= dt;
  if (ants && ants.length < COLONY.maxAnts && colony.food >= COLONY.foodPerAnt && colony.hatchT <= 0) {
    colony.food -= COLONY.foodPerAnt; colony.hatchT = COLONY.hatchCooldown;
    ants.push(spawnForager(colonyAnthill.x + (Math.random() * 2 - 1) * CELL,
                           colonyAnthill.y + (Math.random() * 2 - 1) * CELL));
    colony.population = ants.length;
  }
  // nest slowly self-heals when not currently under attack
  if (!colony.underAttack && colony.nestHp < colony.nestHpMax) {
    colony.nestHp = Math.min(colony.nestHpMax, colony.nestHp + COLONY.nestRegen * dt);
  }
  colony.underAttack = false;   // re-set true each frame by the nest-attack hook (surface) if an enemy is hitting it
}

// a surface enemy hit the nest
function damageNest(n) {
  colony.nestHp = Math.max(0, colony.nestHp - n);
  colony.underAttack = true;
  if (colony.nestHp <= 0) onNestFallen();
}

// 5A: nest falling is a SETBACK, not a game over. (Full destruction/defense = 5B.)
function onNestFallen() {
  colony.nestHp = Math.round(colony.nestHpMax * 0.4);   // partial refill
  colony.food = Math.floor(colony.food * 0.5);          // lose half the stockpile
  const surf = Scenes && Scenes.surface;
  if (surf && surf.ants && surf.ants.length) {          // lose a few foragers (capped)
    const loss = Math.min(surf.ants.length, 3);
    surf.ants.splice(0, loss);
    colony.population = surf.ants.length;
  }
  banner = { text: '⚠️ The nest was overrun!', t: 3.2 };
}

// ---------- rendering ----------
function drawForagers(ants) {
  if (!ants) return;
  for (const f of ants) {
    const sx = w2sX(f.x), sy = w2sY(f.y);
    if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;   // cull off-screen
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(f.angle);
    ctx.strokeStyle = '#241109'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const ph = f.legT + i * 1.4, sw = Math.sin(ph) * FORAGER.r * 0.4;
      ctx.beginPath(); ctx.moveTo(i * FORAGER.r * 0.4, 0); ctx.lineTo(i * FORAGER.r * 0.4 + sw, -FORAGER.r * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * FORAGER.r * 0.4, 0); ctx.lineTo(i * FORAGER.r * 0.4 - sw, FORAGER.r * 0.8); ctx.stroke();
    }
    ctx.fillStyle = FORAGER.bodyDk; ctx.beginPath(); ctx.ellipse(-FORAGER.r * 0.6, 0, FORAGER.r * 0.55, FORAGER.r * 0.45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = FORAGER.bodyCol; ctx.beginPath(); ctx.ellipse(FORAGER.r * 0.4, 0, FORAGER.r * 0.4, FORAGER.r * 0.34, 0, 0, 7); ctx.fill();
    ctx.restore();
    if (f.carrying) {   // a crumb held out in front
      ctx.fillStyle = '#d7c07a';
      ctx.beginPath(); ctx.arc(sx + Math.cos(f.angle) * FORAGER.r * 0.9, sy + Math.sin(f.angle) * FORAGER.r * 0.9, 2.5, 0, 7); ctx.fill();
    }
  }
}

// slim nest-HP bar floating above the anthill — only when damaged or under attack
function drawNestHpBar(hx, hy, r) {
  if (colony.nestHp >= colony.nestHpMax && !colony.underAttack) return;
  const bw = r * 2, bh = 6, bx = hx - r, by = hy - r * 0.72 - 16;
  const frac = clamp(colony.nestHp / (colony.nestHpMax || 1), 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(bx, by, bw, bh, 3); ctx.fill();
  const pulse = colony.underAttack && Math.sin(t * 12) > 0;
  ctx.fillStyle = pulse ? '#ff3a2a' : (frac < 0.35 ? '#e0574f' : '#5ab054');
  if (frac > 0) { roundRect(bx, by, bw * frac, bh, 3); ctx.fill(); }
}

// glanceable colony readout on the HUD (population / stockpile), left column under the stat bars
function drawColonyReadout() {
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
  const label = '🐜 ' + colony.population + '/' + COLONY.maxAnts + '   🍖 ' + Math.floor(colony.food);
  ctx.font = '700 13px -apple-system,sans-serif';
  const x = 10 + safeLeft, y = safeTop + 176, w = ctx.measureText(label).width + 18, h = 24;
  ctx.fillStyle = 'rgba(10,8,6,.5)'; roundRect(x, y, w, h, 8); ctx.fill();
  ctx.fillStyle = '#ffd9a6'; ctx.fillText(label, x + 9, y + 16);
}
