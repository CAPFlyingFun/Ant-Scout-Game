/* ============================================================
   house.js — 🏠 The House (unlock #3). A kitchen-floor heist:
   checkered tile, table-leg obstacles, and three environmental hazards —
   💧 water (heavy slow + HP drain), ⚡ outlet zap-zones (pulse on/off),
   🪤 mousetraps (telegraph, SNAP, re-arm) with rich food baited ON them.
   Enemies: beetles (sprite) + a couple of spiders. Deep in the far corner:
   the 🍬 sugar cube — a big one-shot colony deposit, guarded.
   Exit door (bottom-left) returns to the backyard.
   ============================================================ */

const HouseScene = {
  id: 'house',
  worldW: 3000, worldH: 2000,
  canDig: false,
  canBite: true,
  built: false,
  door: { x: 0, y: 0, r: 90 },
  props: [], items: [], enemies: [], hazards: [], obstacles: [],
  enemyRespawnT: 0,

  build() {
    this.worldW = 3000; this.worldH = 2000;
    this.door.x = 150; this.door.y = this.worldH - 130;

    // table legs: circular obstacles the ant (and bugs) walk around
    this.obstacles = [
      { x: this.worldW * 0.42, y: this.worldH * 0.30, r: 66 },
      { x: this.worldW * 0.62, y: this.worldH * 0.30, r: 66 },
      { x: this.worldW * 0.42, y: this.worldH * 0.62, r: 66 },
      { x: this.worldW * 0.62, y: this.worldH * 0.62, r: 66 },
    ];

    // hazards
    const Z = HAZARD;
    this.hazards = [
      { type: 'water', x: this.worldW * 0.22, y: this.worldH * 0.34, r: 120 },                    // spill by the bowl
      { type: 'water', x: this.worldW * 0.78, y: this.worldH * 0.72, r: 95 },
      { type: 'zap',  x: this.worldW * 0.88, y: this.worldH * 0.18, r: Z.zap.radius * CELL, phase: 0.0 },
      { type: 'zap',  x: this.worldW * 0.52, y: this.worldH * 0.88, r: Z.zap.radius * CELL, phase: 1.4 },
      { type: 'trap', x: this.worldW * 0.30, y: this.worldH * 0.76, state: 'armed', tT: 0 },
      { type: 'trap', x: this.worldW * 0.72, y: this.worldH * 0.46, state: 'armed', tT: 0 },
      { type: 'trap', x: this.worldW * 0.90, y: this.worldH * 0.34, state: 'armed', tT: 0 },      // guards the sugar
    ];

    // collectibles: rich crumbs, a few dew drips — and the baited traps
    this.items = [];
    const C = HOUSE_THEME.counts;
    const clearOf = (x, y) =>
      Math.hypot(x - this.door.x, y - this.door.y) > CELL * 4 &&
      this.obstacles.every(o => Math.hypot(x - o.x, y - o.y) > o.r + 30);
    const scatter = (kind, n, seed, subPick) => {
      for (let i = 0; i < n; i++) {
        let x, y, tries = 0;
        do {
          x = 120 + hash01(seed + i * 1.37 + tries * 0.11) * (this.worldW - 240);
          y = 120 + hash01(seed + i * 2.53 + tries * 0.19 + 7) * (this.worldH - 240);
          tries++;
        } while (!clearOf(x, y) && tries < 12);
        this.items.push({ kind, sub: subPick(i), x, y, taken: false, respawnT: 0, bob: hash01(seed + i * 5.7) * 6.28 });
      }
    };
    scatter('food',  C.food,  1301, i => (hash01(1301 + i * 9.1) < 0.6 ? 'crumb' : 'seed'));
    scatter('water', C.water, 1411, () => 'dew');
    // bait: a rich crumb ON each trap plate (greed vs. the snap)
    for (const hz of this.hazards) if (hz.type === 'trap') {
      this.items.push({ kind: 'food', sub: 'crumb', x: hz.x, y: hz.y - 6, taken: false, respawnT: 0, bob: Math.random() * 6, bait: true });
    }
    // 🍬 the sugar cube — far corner, behind the zap + trap
    this.items.push({ kind: 'food', sub: 'sugar', x: this.worldW * 0.93, y: this.worldH * 0.12, taken: false, respawnT: 0, bob: 0 });

    // enemies: beetles + a couple of spiders
    this.enemies = []; this.enemyRespawnT = 0;
    for (const grp of HOUSE_THEME.enemies) {
      for (let i = 0; i < grp.count; i++) { const p = this.spawnPos(0); this.enemies.push(spawnEnemy(grp.type, p.x, p.y)); }
    }
  },

  spawnPos(minAntCells) {
    let x, y, tries = 0;
    const ok = (x, y) =>
      Math.hypot(x - this.door.x, y - this.door.y) > 320 &&
      this.obstacles.every(o => Math.hypot(x - o.x, y - o.y) > o.r + 20) &&
      (minAntCells <= 0 || Math.hypot(x - ant.x, y - ant.y) > minAntCells * CELL);
    do {
      x = 100 + Math.random() * (this.worldW - 200);
      y = 100 + Math.random() * (this.worldH - 200);
      tries++;
    } while (tries < 40 && !ok(x, y));
    return { x, y };
  },

  enter(from) {
    ant.x = this.door.x + this.door.r + 40; ant.y = this.door.y;   // slipped in under the door
    ant.vx = ant.vy = 0; ant.angle = 0;
  },

  resolveCollision() {
    // circular table legs: push the ant out
    for (const o of this.obstacles) {
      const dx = ant.x - o.x, dy = ant.y - o.y, d = Math.hypot(dx, dy);
      if (d < o.r + ant.r && d > 0.001) {
        const push = o.r + ant.r - d;
        ant.x += dx / d * push; ant.y += dy / d * push;
        const vn = (ant.vx * dx + ant.vy * dy) / (d * d);
        if (vn < 0) { ant.vx -= vn * dx; ant.vy -= vn * dy; }
      }
    }
  },

  update(dt) {
    // forage (rich pickings) — sugar is the jackpot
    updateCollectibles(this.items, dt, it => {
      if (it.sub === 'sugar') {
        addFood(HOUSE_THEME.sugar.refill);
        depositFood(HOUSE_THEME.sugar.colonyBonus);
        it.respawnT = HOUSE_THEME.sugar.respawnSec;
        burstSpark(it.x, it.y);
        banner = { text: '🍬 Sugar! +' + HOUSE_THEME.sugar.colonyBonus + ' colony food!', t: 3.0 };
      } else if (it.kind === 'food') {
        const amt = it.noRespawn ? COMBAT.drop.refill : HOUSE_THEME.food.refill;
        addFood(amt); if (!it.noRespawn) it.respawnT = HOUSE_THEME.food.respawnSec; else it.gone = true;
        depositFood(COLONY.scoutForageBonus);
        pickupSparkle(it.x, it.y, '#ffd27a'); banner = { text: '+' + amt + ' 🍖', t: 1.2 };
      } else {
        addWater(HOUSE_THEME.water.refill); it.respawnT = HOUSE_THEME.water.respawnSec;
        pickupSparkle(it.x, it.y, '#8fe0ff'); banner = { text: '+' + HOUSE_THEME.water.refill + ' 💧', t: 1.2 };
      }
    }, HOUSE_THEME.pickupRadius);
    if (this.items.some(i => i.gone)) this.items = this.items.filter(i => !i.gone);

    this.updateHazards(dt);

    // enemies (mixed types) — keep them out of the table legs
    updateEnemies(this.enemies, dt, { bounds: { w: this.worldW, h: this.worldH } });
    for (const e of this.enemies) {
      for (const o of this.obstacles) {
        const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy);
        const er = ENEMY_TYPES[e.type].r;
        if (d < o.r + er && d > 0.001) { e.x = o.x + dx / d * (o.r + er); e.y = o.y + dy / d * (o.r + er); }
      }
    }
    if (input.dig) tryBite(this.enemies);

    // maintain the mixed population
    const want = HOUSE_THEME.enemies.reduce((a, g) => a + g.count, 0);
    if (this.enemies.length < want) {
      this.enemyRespawnT -= dt;
      if (this.enemyRespawnT <= 0) {
        this.enemyRespawnT = HOUSE_THEME.enemyRespawnSec;
        const have = {}; for (const e of this.enemies) have[e.type] = (have[e.type] || 0) + 1;
        const grp = HOUSE_THEME.enemies.find(g => (have[g.type] || 0) < g.count) || HOUSE_THEME.enemies[0];
        const p = this.spawnPos(ENEMY_TYPES[grp.type].detectRadius + 1);
        this.enemies.push(spawnEnemy(grp.type, p.x, p.y));
      }
    } else { this.enemyRespawnT = HOUSE_THEME.enemyRespawnSec; }
  },

  updateHazards(dt) {
    const Z = HAZARD;
    for (const hz of this.hazards) {
      if (hz.type === 'water') {
        if (Math.hypot(ant.x - hz.x, ant.y - hz.y) < hz.r) {
          ant.vx *= Z.water.slow; ant.vy *= Z.water.slow;              // wading
          if (!stats.dead) damage(Z.water.dps * dt, 'Drowning');
        }
      } else if (hz.type === 'zap') {
        hz.phase += dt;
        const cyc = Z.zap.onSec + Z.zap.offSec;
        hz.on = (hz.phase % cyc) < Z.zap.onSec;
        if (hz.on && ant.invuln <= 0 && Math.hypot(ant.x - hz.x, ant.y - hz.y) < hz.r) {
          damage(Z.zap.dmg, 'Electricity');
          ant.invuln = COMBAT.antIFrames; ant.hitFlash = COMBAT.hitFlashSec; dmgFlash = COMBAT.dmgFlashSec;
          const dx = ant.x - hz.x, dy = ant.y - hz.y, d = Math.hypot(dx, dy) || 1;
          ant.vx += dx / d * Z.zap.knock; ant.vy += dy / d * Z.zap.knock;
          shake = Math.min(12, shake + 7);
        }
      } else if (hz.type === 'trap') {
        const d = Math.hypot(ant.x - hz.x, ant.y - hz.y);
        if (hz.state === 'armed') {
          if (d < Z.trap.triggerR * CELL) { hz.state = 'telegraph'; hz.tT = Z.trap.telegraph; }
        } else if (hz.state === 'telegraph') {
          hz.tT -= dt;
          if (hz.tT <= 0) {                                            // SNAP!
            hz.state = 'sprung'; hz.tT = Z.trap.rearmSec;
            burstDirt(hz.x, hz.y); shake = Math.min(14, shake + 10);
            if (d < Z.trap.snapR * CELL && ant.invuln <= 0) {
              damage(Z.trap.dmg, 'A mousetrap');
              ant.invuln = COMBAT.antIFrames; ant.hitFlash = COMBAT.hitFlashSec; dmgFlash = COMBAT.dmgFlashSec;
              const dx = ant.x - hz.x, dy = ant.y - hz.y, dd = Math.hypot(dx, dy) || 1;
              ant.vx += dx / dd * Z.trap.knock; ant.vy += dy / dd * Z.trap.knock;
            }
          }
        } else if (hz.state === 'sprung') {
          hz.tT -= dt; if (hz.tT <= 0) hz.state = 'armed';             // quietly re-arms
        }
      }
    }
  },

  draw() { drawHouse(this); },

  actionPrompt() {
    const d = Math.hypot(ant.x - this.door.x, ant.y - this.door.y);
    return d < this.door.r + 40 ? { label: '🚪 Back outside', to: 'surface' } : null;
  },
};

