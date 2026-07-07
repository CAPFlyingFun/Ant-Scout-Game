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
  colony.jobs.soldier = 0; colony.jobs.builder = 0;   // 5B: everyone forages until the player assigns roles
}

// one ant entity. `job` (5B): 'forager' | 'soldier' | 'builder' — a behavior branch
// on the SAME array. forager state: 'out'|'toFood'|'home'|'idle'.
function spawnForager(x, y, job) {
  const a = { x, y, vx: 0, vy: 0, angle: Math.random() * 6.28, state: 'out',
              target: null, carrying: false, wanderT: 0, idleT: 0, legT: Math.random() * 6,
              job: job || 'forager', hp: SOLDIER.hp, atkT: 0, hitFlash: 0, dead: false };
  return a;
}

// deposit food into the shared stockpile (used by foragers AND the scout)
function depositFood(amount) {
  colony.food += amount; colony.totalCollected += amount;
}

function moveAnt(f, mx, my, speed) {
  f.x += mx * speed; f.y += my * speed;
  if (mx || my) f.angle = Math.atan2(my, mx);
}

// 5B: nudge actual ant jobs toward the player's desired split (colony.jobs).
// foragers = population - soldier - builder. Free reassignment (labour, not hatching).
function reconcileJobs(ants) {
  const pop = ants.length;
  const wantS = clamp(colony.jobs.soldier | 0, 0, pop);
  const wantB = clamp(colony.jobs.builder | 0, 0, pop - wantS);
  colony.jobs.soldier = wantS; colony.jobs.builder = wantB;
  let s = 0, b = 0;
  for (const a of ants) { if (a.job === 'soldier') s++; else if (a.job === 'builder') b++; }
  const setJob = (a, job) => {
    a.job = job; a.target = null; a.carrying = false;
    if (job === 'soldier') a.hp = SOLDIER.hp;
    a.state = (job === 'forager') ? 'out' : 'idle';
  };
  while (s < wantS) { const f = ants.find(a => a.job === 'forager'); if (!f) break; setJob(f, 'soldier'); s++; }
  while (s > wantS) { const f = ants.find(a => a.job === 'soldier'); if (!f) break; setJob(f, 'forager'); s--; }
  while (b < wantB) { const f = ants.find(a => a.job === 'forager'); if (!f) break; setJob(f, 'builder'); b++; }
  while (b > wantB) { const f = ants.find(a => a.job === 'builder'); if (!f) break; setJob(f, 'forager'); b--; }
}

// a soldier (or the scout, via combat.js) bites a spider
function soldierBite(f, e) {
  e.hp -= SOLDIER.attackDamage; e.hitFlash = COMBAT.hitFlashSec;
  const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy) || 1;
  e.x += dx / d * SOLDIER.knockback; e.y += dy / d * SOLDIER.knockback;
  if (e.hp <= 0 && !e.dead) { e.dead = true; onEnemyKilled(e); }
}

// the 5A forager gathering loop, factored out so builders can fall back to it when the nest is full
function foragerBehavior(f, dt, anthill, items, bounds) {
  if (f.state === 'idle') { f.idleT -= dt; if (f.idleT <= 0) f.state = 'out'; return; }
  if (f.state === 'out') {
    let best = null, bd = FORAGER.searchRadius * CELL;
    for (const it of items) {
      if (it.taken || it.kind !== 'food') continue;
      const d = Math.hypot(it.x - f.x, it.y - f.y);
      if (d < bd) { bd = d; best = it; }
    }
    if (best) { f.target = best; f.state = 'toFood'; }
    else {
      f.wanderT -= dt;
      if (f.wanderT <= 0) { f.wanderT = 1 + Math.random() * 2; f.angle += (Math.random() - 0.5) * FORAGER.wanderJitter; }
      moveAnt(f, Math.cos(f.angle), Math.sin(f.angle), FORAGER.speed);
    }
  }
  else if (f.state === 'toFood') {
    const it = f.target;
    if (!it || it.taken) { f.target = null; f.state = 'out'; }
    else {
      const dx = it.x - f.x, dy = it.y - f.y, d = Math.hypot(dx, dy) || 1;
      moveAnt(f, dx / d, dy / d, FORAGER.speed);
      if (d < FORAGER.r + CELL * 0.4) {
        it.taken = true;
        if (it.noRespawn) it.gone = true;
        else it.respawnT = (SURFACE_THEME.food && SURFACE_THEME.food.respawnSec) || it.respawnSec || 0;
        f.carrying = true; f.target = null; f.state = 'home';
      }
    }
  }
  else if (f.state === 'home') {
    const dx = anthill.x - f.x, dy = anthill.y - f.y, d = Math.hypot(dx, dy) || 1;
    moveAnt(f, dx / d, dy / d, FORAGER.speed);
    if (d < COLONY.depositRadius * CELL) {
      if (f.carrying) { depositFood(FORAGER.carryValue); f.carrying = false; }
      f.idleT = FORAGER.idleAtNestSec; f.state = 'idle';
    }
  }
}

