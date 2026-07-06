/* ============================================================
   scene_underground.js — the dig scene (the original game) as a scene object.
   Owns: grid / hp / seen / pebbles / treasure / home (globals in state.js) plus
   digging, fog-of-war, treasure + win, dirt/grass rendering, circle-vs-dirt
   collision, and the objective + depth HUD. This is the "dig win" that Phase 5
   will hook unlocks onto.
   ============================================================ */

// carry pickup / drop (underground-only interaction)
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

const UndergroundScene = {
  id: 'underground',
  worldW: WORLD_W, worldH: WORLD_H,
  canDig: true,
  built: false,

  build() {
    genWorld();                                      // (re)generate grid/hp/seen/pebbles/treasure/home
    this.worldW = WORLD_W; this.worldH = WORLD_H;
    maxDepthMM = 0; digTarget = null; digProgress = 0;
  },

  enter(from) {
    // spawn at the entrance shaft near home, facing down, ready to dig.
    // GROUND_Y (below) is the surface line the ant rests on — keep in sync.
    ant.x = home.x; ant.y = (surfaceRow - 0.2) * CELL;
    ant.vx = ant.vy = 0; ant.angle = Math.PI / 2;
  },

  resolveCollision() {
    // CEILING: the ant walks the surface/ground line but can NEVER rise into the
    // sky above it. Leaving the surface is done only via the door — up is not a
    // direction here. (surfaceRow - 0.2) keeps the ant at ground level, not
    // floating a cell above it. Keep in sync with the spawn Y in enter().
    const ceil = (surfaceRow - 0.2) * CELL;
    if (ant.y < ceil) { ant.y = ceil; if (ant.vy < 0) ant.vy = 0; }
    // circle vs beveled dirt cells
    const r = ant.r;
    for (let iter = 0; iter < 2; iter++) {
      const cx0 = cellOfX(ant.x - r), cx1 = cellOfX(ant.x + r), cy0 = cellOfY(ant.y - r), cy1 = cellOfY(ant.y + r);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        if (!inBounds(cx, cy) || !isSolid(cx, cy)) continue;
        resolveCirclePoly(cellShape(cx, cy), r);
      }
    }
  },

  update(dt) {
    const sp = Math.hypot(ant.vx, ant.vy);
    maxDepthMM = Math.max(maxDepthMM, depthMM());

    // footstep dust when moving along the surface
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
  },

  draw() { drawUnderground(); },                    // full world render lives in render.js

  drawHUD() {
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 15px -apple-system,sans-serif';
    const obj = treasure.home ? 'Treasure secured'
              : treasure.found ? (ant.carry === treasure ? 'Carry the gem up to the entrance ↑' : 'Grab the gem, then carry it home')
              : 'Objective: dig down and find the buried gem';
    const ox = 10 + safeLeft, oy = safeTop + 52;
    ctx.fillStyle = 'rgba(10,8,6,.5)'; roundRect(ox, oy, ctx.measureText(obj).width + 22, 30, 8); ctx.fill();
    ctx.fillStyle = '#ffe9c8'; ctx.fillText(obj, ox + 11, oy + 20);
    drawDepthMeter();
  },

  // door: near the entrance shaft, at/near the surface line -> go up to the surface
  actionPrompt() {
    const nearX = Math.abs(ant.x - home.x) < CELL * 2.2;
    const nearSurface = ant.y < (surfaceRow + 1) * CELL;
    return (nearX && nearSurface) ? { label: '🗺️ Surface', to: 'surface' } : null;
  },

  // NEST safe zone: near the home entrance chamber -> food & water refill here
  isSafeZone() {
    return Math.hypot(ant.x - home.x, ant.y - home.y) < SURVIVAL.nestRadius * CELL;
  },
};
