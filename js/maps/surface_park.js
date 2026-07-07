/* ============================================================
   surface_park.js — 🌳 The Park (unlock #1). A wilder expedition map:
   richer food, more spiders, NO colony/anthill out here. Enter through the
   backyard's park gate; a gate at the bottom edge leads home. Reuses the
   theme-agnostic item/prop/enemy pipelines with PARK_THEME tuning.
   ============================================================ */

const ParkScene = {
  id: 'park',
  worldW: 3600, worldH: 2400,
  canDig: false,
  canBite: true,
  built: false,
  gate: { x: 0, y: 0, r: 90 },      // the way home (bottom edge)
  props: [], items: [], enemies: [], enemyRespawnT: 0,

  build() {
    this.worldW = 3600; this.worldH = 2400;
    this.gate.x = this.worldW * 0.5; this.gate.y = this.worldH - 110;
    const C = PARK_THEME.counts;

    this.props = [];
    const addProps = (kind, n, seed) => {
      for (let i = 0; i < n; i++) {
        const x = hash01(seed + i * 1.73 + 0.2) * this.worldW;
        const y = hash01(seed + i * 2.91 + 3.1) * this.worldH;
        this.props.push({ kind, x, y, s: 0.6 + hash01(seed + i * 7.31) * 1.1, rot: hash01(seed + i * 3.37) * 6.28, seed: i });
      }
    };
    addProps('tuft',   C.tuft,   711);
    addProps('rock',   C.rock,   731);
    addProps('twig',   C.twig,   747);
    addProps('flower', C.flower, 759);

    this.items = [];
    const foodSubs = ['crumb', 'seed', 'leaf'];
    const addItems = (kind, n, seed, subPick) => {
      for (let i = 0; i < n; i++) {
        let x, y, tries = 0;
        do {
          x = hash01(seed + i * 1.37 + tries * 0.11) * this.worldW;
          y = hash01(seed + i * 2.53 + tries * 0.19 + 7) * this.worldH;
          tries++;
        } while (Math.hypot(x - this.gate.x, y - this.gate.y) < CELL * 4 && tries < 10);
        this.items.push({ kind, sub: subPick(i), x, y, taken: false, respawnT: 0, bob: hash01(seed + i * 5.7) * 6.28 });
      }
    };
    addItems('food',  C.food,  801, i => foodSubs[(hash01(801 + i * 9.1) * 3) | 0]);
    addItems('water', C.water, 911, i => hash01(911 + i * 9.1) < 0.28 ? 'puddle' : 'dew');

    // spiders — more of them, and no safe zone out here
    this.enemies = []; this.enemyRespawnT = 0;
    const ec = PARK_THEME.enemies;
    for (let i = 0; i < ec.count; i++) { const p = this.spawnPos(0); this.enemies.push(spawnEnemy(ec.type, p.x, p.y)); }
  },

  spawnPos(minAntCells) {
    let x, y, tries = 0;
    do {
      x = 60 + Math.random() * (this.worldW - 120);
      y = 60 + Math.random() * (this.worldH - 120);
      tries++;
    } while (tries < 40 && ((Math.hypot(x - this.gate.x, y - this.gate.y) < 260) ||
             (minAntCells > 0 && Math.hypot(x - ant.x, y - ant.y) < minAntCells * CELL)));
    return { x, y };
  },

  enter(from) {
    ant.x = this.gate.x; ant.y = this.gate.y - this.gate.r - 40;   // a step inside the gate
    ant.vx = ant.vy = 0; ant.angle = -Math.PI / 2;                 // facing into the park
  },

  resolveCollision() { /* open field — world-edge clamp only */ },

  update(dt) {
    updateCollectibles(this.items, dt, it => {
      if (it.kind === 'food') {
        const amt = it.noRespawn ? COMBAT.drop.refill : PARK_THEME.food.refill;
        addFood(amt); if (!it.noRespawn) it.respawnT = PARK_THEME.food.respawnSec; else it.gone = true;
        depositFood(COLONY.scoutForageBonus);
        pickupSparkle(it.x, it.y, '#ffd27a'); banner = { text: '+' + amt + ' 🍖', t: 1.2 };
      } else {
        addWater(PARK_THEME.water.refill); it.respawnT = PARK_THEME.water.respawnSec;
        pickupSparkle(it.x, it.y, '#8fe0ff'); banner = { text: '+' + PARK_THEME.water.refill + ' 💧', t: 1.2 };
      }
    }, PARK_THEME.pickupRadius);
    if (this.items.some(i => i.gone)) this.items = this.items.filter(i => !i.gone);

    const ec = PARK_THEME.enemies;
    updateEnemies(this.enemies, dt, { bounds: { w: this.worldW, h: this.worldH } });
    if (input.dig) tryBite(this.enemies);

    if (this.enemies.length < ec.count) {
      this.enemyRespawnT -= dt;
      if (this.enemyRespawnT <= 0) {
        this.enemyRespawnT = ec.respawnSec;
        const p = this.spawnPos(ENEMY_TYPES[ec.type].detectRadius + 1);
        this.enemies.push(spawnEnemy(ec.type, p.x, p.y));
      }
    } else { this.enemyRespawnT = ec.respawnSec; }
  },

  draw() { drawPark(this); },

  actionPrompt() {
    const d = Math.hypot(ant.x - this.gate.x, ant.y - this.gate.y);
    return d < this.gate.r + 40 ? { label: '🏡 Back to the yard', to: 'surface' } : null;
  },
};

function drawPark(s) {
  const day = weather.isDay;
  ctx.fillStyle = PARK_THEME.ground.base; ctx.fillRect(0, 0, W, H);

  const mx0 = cam.x - W / 2 - 60, mx1 = cam.x + W / 2 + 60, my0 = cam.y - H / 2 - 60, my1 = cam.y + H / 2 + 60;
  const near = (x, y) => x >= mx0 && x <= mx1 && y >= my0 && y <= my1;

  drawGroundSpeckle(mx0, mx1, my0, my1);
  for (const p of s.props) { if (near(p.x, p.y)) drawProp(p, w2sX(p.x), w2sY(p.y), PARK_THEME.ground.tuftCols); }

  // the gate home (two posts + crossbar)
  if (near(s.gate.x, s.gate.y)) {
    const gx = w2sX(s.gate.x), gy = w2sY(s.gate.y);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(gx, gy + 28, 64, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a5a30';
    ctx.fillRect(gx - 54, gy - 48, 12, 76); ctx.fillRect(gx + 42, gy - 48, 12, 76);
    ctx.fillStyle = '#8a6a3c'; ctx.fillRect(gx - 54, gy - 48, 108, 9);
  }

  for (const it of s.items) { if (!it.taken && near(it.x, it.y)) drawItem(it, w2sX(it.x), w2sY(it.y)); }

  drawEnemies(s.enemies);
  drawAnt();
  drawSurfaceFx(day);
}

registerScene(ParkScene);