// soldier AI: hunt spiders near itself or the nest; else patrol the nest perimeter
function soldierBehavior(f, dt, anthill, enemies) {
  let tgt = null, td = SOLDIER.engageRadius * CELL;
  if (enemies) {
    for (const e of enemies) { if (e.dead) continue; const d = Math.hypot(e.x - f.x, e.y - f.y); if (d < td) { td = d; tgt = e; } }
    if (!tgt) {   // nothing near me — defend: intercept the nearest spider threatening the nest
      let nd = (SOLDIER.engageRadius + 3) * CELL;
      for (const e of enemies) { if (e.dead) continue; const d = Math.hypot(e.x - anthill.x, e.y - anthill.y); if (d < nd) { nd = d; tgt = e; } }
    }
  }
  if (tgt) {
    const dx = tgt.x - f.x, dy = tgt.y - f.y, d = Math.hypot(dx, dy) || 1;
    if (d > SOLDIER.attackRadius * CELL) moveAnt(f, dx / d, dy / d, SOLDIER.speed);
    else { f.angle = Math.atan2(dy, dx); f.atkT -= dt; if (f.atkT <= 0) { f.atkT = SOLDIER.attackCooldown; soldierBite(f, tgt); } }
  } else {   // patrol near the nest
    const dx = anthill.x - f.x, dy = anthill.y - f.y, d = Math.hypot(dx, dy) || 1;
    if (d > SOLDIER.patrolRadius * CELL) moveAnt(f, dx / d, dy / d, SOLDIER.speed * 0.8);
    else {
      f.wanderT -= dt;
      if (f.wanderT <= 0) { f.wanderT = 0.6 + Math.random() * 1.4; f.angle += (Math.random() - 0.5) * 2; }
      moveAnt(f, Math.cos(f.angle), Math.sin(f.angle), SOLDIER.speed * 0.5);
    }
  }
}

// builder AI: repair the nest when hurt; otherwise help forage
function builderBehavior(f, dt, anthill, items, bounds) {
  if (colony.nestHp < colony.nestHpMax - 0.1) {
    const dx = anthill.x - f.x, dy = anthill.y - f.y, d = Math.hypot(dx, dy) || 1;
    if (d > BUILDER.repairRadius * CELL) moveAnt(f, dx / d, dy / d, BUILDER.speed);
    else {   // at the nest → mend it
      colony.nestHp = Math.min(colony.nestHpMax, colony.nestHp + BUILDER.repairRate * dt);
      f.wanderT -= dt; if (f.wanderT <= 0) { f.wanderT = 0.4 + Math.random(); f.angle += (Math.random() - 0.5) * 2; }
    }
  } else {
    if (f.state === 'idle') f.state = 'out';   // nest full → pitch in on foraging
    foragerBehavior(f, dt, anthill, items, bounds);
  }
}

