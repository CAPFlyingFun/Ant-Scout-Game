/* ============================================================
   npc.js — ambient NPC worker ants (surface only, appearance for now).
   Movement = a CORRELATED RANDOM WALK: a persistent heading nudged by small
   angular noise, occasional sharper reorientations, and stop-and-go pauses —
   the pattern real ants follow (individual scaling / foraging studies), not
   pure Brownian motion. A gentle pull toward the colony keeps them in range.
   Data-driven + a `behavior` hook so a later phase can add 'forage' (seek the
   nearest item) with no pipeline change. Loaded before scene_surface.js.
   ============================================================ */

function spawnNpcAnt(x, y) {
  return { x, y, ang: Math.random() * 6.28, spd: NPC_ANTS.speed * (0.8 + Math.random() * 0.5),
           turnT: 0, pauseT: 0, legT: Math.random() * 6, behavior: 'wander' };
}

// steer `cur` heading toward `target` by fraction `amt` (shortest arc)
function turnToward(cur, target, amt) {
  let d = target - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * amt;
}

// per-frame wander AI. opts = { home:{x,y}, bounds:{w,h} }
function updateNpcAnts(list, dt, opts) {
  const home = opts && opts.home, bounds = opts && opts.bounds, C = NPC_ANTS;
  for (const a of list) {
    // stop-and-go
    if (a.pauseT > 0) { a.pauseT -= dt; continue; }
    if (Math.random() < C.pauseChance) { a.pauseT = C.pauseDur[0] + Math.random() * (C.pauseDur[1] - C.pauseDur[0]); continue; }

    // correlated random walk: constant small jitter + occasional sharper reorientation
    a.turnT -= dt;
    if (a.turnT <= 0) { a.turnT = C.reorientEvery[0] + Math.random() * (C.reorientEvery[1] - C.reorientEvery[0]);
      a.ang += (Math.random() - 0.5) * 2 * C.reorientAmt; }
    a.ang += (Math.random() - 0.5) * C.turnJitter;

    // gentle attraction toward the colony (keeps them roaming the play area, not the edges)
    if (home) {
      const dx = home.x - a.x, dy = home.y - a.y, d = Math.hypot(dx, dy) || 1;
      a.ang = turnToward(a.ang, Math.atan2(dy, dx), d > C.homeRange ? C.homeFar : C.homeNear);
    }

    a.x += Math.cos(a.ang) * a.spd; a.y += Math.sin(a.ang) * a.spd;
    a.legT += a.spd * 0.16 + 0.02;

    // reflect off the map edges
    if (bounds) {
      if (a.x < 40) { a.x = 40; a.ang = Math.PI - a.ang; }
      else if (a.x > bounds.w - 40) { a.x = bounds.w - 40; a.ang = Math.PI - a.ang; }
      if (a.y < 40) { a.y = 40; a.ang = -a.ang; }
      else if (a.y > bounds.h - 40) { a.y = bounds.h - 40; a.ang = -a.ang; }
    }
  }
}

function drawNpcAnts(list) {
  if (!list) return;
  for (const a of list) {
    const sx = w2sX(a.x), sy = w2sY(a.y);
    if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;   // cull
    drawMiniAnt(sx, sy, a.ang, NPC_ANTS.r, a.legT, a.pauseT > 0);
  }
}

// small top-down worker ant: shadow, 6 legs, 3 body segments, antennae
function drawMiniAnt(sx, sy, ang, r, legT, paused) {
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(0, 1.5, r * 1.1, r * 0.6, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = NPC_ANTS.legCol; ctx.lineWidth = Math.max(1, r * 0.18); ctx.lineCap = 'round';
  const swing = paused ? 0 : Math.sin(legT) * r * 0.28;
  for (let i = -1; i <= 1; i++) {
    const bx = i * r * 0.4;
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + swing, -r * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx - swing, r * 0.9); ctx.stroke();
  }
  ctx.fillStyle = NPC_ANTS.bodyCol;
  ctx.beginPath(); ctx.ellipse(-r * 0.6, 0, r * 0.55, r * 0.45, 0, 0, 7); ctx.fill();   // abdomen
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.26, 0, 0, 7); ctx.fill();           // thorax
  ctx.beginPath(); ctx.ellipse(r * 0.5, 0, r * 0.34, r * 0.3, 0, 0, 7); ctx.fill();     // head
  ctx.strokeStyle = NPC_ANTS.legCol; ctx.lineWidth = Math.max(0.8, r * 0.12);
  ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.14); ctx.lineTo(r * 1.1, -r * 0.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.14); ctx.lineTo(r * 1.1, r * 0.4); ctx.stroke();
  ctx.restore();
}
