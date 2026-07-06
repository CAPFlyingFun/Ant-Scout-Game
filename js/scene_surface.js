/* ============================================================
   scene_surface.js — the surface overworld (top-down free-roam).
   Phase 3: an authored "backyard" theme (SURFACE_THEME) — a textured grassy
   field with collectible FOOD & WATER (which call the Phase 2 stat mutators)
   and decorative props. All content is DATA + a small generic pipeline, so a
   second theme later is just another SURFACE_THEME config reusing this code,
   and Phase 4 enemies can be another item array through the same proximity loop.
   ============================================================ */

// (updateCollectibles / pickupSparkle / drawItem live in props.js — the shared,
//  theme-agnostic item pipeline.)

const SurfaceScene = {
  id: 'surface',
  worldW: 3600, worldH: 2400,     // generous "huge" feel; the ant hits invisible edges here
  canDig: false,
  canBite: true,                  // the DIG button becomes BITE here (Phase 4 combat)
  built: false,
  hill: { x: 0, y: 0, r: 46 },    // anthill = the entry point AND the door back underground
  props: [],                      // non-interactive decoration
  items: [],                      // collectible food & water
  enemies: [],                    // spiders (Phase 4)
  enemyRespawnT: 0,

  build() {
    this.worldW = 3600; this.worldH = 2400;
    this.hill.x = this.worldW * 0.32;
    this.hill.y = this.worldH * 0.42;
    const C = SURFACE_THEME.counts;

    // --- decorative props (may sit near the anthill) ---
    this.props = [];
    const addProps = (kind, n, seed) => {
      for (let i = 0; i < n; i++) {
        const x = hash01(seed + i * 1.73 + 0.2) * this.worldW;
        const y = hash01(seed + i * 2.91 + 3.1) * this.worldH;
        this.props.push({ kind, x, y, s: 0.6 + hash01(seed + i * 7.31) * 0.9, rot: hash01(seed + i * 3.37) * 6.28, seed: i });
      }
    };
    addProps('tuft',   C.tuft,   11);
    addProps('rock',   C.rock,   31);
    addProps('twig',   C.twig,   47);
    addProps('flower', C.flower, 59);

    // --- collectibles (kept clear of the anthill so the nest area isn't a buffet) ---
    this.items = [];
    const foodSubs = ['crumb', 'seed', 'leaf'];
    const addItems = (kind, n, seed, subPick) => {
      for (let i = 0; i < n; i++) {
        let x, y, tries = 0;
        do {
          x = hash01(seed + i * 1.37 + tries * 0.11) * this.worldW;
          y = hash01(seed + i * 2.53 + tries * 0.19 + 7) * this.worldH;
          tries++;
        } while (Math.hypot(x - this.hill.x, y - this.hill.y) < CELL * 4 && tries < 10);
        this.items.push({ kind, sub: subPick(i), x, y, taken: false, respawnT: 0, bob: hash01(seed + i * 5.7) * 6.28 });
      }
    };
    addItems('food',  C.food,  101, i => foodSubs[(hash01(101 + i * 9.1) * 3) | 0]);
    addItems('water', C.water, 211, i => hash01(211 + i * 9.1) < 0.28 ? 'puddle' : 'dew');

    // --- spiders (Phase 4) — spawned outside the anthill safe radius ---
    this.enemies = []; this.enemyRespawnT = 0;
    const ec = SURFACE_THEME.enemies;
    for (let i = 0; i < ec.count; i++) { const p = this.spiderSpawnPos(0); this.enemies.push(spawnEnemy(ec.type, p.x, p.y)); }
  },

  // a valid spawn: inside bounds, clear of the anthill safe zone, and (optionally)
  // at least minAntCells from the ant so a respawn never lands on the player.
  spiderSpawnPos(minAntCells) {
    const safe = SURFACE_THEME.enemies.safeRadius * CELL + 40;
    let x, y, tries = 0;
    do {
      x = 60 + Math.random() * (this.worldW - 120);
      y = 60 + Math.random() * (this.worldH - 120);
      tries++;
    } while (tries < 40 && (Math.hypot(x - this.hill.x, y - this.hill.y) < safe ||
             (minAntCells > 0 && Math.hypot(x - ant.x, y - ant.y) < minAntCells * CELL)));
    return { x, y };
  },

  enter(from) {
    // spawn a step outside the anthill hole, clear of the door trigger
    ant.x = this.hill.x;
    ant.y = this.hill.y + this.hill.r + 48;
    ant.vx = ant.vy = 0; ant.angle = Math.PI / 2;   // facing away from the hill
  },

  resolveCollision() { /* bounds handled by the shared world-edge clamp; no obstacles in this theme */ },

  update(dt) {
    // forage: proximity auto-collect + respawn (generic pipeline)
    updateCollectibles(this.items, dt, it => {
      if (it.kind === 'food')  { const amt = it.noRespawn ? COMBAT.drop.refill : SURFACE_THEME.food.refill;
        addFood(amt); if (!it.noRespawn) it.respawnT = SURFACE_THEME.food.respawnSec; else it.gone = true;
        pickupSparkle(it.x, it.y, '#ffd27a'); banner = { text: '+' + amt + ' 🍖', t: 1.2 }; }
      else                     { addWater(SURFACE_THEME.water.refill); it.respawnT = SURFACE_THEME.water.respawnSec;
        pickupSparkle(it.x, it.y, '#8fe0ff'); banner = { text: '+' + SURFACE_THEME.water.refill + ' 💧', t: 1.2 }; }
    });
    // drop items marked noRespawn are removed once collected (never come back)
    if (this.items.some(i => i.gone)) this.items = this.items.filter(i => !i.gone);

    // combat: spider AI + the ant's bite (DIG button = BITE here)
    const ec = SURFACE_THEME.enemies;
    updateEnemies(this.enemies, dt, { anthill: { x: this.hill.x, y: this.hill.y }, safeRadius: ec.safeRadius, bounds: { w: this.worldW, h: this.worldH } });
    if (input.dig) tryBite(this.enemies);

    // maintain the spider population
    if (this.enemies.length < ec.count) {
      this.enemyRespawnT -= dt;
      if (this.enemyRespawnT <= 0) {
        this.enemyRespawnT = ec.respawnSec;
        const p = this.spiderSpawnPos(ENEMY_TYPES[ec.type].detectRadius + 1);   // not on top of the ant
        this.enemies.push(spawnEnemy(ec.type, p.x, p.y));
      }
    } else { this.enemyRespawnT = ec.respawnSec; }
  },

  draw() { drawSurface(this); },

  // door: within a small radius of the anthill hole -> go back underground
  actionPrompt() {
    const d = Math.hypot(ant.x - this.hill.x, ant.y - this.hill.y);
    return d < this.hill.r + 34 ? { label: '🕳️ Enter anthill', to: 'underground' } : null;
  },
  // (no isSafeZone — the surface replenishes via food/water sources, not a nest)
};