// ant AI — call each SURFACE frame. anthill={x,y}; items = collectibles; bounds={w,h}; enemies = spiders
function updateAnts(ants, dt, anthill, items, bounds, enemies) {
  // remove any ants killed defending (soldiers) so population/economy stay honest
  for (let i = ants.length - 1; i >= 0; i--) if (ants[i].dead) ants.splice(i, 1);

  reconcileJobs(ants);
  colony.population = ants.length;

  for (const f of ants) {
    f.legT += dt * 6;
    if (f.hitFlash > 0) f.hitFlash -= dt;

    if (f.job === 'soldier')      soldierBehavior(f, dt, anthill, enemies);
    else if (f.job === 'builder') builderBehavior(f, dt, anthill, items, bounds);
    else                          foragerBehavior(f, dt, anthill, items, bounds);

    if (bounds) { const r = FORAGER.r; f.x = clamp(f.x, r, bounds.w - r); f.y = clamp(f.y, r, bounds.h - r); }
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

// Nest falling is a real-but-recoverable SETBACK (5B stakes; defend it with soldiers).
function onNestFallen() {
  colony.nestHp = Math.round(colony.nestHpMax * COLONY.nestFallHpRefill);   // partial refill
  colony.food = Math.floor(colony.food * (1 - COLONY.nestFallFoodLoss));    // lose part of the stockpile
  const surf = Scenes && Scenes.surface;
  if (surf && surf.ants && surf.ants.length) {
    let loss = Math.round(surf.ants.length * COLONY.nestFallAntLoss);
    // remove foragers first so the colony keeps its defenders; reconciler rebalances afterward
    surf.ants.sort((a, b) => (a.job === 'forager' ? 0 : 1) - (b.job === 'forager' ? 0 : 1));
    while (loss-- > 0 && surf.ants.length) surf.ants.shift();
    colony.population = surf.ants.length;
  }
  banner = { text: '⚠️ The nest was overrun!', t: 3.2 };
}

// ---------- rendering ----------
// job → look. forager (small, tan), soldier (bigger, dark, mandibles), builder (green).
function drawAnts(ants) {
  if (!ants) return;
  for (const f of ants) {
    const sx = w2sX(f.x), sy = w2sY(f.y);
    if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;   // cull off-screen
    const sol = f.job === 'soldier', bld = f.job === 'builder';
    const r = sol ? SOLDIER.r : FORAGER.r;

    const moving = (f.job !== 'forager') || (f.state !== 'idle');
    const drew = drawAntSprite(f.job, moving, f.carrying, sx, sy, f.angle, r * ANT_SPRITE.scale, f.hitFlash > 0);

    if (!drew) {   // vector fallback
      const body = f.hitFlash > 0 ? '#fff' : (sol ? SOLDIER.bodyCol : bld ? BUILDER.bodyCol : FORAGER.bodyCol);
      const bodyDk = f.hitFlash > 0 ? '#fff' : (sol ? SOLDIER.bodyDk : bld ? BUILDER.bodyDk : FORAGER.bodyDk);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(f.angle);
      ctx.strokeStyle = '#241109'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const ph = f.legT + i * 1.4, sw = Math.sin(ph) * r * 0.4;
        ctx.beginPath(); ctx.moveTo(i * r * 0.4, 0); ctx.lineTo(i * r * 0.4 + sw, -r * 0.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * r * 0.4, 0); ctx.lineTo(i * r * 0.4 - sw, r * 0.8); ctx.stroke();
      }
      ctx.fillStyle = bodyDk; ctx.beginPath(); ctx.ellipse(-r * 0.6, 0, r * 0.55, r * 0.45, 0, 0, 7); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(r * 0.4, 0, r * 0.4, r * 0.34, 0, 0, 7); ctx.fill();
      if (sol) {
        ctx.strokeStyle = '#241109'; ctx.lineWidth = Math.max(1, r * 0.14);
        ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.18); ctx.lineTo(r * 1.05, -r * 0.06); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.18); ctx.lineTo(r * 1.05, r * 0.06); ctx.stroke();
      }
      ctx.restore();
    }

    if (f.carrying) {   // a crumb held out in front (over the sprite)
      ctx.fillStyle = '#d7c07a';
      ctx.beginPath(); ctx.arc(sx + Math.cos(f.angle) * r * 0.9, sy + Math.sin(f.angle) * r * 0.9, 2.5, 0, 7); ctx.fill();
    }
    if (sol && f.hp < SOLDIER.hp) {   // tiny damage pips above a hurt soldier
      for (let k = 0; k < SOLDIER.hp; k++) { ctx.fillStyle = k < f.hp ? '#7ee08a' : 'rgba(255,255,255,.25)'; ctx.fillRect(sx - SOLDIER.hp * 2 + k * 4, sy - r - 6, 3, 2); }
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
