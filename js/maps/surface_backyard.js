/* ============================================================
   surface_backyard.js — the surface overworld (top-down free-roam).
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
  npcAnts: [],                    // ambient wander ants (appearance)
  ants: [],                       // COLONY foragers (Phase 5A) — collect food & haul it to the nest

  build() {
    this.worldW = 3600; this.worldH = 2400;
    this.hill.x = this.worldW * 0.32;
    this.hill.y = this.worldH * 0.42;
    // travel landmarks (Phase 6): the park gate up in the top-right corner of the
    // yard, the house door on the right edge — walk to them to travel (if unlocked)
    this.parkGate = { x: this.worldW * 0.86, y: 120, r: 90 };
    this.houseDoor = { x: this.worldW - 90, y: this.worldH * 0.62, r: 90 };
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

    // --- ambient NPC worker ants — scattered, some near the colony ---
    this.npcAnts = [];
    for (let i = 0; i < NPC_ANTS.count; i++) {
      const near = i < NPC_ANTS.count * 0.4;   // a few linger near the anthill, the rest roam
      const x = near ? this.hill.x + (Math.random() - 0.5) * 400 : 60 + Math.random() * (this.worldW - 120);
      const y = near ? this.hill.y + (Math.random() - 0.5) * 400 : 60 + Math.random() * (this.worldH - 120);
      this.npcAnts.push(spawnNpcAnt(clamp(x, 40, this.worldW - 40), clamp(y, 40, this.worldH - 40)));
    }

    // --- COLONY foragers (Phase 5A) — the working colony, spawned at the nest ---
    colonyAnthill = { x: this.hill.x, y: this.hill.y };   // let updateColony() hatch here from any scene
    this.ants = [];
    for (let i = 0; i < COLONY.startAnts; i++) {
      this.ants.push(spawnForager(this.hill.x + (Math.random() * 2 - 1) * CELL * 1.5,
                                  this.hill.y + (Math.random() * 2 - 1) * CELL * 1.5));
    }
    colony.population = this.ants.length;
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
        depositFood(COLONY.scoutForageBonus);   // the scout's foraging also grows the colony stockpile
        pickupSparkle(it.x, it.y, '#ffd27a'); banner = { text: '+' + amt + ' 🍖', t: 1.2 }; }
      else                     { addWater(SURFACE_THEME.water.refill); it.respawnT = SURFACE_THEME.water.respawnSec;
        pickupSparkle(it.x, it.y, '#8fe0ff'); banner = { text: '+' + SURFACE_THEME.water.refill + ' 💧', t: 1.2 }; }
    });
    // drop items marked noRespawn are removed once collected (never come back)
    if (this.items.some(i => i.gone)) this.items = this.items.filter(i => !i.gone);

    // ambient NPC ants wander (appearance only — no collecting yet)
    updateNpcAnts(this.npcAnts, dt, { home: { x: this.hill.x, y: this.hill.y }, bounds: { w: this.worldW, h: this.worldH } });

    // COLONY ants: foragers gather, soldiers defend, builders repair (5B).
    // Hatching runs in the shared loop; reconciler (inside updateAnts) applies the player's role split.
    updateAnts(this.ants, dt, { x: this.hill.x, y: this.hill.y }, this.items, { w: this.worldW, h: this.worldH }, this.enemies);

    // combat: spider AI + the ant's bite (DIG button = BITE here).
    // safeRadius 0 so spiders CAN reach the nest; `defenders` lets a spider fight a soldier that intercepts it.
    const ec = SURFACE_THEME.enemies;
    updateEnemies(this.enemies, dt, { anthill: { x: this.hill.x, y: this.hill.y }, safeRadius: 0, bounds: { w: this.worldW, h: this.worldH }, defenders: this.ants });
    if (input.dig) tryBite(this.enemies);

    // a spider that reaches the anthill gnaws the nest on its attack cooldown (5A: proximity, no nest-seeking AI yet)
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ed = ENEMY_TYPES[e.type];
      if (Math.hypot(e.x - this.hill.x, e.y - this.hill.y) < this.hill.r + ed.attackRadius * CELL) {
        e.nestT = (e.nestT || 0) - dt;
        if (e.nestT <= 0) { e.nestT = ed.attackCooldown; damageNest(ed.attackDamage); }
      }
    }

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

  // doors: nearest in-range of — the anthill (down), the park gate, the house door.
  // Locked destinations return a 🔒 prompt; tapping shows how many gems remain.
  actionPrompt() {
    const cands = [];
    const dh = Math.hypot(ant.x - this.hill.x, ant.y - this.hill.y);
    if (dh < this.hill.r + 34) cands.push({ d: dh, p: { label: '🕳️ Enter anthill', to: 'underground' } });
    const dp = Math.hypot(ant.x - this.parkGate.x, ant.y - this.parkGate.y);
    if (dp < this.parkGate.r) cands.push({ d: dp, p: isUnlocked('park')
      ? { label: '🌳 To the park', to: 'park' }
      : { label: '🔒 Park', to: null, locked: true, msg: 'Win ' + winsUntil('park') + ' more 💎 to unlock the Park' } });
    const dd = Math.hypot(ant.x - this.houseDoor.x, ant.y - this.houseDoor.y);
    if (dd < this.houseDoor.r) cands.push({ d: dd, p: isUnlocked('house')
      ? { label: '🏠 Into the house', to: 'house' }
      : { label: '🔒 House', to: null, locked: true, msg: 'Win ' + winsUntil('house') + ' more 💎 to unlock the House' } });
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    return cands[0].p;
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

  drawGroundSpeckle(mx0, mx1, my0, my1);

  // props (behind collectibles), culled to the viewport
  for (const p of s.props) { if (near(p.x, p.y)) drawProp(p, w2sX(p.x), w2sY(p.y), cols); }

  // travel landmarks: park gate (two posts + worn path) and house door (step + mat)
  if (near(s.parkGate.x, s.parkGate.y)) {
    const gx = w2sX(s.parkGate.x), gy = w2sY(s.parkGate.y);
    ctx.fillStyle = 'rgba(80,60,30,.25)'; ctx.beginPath(); ctx.ellipse(gx, gy + 26, 60, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a5a30';
    ctx.fillRect(gx - 52, gy - 46, 12, 72); ctx.fillRect(gx + 40, gy - 46, 12, 72);
    ctx.fillStyle = '#8a6a3c'; ctx.fillRect(gx - 52, gy - 46, 104, 9);
    if (!isUnlocked('park')) { ctx.font = '20px -apple-system,sans-serif'; ctx.fillText('🔒', gx - 10, gy - 54); }
  }
  if (near(s.houseDoor.x, s.houseDoor.y)) {
    const hx2 = w2sX(s.houseDoor.x), hy2 = w2sY(s.houseDoor.y);
    ctx.fillStyle = '#9a8a6a'; ctx.fillRect(hx2 - 22, hy2 - 70, 60, 140);          // wall sliver
    ctx.fillStyle = '#5a4630'; ctx.fillRect(hx2 - 12, hy2 - 44, 40, 88);           // door
    ctx.fillStyle = '#2a2018'; ctx.fillRect(hx2 - 12, hy2 - 6, 40, 12);            // gap underneath
    ctx.fillStyle = '#7a6a4a'; ctx.beginPath(); ctx.ellipse(hx2 - 34, hy2, 22, 34, 0, 0, 7); ctx.fill();  // mat
    if (!isUnlocked('house')) { ctx.font = '20px -apple-system,sans-serif'; ctx.fillText('🔒', hx2 - 44, hy2 - 50); }
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

  drawAnts(s.ants);         // COLONY workers by job (foragers/soldiers/builders), behind the action
  drawNpcAnts(s.npcAnts);   // ambient worker ants
  drawEnemies(s.enemies);   // spiders on the ground, below the ant
  drawAnt();

  drawNestHpBar(hx, hy, r);                       // nest health over the mound (only when damaged / attacked)
  anthillTap = { x: hx - r, y: hy - r * 0.72, w: r * 2, h: r * 1.5 };   // tap the mound -> colony stats panel

  drawSurfaceFx(day);
}
