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
           wanderT: 0, wanderAng: Math.random() * 6.28, ang: Math.random() * 6.28,
           colorRow: (Math.random() * 4) | 0, dead: false };
}

// per-frame: AI + attacks + cleanup. opts = { anthill:{x,y}, safeRadius, bounds:{w,h} }
function updateEnemies(list, dt, opts) {
  const anth = opts && opts.anthill, safeR = ((opts && opts.safeRadius) || 0) * CELL;
  const defenders = opts && opts.defenders;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i], d = ENEMY_TYPES[e.type];
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.dead) { list.splice(i, 1); continue; }

    // TARGET SELECTION (5B): the scout by default, but a soldier that's closer
    // (and within detect range) is fought instead — so soldiers intercept threats.
    let tgtX = ant.x, tgtY = ant.y, tgtSoldier = null;
    const distAnt = Math.hypot(ant.x - e.x, ant.y - e.y) || 1;
    if (defenders) {
      let bd = d.detectRadius * CELL;
      for (const s of defenders) {
        if (s.dead || s.job !== 'soldier') continue;
        const sd = Math.hypot(s.x - e.x, s.y - e.y);
        if (sd < bd) { bd = sd; tgtSoldier = s; }
      }
      if (tgtSoldier && bd < distAnt) { tgtX = tgtSoldier.x; tgtY = tgtSoldier.y; }
    }
    const dx = tgtX - e.x, dy = tgtY - e.y, dist = Math.hypot(dx, dy) || 1;

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
    if (mx || my) { let da = Math.atan2(my, mx) - e.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); e.ang += da * 0.25; }

    // keep spiders OUT of the anthill safe radius (fair retreat) and inside map bounds
    if (anth && safeR > 0) {
      const adx = e.x - anth.x, ady = e.y - anth.y, ad = Math.hypot(adx, ady);
      if (ad < safeR && ad > 0) { e.x = anth.x + adx / ad * safeR; e.y = anth.y + ady / ad * safeR; if (e.state !== 'wander') e.state = 'wander'; }
    }
    if (opts && opts.bounds) { e.x = clamp(e.x, d.r, opts.bounds.w - d.r); e.y = clamp(e.y, d.r, opts.bounds.h - d.r); }

    // attacking the target (soldier or scout)
    if (e.state === 'attack') {
      e.atkT -= dt;
      if (e.atkT <= 0) {
        if (tgtSoldier) {                                           // fighting a defending soldier
          e.atkT = d.attackCooldown;
          tgtSoldier.hp -= d.attackDamage; tgtSoldier.hitFlash = COMBAT.hitFlashSec;
          const kx = dx / dist, ky = dy / dist; tgtSoldier.x -= kx * COMBAT.knockback * 0.5; tgtSoldier.y -= ky * COMBAT.knockback * 0.5;
          if (tgtSoldier.hp <= 0) tgtSoldier.dead = true;           // colony.js splices dead ants
        } else if (ant.invuln <= 0) {                               // biting the scout
          e.atkT = d.attackCooldown;
          damage(d.attackDamage, 'A spider');                       // Phase 2 hook → handles death
          ant.invuln = COMBAT.antIFrames; ant.hitFlash = COMBAT.hitFlashSec; dmgFlash = COMBAT.dmgFlashSec;
          const kx = dx / dist, ky = dy / dist; ant.vx -= kx * COMBAT.knockback; ant.vy -= ky * COMBAT.knockback;
          shake = Math.min(12, shake + 6);
        }
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
    const flash = e.hitFlash > 0, r = d.r, ang = e.ang || 0;

    // sprite-drawn enemies (beetles): atlas blit, rotated to heading
    if (d.sprite) {
      const moving = e.state !== 'attack';
      if (drawBugSprite(e.colorRow || 0, moving, sx, sy, ang, r * BUG_SPRITE.scale, flash)) continue;
      // vector fallback beetle: shell + head + legs
      ctx.save(); ctx.translate(sx, sy);
      ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.beginPath(); ctx.ellipse(0, r * 0.3, r, r * 0.5, 0, 0, 7); ctx.fill();
      ctx.rotate(ang);
      ctx.strokeStyle = flash ? '#fff' : d.legCol; ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.lineCap = 'round';
      for (let side = 1; side >= -1; side -= 2) for (let i = 0; i < 3; i++) {
        const bx = (0.3 - i * 0.3) * r, la = side * (0.9 + i * 0.25);
        ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + Math.cos(la) * r * 1.0, Math.sin(la) * r * 1.0); ctx.stroke();
      }
      ctx.fillStyle = flash ? '#fff' : d.bodyCol;
      ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.85, r * 0.62, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.65, 0, r * 0.3, r * 0.26, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-r * 0.85, 0); ctx.lineTo(r * 0.6, 0); ctx.stroke();   // wing seam
      ctx.restore();
      continue;
    }

    const legCol = flash ? '#fff' : d.legCol;
    const bodyCol = flash ? '#fff' : d.bodyCol;
    const eyeCol = flash ? '#fff' : d.eyeCol;

    ctx.save();
    ctx.translate(sx, sy);
    // ground shadow (screen-aligned — doesn't spin with the body)
    ctx.fillStyle = 'rgba(0,0,0,.20)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 1.05, r * 0.55, 0, 0, 7); ctx.fill();
    ctx.rotate(ang);                                   // forward = +x local

    // legs: 4 per side, bent at a knee, swept front→back (not a radial starburst)
    ctx.strokeStyle = legCol; ctx.lineCap = 'round';
    const baseAngs = [0.62, 1.15, 1.75, 2.35], attachX = [0.42, 0.24, 0.02, -0.18];
    for (let side = 1; side >= -1; side -= 2) {
      for (let i = 0; i < 4; i++) {
        const ba = side * baseAngs[i] + Math.sin(t * 8 + i) * 0.07 * side;   // subtle scuttle
        const ax = attachX[i] * r;
        const kx = ax + Math.cos(ba) * 0.95 * r, ky = Math.sin(ba) * 0.95 * r;   // knee
        const fa = ba + side * 0.7;                                              // bend outward
        const fx = kx + Math.cos(fa) * 1.05 * r, fy = ky + Math.sin(fa) * 1.05 * r;  // foot
        ctx.lineWidth = Math.max(1.5, r * 0.15);
        ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      }
    }

    // fangs at the very front
    ctx.lineWidth = Math.max(1.5, r * 0.13);
    ctx.beginPath(); ctx.moveTo(r * 0.72, r * 0.12); ctx.lineTo(r * 1.0, r * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.72, -r * 0.12); ctx.lineTo(r * 1.0, -r * 0.04); ctx.stroke();

    // body: abdomen (big, rear) + cephalothorax (smaller, front)
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.ellipse(-r * 0.55, 0, r * 0.72, r * 0.62, 0, 0, 7); ctx.fill();
    if (!flash) { ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.beginPath(); ctx.ellipse(-r * 0.75, -r * 0.12, r * 0.28, r * 0.20, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.ellipse(r * 0.35, 0, r * 0.46, r * 0.42, 0, 0, 7); ctx.fill();

    // eyes: small red cluster on the cephalothorax
    ctx.fillStyle = eyeCol;
    const eyes = [[0.55, 0.14], [0.55, -0.14], [0.68, 0.06], [0.68, -0.06]];
    for (const ee of eyes) { ctx.beginPath(); ctx.arc(ee[0] * r, ee[1] * r, Math.max(1, r * 0.07), 0, 7); ctx.fill(); }

    ctx.restore();
  }
}
