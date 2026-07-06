/* ============================================================
   combat.js — shared, reusable combat: enemy AI, the ant's bite, hit feedback.
   Operates on an enemy array (data-driven via ENEMY_TYPES) + the shared ant/stats.
   A 2nd enemy = one ENEMY_TYPES entry + spawning it; Phase 6 hazards reuse
   updateEnemies/tryBite unchanged. Loaded after the scene manager, before the scene files.
   ============================================================ */

// spawn one enemy of a type at a position
function spawnEnemy(type, x, y) {
  const d = ENEMY_TYPES[type];
  return { type, x, y, vx: 0, vy: 0, hp: d.hp, state: 'wander', atkT: 0, hitFlash: 0,
           wanderT: 0, wanderAng: Math.random() * 6.28, dead: false };
}

// per-frame: AI + attacks + cleanup. opts = { anthill:{x,y}, safeRadius, bounds:{w,h} }
function updateEnemies(list, dt, opts) {
  const anth = opts && opts.anthill, safeR = ((opts && opts.safeRadius) || 0) * CELL;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i], d = ENEMY_TYPES[e.type];
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.dead) { list.splice(i, 1); continue; }
    const dx = ant.x - e.x, dy = ant.y - e.y, dist = Math.hypot(dx, dy) || 1;

    // state transitions (hysteresis)
    if (e.state === 'wander' && dist < d.detectRadius * CELL) e.state = 'chase';
    else if (e.state !== 'wander' && dist > d.loseRadius * CELL) e.state = 'wander';
    if (e.state === 'chase' && dist < d.attackRadius * CELL) e.state = 'attack';
    if (e.state === 'attack' && dist > d.attackRadius * CELL * 1.2) e.state = 'chase';

    // movement
    let mx = 0, my = 0;
    if (e.state === 'chase') { mx = dx / dist; my = dy / dist; }
    else if (e.state === 'wander') {
      e.wanderT -= dt; if (e.wanderT <= 0) { e.wanderT = 1 + Math.random() * 2; e.wanderAng += (Math.random() - 0.5) * 2; }
      mx = Math.cos(e.wanderAng) * 0.4; my = Math.sin(e.wanderAng) * 0.4;
    }
    e.x += mx * d.speed; e.y += my * d.speed;

    // keep spiders OUT of the anthill safe radius (fair retreat) and inside map bounds
    if (anth && safeR > 0) {
      const adx = e.x - anth.x, ady = e.y - anth.y, ad = Math.hypot(adx, ady);
      if (ad < safeR && ad > 0) { e.x = anth.x + adx / ad * safeR; e.y = anth.y + ady / ad * safeR; if (e.state !== 'wander') e.state = 'wander'; }
    }
    if (opts && opts.bounds) { e.x = clamp(e.x, d.r, opts.bounds.w - d.r); e.y = clamp(e.y, d.r, opts.bounds.h - d.r); }

    // attacking the ant
    if (e.state === 'attack') {
      e.atkT -= dt;
      if (e.atkT <= 0 && ant.invuln <= 0) {
        e.atkT = d.attackCooldown;
        damage(d.attackDamage, 'A spider');                         // Phase 2 hook → handles death
        ant.invuln = COMBAT.antIFrames; ant.hitFlash = COMBAT.hitFlashSec; dmgFlash = COMBAT.dmgFlashSec;
        const kx = dx / dist, ky = dy / dist; ant.vx -= kx * COMBAT.knockback; ant.vy -= ky * COMBAT.knockback;
        shake = Math.min(12, shake + 6);
      }
    }
  }
}

// the ant's bite — call while the action button is held; self-gates on cooldown. Returns true if it bit.
function tryBite(list) {
  if (ant.biteT > 0) return false;
  const fx = Math.cos(ant.angle), fy = Math.sin(ant.angle);
  let best = null, bestD = 1e9;
  for (const e of list) {
    if (e.dead) continue;
    const dx = e.x - ant.x, dy = e.y - ant.y, dist = Math.hypot(dx, dy) || 1;
    const reach = ant.r + ENEMY_TYPES[e.type].r + COMBAT.biteReach;
    if (dist > reach) continue;
    if ((dx / dist) * fx + (dy / dist) * fy < Math.cos(COMBAT.biteArc / 2)) continue;   // must be roughly in front
    if (dist < bestD) { bestD = dist; best = e; }
  }
  if (!best) return false;
  ant.biteT = COMBAT.biteCooldown;
  best.hp -= COMBAT.biteDamage; best.hitFlash = COMBAT.hitFlashSec;
  const dx = best.x - ant.x, dy = best.y - ant.y, dd = Math.hypot(dx, dy) || 1;
  best.x += dx / dd * COMBAT.knockback; best.y += dy / dd * COMBAT.knockback;           // knock enemy back
  burstDirt(best.x, best.y);                                                            // reuse a particle burst for the hit
  if (best.hp <= 0) { best.dead = true; onEnemyKilled(best); }
  return true;
}

// true if an enemy is in bite range + arc (for the BITE button highlight)
function enemyTargetable(list) {
  if (!list) return false;
  const fx = Math.cos(ant.angle), fy = Math.sin(ant.angle);
  for (const e of list) {
    if (e.dead) continue;
    const dx = e.x - ant.x, dy = e.y - ant.y, dist = Math.hypot(dx, dy) || 1;
    if (dist <= ant.r + ENEMY_TYPES[e.type].r + COMBAT.biteReach && ((dx / dist) * fx + (dy / dist) * fy) >= Math.cos(COMBAT.biteArc / 2)) return true;
  }
  return false;
}

function onEnemyKilled(e) {
  burstSpark(e.x, e.y);
  // DROP food using the Phase 3 item shape so the existing collect loop picks it up
  if (scene && scene.items) {
    const d = COMBAT.drop;
    scene.items.push({ x: e.x, y: e.y, kind: d.kind, sub: d.sub, taken: false, respawnT: 0, noRespawn: true, bob: Math.random() * 6 });
  }
}

// ant combat timers + screen flash decay — call every live frame
function updateAntCombat(dt) {
  if (ant.invuln > 0)   ant.invuln -= dt;
  if (ant.hitFlash > 0) ant.hitFlash -= dt;
  if (ant.biteT > 0)    ant.biteT -= dt;
  if (dmgFlash > 0)     dmgFlash -= dt;
}

function drawEnemies(list) {
  if (!list) return;
  for (const e of list) {
    if (e.dead) continue;
    const sx = w2sX(e.x), sy = w2sY(e.y), d = ENEMY_TYPES[e.type];
    if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;   // cull
    const flash = e.hitFlash > 0;
    // legs (8), body, eyes — top-down spider
    ctx.strokeStyle = d.legCol; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.28 + Math.sin(t * 6 + k) * 0.15;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * d.r * 1.6, sy + Math.sin(a) * d.r * 1.6); ctx.stroke();
    }
    ctx.fillStyle = flash ? '#fff' : d.bodyCol; ctx.beginPath(); ctx.ellipse(sx, sy, d.r, d.r * 0.85, 0, 0, 7); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : d.eyeCol;
    ctx.beginPath(); ctx.arc(sx - d.r * 0.3, sy - d.r * 0.2, 1.6, 0, 7); ctx.arc(sx + d.r * 0.3, sy - d.r * 0.2, 1.6, 0, 7); ctx.fill();
  }
}