function drawSurface(s) {
  const day = weather.isDay;
  const cols = SURFACE_THEME.ground.tuftCols;

  // ground base
  ctx.fillStyle = SURFACE_THEME.ground.base;
  ctx.fillRect(0, 0, W, H);

  const mx0 = cam.x - W / 2 - 60, mx1 = cam.x + W / 2 + 60, my0 = cam.y - H / 2 - 60, my1 = cam.y + H / 2 + 60;
  const near = (x, y) => x >= mx0 && x <= mx1 && y >= my0 && y <= my1;

  // subtle deterministic ground speckle so the base isn't flat (culled to viewport)
  for (let gx = Math.floor(mx0 / 46) * 46; gx < mx1; gx += 46) {
    for (let gy = Math.floor(my0 / 46) * 46; gy < my1; gy += 46) {
      const h = hash01(gx * 0.13 + gy * 0.017);
      if (h < 0.55) continue;
      const sx = w2sX(gx + hash01(gx * 1.1 + gy) * 34 - 17), sy = w2sY(gy + hash01(gx + gy * 1.1) * 34 - 17);
      ctx.fillStyle = h < 0.8 ? 'rgba(0,0,0,.07)' : 'rgba(230,240,200,.06)';
      ctx.fillRect(sx | 0, sy | 0, 3, 3);
    }
  }

  // props (behind collectibles), culled to the viewport
  for (const p of s.props) {
    if (!near(p.x, p.y)) continue;
    const sx = w2sX(p.x), sy = w2sY(p.y);
    if (p.kind === 'tuft') {
      ctx.strokeStyle = cols[(p.seed % cols.length + cols.length) % cols.length]; ctx.lineWidth = 2; ctx.lineCap = 'round';
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

  // collectibles (skip taken), culled
  for (const it of s.items) {
    if (it.taken || !near(it.x, it.y)) continue;
    drawItem(it, w2sX(it.x), w2sY(it.y));
  }

  // anthill mound + entrance hole (the door)
  const hx = w2sX(s.hill.x), hy = w2sY(s.hill.y), r = s.hill.r;
  ctx.fillStyle = day ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.34)';
  ctx.beginPath(); ctx.ellipse(hx, hy + r * 0.5, r * 1.15, r * 0.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = day ? '#8a6238' : '#4a3623';
  ctx.beginPath(); ctx.ellipse(hx, hy, r, r * 0.72, 0, 0, 7); ctx.fill();
  ctx.fillStyle = day ? '#75512c' : '#3a2a1a';
  ctx.beginPath(); ctx.ellipse(hx, hy - 3, r * 0.82, r * 0.56, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#0a0705';
  ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.34, r * 0.26, 0, 0, 7); ctx.fill();

  drawEnemies(s.enemies);   // spiders on the ground, below the ant
  drawAnt();

  // pickup sparkles
  for (const p of sparks) { const sx = w2sX(p.x), sy = w2sY(p.y); ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillStyle = p.col; ctx.fillRect(sx | 0, sy | 0, 2, 2); }
  ctx.globalAlpha = 1;

  // night ambient tint over the whole scene
  if (!day) { ctx.fillStyle = 'rgba(12,20,46,.42)'; ctx.fillRect(0, 0, W, H); }

  // precipitation overlay (full screen for a top-down view)
  drawPrecip(H);
}