function drawHouse(s) {
  const day = weather.isDay;
  const G = HOUSE_THEME.ground, TS = G.tileSize;

  // checkered vinyl tile (culled to viewport)
  const mx0 = cam.x - W / 2 - TS, mx1 = cam.x + W / 2 + TS, my0 = cam.y - H / 2 - TS, my1 = cam.y + H / 2 + TS;
  for (let gx = Math.floor(mx0 / TS) * TS; gx < mx1; gx += TS) {
    for (let gy = Math.floor(my0 / TS) * TS; gy < my1; gy += TS) {
      const even = (((gx / TS) | 0) + ((gy / TS) | 0)) % 2 === 0;
      ctx.fillStyle = even ? G.tileA : G.tileB;
      ctx.fillRect(w2sX(gx), w2sY(gy), TS + 1, TS + 1);
    }
  }
  // baseboard border along the world edges
  ctx.fillStyle = G.baseboard;
  if (cam.y - H / 2 < 40) ctx.fillRect(0, w2sY(0), W, 26);
  if (cam.y + H / 2 > s.worldH - 40) ctx.fillRect(0, w2sY(s.worldH) - 26, W, 26);
  if (cam.x - W / 2 < 40) ctx.fillRect(w2sX(0), 0, 26, H);
  if (cam.x + W / 2 > s.worldW - 40) ctx.fillRect(w2sX(s.worldW) - 26, 0, 26, H);

  const near = (x, y) => x >= mx0 && x <= mx1 && y >= my0 && y <= my1;

  // exit door (gap under the back door + mat)
  if (near(s.door.x, s.door.y)) {
    const dx2 = w2sX(s.door.x), dy2 = w2sY(s.door.y);
    ctx.fillStyle = '#5a4630'; ctx.fillRect(dx2 - 60, dy2 - 90, 46, 180);
    ctx.fillStyle = '#1a140e'; ctx.fillRect(dx2 - 60, dy2 - 12, 46, 24);
    ctx.fillStyle = '#7a6a4a'; ctx.beginPath(); ctx.ellipse(dx2 + 16, dy2, 26, 40, 0, 0, 7); ctx.fill();
  }

  // hazards (under items/enemies)
  for (const hz of s.hazards) {
    if (!near(hz.x, hz.y)) continue;
    const hx = w2sX(hz.x), hy = w2sY(hz.y);
    if (hz.type === 'water') {
      ctx.fillStyle = 'rgba(70,140,200,.42)';
      ctx.beginPath(); ctx.ellipse(hx, hy, hz.r, hz.r * 0.72, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(160,215,255,.30)';
      ctx.beginPath(); ctx.ellipse(hx - hz.r * 0.25, hy - hz.r * 0.18, hz.r * 0.4, hz.r * 0.2, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(120,180,230,.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(hx, hy, hz.r * (0.75 + 0.05 * Math.sin(t * 2)), hz.r * 0.55, 0, 0, 7); ctx.stroke();
    } else if (hz.type === 'zap') {
      // outlet plate on the wall side + danger circle when live
      ctx.fillStyle = '#ded8c8'; ctx.fillRect(hx - 12, hy - 18, 24, 36);
      ctx.fillStyle = '#555'; ctx.fillRect(hx - 4, hy - 10, 3, 8); ctx.fillRect(hx + 2, hy - 10, 3, 8);
      ctx.fillRect(hx - 4, hy + 3, 3, 8); ctx.fillRect(hx + 2, hy + 3, 3, 8);
      const cyc = HAZARD.zap.onSec + HAZARD.zap.offSec, ph = hz.phase % cyc;
      const preflicker = ph > cyc - 0.3;                     // warning before it goes live
      if (hz.on || preflicker) {
        const a = hz.on ? 0.28 + 0.12 * Math.sin(t * 30) : 0.10;
        ctx.fillStyle = `rgba(255,240,80,${a})`;
        ctx.beginPath(); ctx.arc(hx, hy, hz.r, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,160,${hz.on ? 0.9 : 0.35})`; ctx.lineWidth = 2;
        for (let k = 0; k < (hz.on ? 5 : 2); k++) {          // little lightning arcs
          const a0 = hash01(k * 3.7 + ((t * 8) | 0)) * 6.28;
          let px = hx, py = hy;
          ctx.beginPath(); ctx.moveTo(px, py);
          for (let sgm = 0; sgm < 4; sgm++) {
            px += Math.cos(a0 + (hash01(k + sgm + t) - 0.5)) * hz.r * 0.28;
            py += Math.sin(a0 + (hash01(k * 2 + sgm + t) - 0.5)) * hz.r * 0.28;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
    } else if (hz.type === 'trap') {
      const jig = hz.state === 'telegraph' ? Math.sin(t * 60) * 2 : 0;   // shudder before the SNAP
      ctx.save(); ctx.translate(hx + jig, hy);
      ctx.fillStyle = '#a5763e'; ctx.fillRect(-34, -22, 68, 44);          // wood base
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.strokeRect(-34, -22, 68, 44);
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 4;                     // the bar
      if (hz.state === 'sprung') { ctx.beginPath(); ctx.moveTo(-30, 14); ctx.lineTo(30, 14); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(-30, -16); ctx.lineTo(30, -16); ctx.stroke();
             ctx.strokeStyle = '#c8ccd2'; ctx.lineWidth = 2;
             ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 6); ctx.stroke(); }   // the catch
      ctx.restore();
    }
  }

  // collectibles
  for (const it of s.items) { if (!it.taken && near(it.x, it.y)) drawItem(it, w2sX(it.x), w2sY(it.y)); }

  // table legs (obstacles) — round wooden feet with shadow
  for (const o of s.obstacles) {
    if (!near(o.x, o.y)) continue;
    const ox = w2sX(o.x), oy = w2sY(o.y);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(ox, oy + 10, o.r * 1.05, o.r * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.arc(ox, oy, o.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#7d5a36'; ctx.beginPath(); ctx.arc(ox - o.r * 0.2, oy - o.r * 0.2, o.r * 0.7, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ox, oy, o.r, 0, 7); ctx.stroke();
  }

  drawEnemies(s.enemies);
  drawAnt();

  // indoor light: warmer, dimmer at night
  if (!day) { ctx.fillStyle = 'rgba(30,22,10,.35)'; ctx.fillRect(0, 0, W, H); }
  // sparkles (skip drawSurfaceFx's precip — no rain indoors!)
  for (const p of sparks) { const sx = w2sX(p.x), sy = w2sY(p.y); ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillStyle = p.col; ctx.fillRect(sx | 0, sy | 0, 2, 2); }
  ctx.globalAlpha = 1;
}

registerScene(HouseScene);
