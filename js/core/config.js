/* ============================================================
   config.js — constants & pure helpers (loaded first)
   ============================================================ */

// app version (shown next to the menu title). Bump on each release.
const APP_VERSION = 'v0.7.1';

// world grid
const CELL = 30;              // world px per cell (chunky, zoomed-in)
const COLS = 70, ROWS = 120;
const surfaceRow = 10;
const WORLD_W = COLS * CELL, WORLD_H = ROWS * CELL;

// depth readout: 1 cell = 1 mm at the base scale; the meter converts to the chosen unit
const MM_PER_CELL = 1;
const UNITS = ['mm', 'cm', 'in'];
const UNIT_FACTOR = { mm: 1, cm: 0.1, in: 1 / 25.4 };   // multiply a millimetre value by this
const UNIT_DECIMALS = { mm: 0, cm: 1, in: 2 };

// ant tuning (feel)
const MOVE = { accel: 0.85, maxSpd: 3.4, friction: 0.80, turn: 0.22 };
const DIG  = { rate: 0.06, reach: 0.55 };

// surface theme as DATA — adding a second theme later = another entry like this,
// reusing the same collectible/prop pipeline (no new systems).
const SURFACE_THEME = {
  id: 'backyard',
  ground: { base: '#4e7a3a', tuftCols: ['#3f6b30', '#57853f', '#6b9a4a'] },   // grassy field palette
  counts: { food: 14, water: 8, rock: 22, twig: 14, flower: 16, tuft: 260 },  // how many of each to scatter
  food:  { refill: 34, respawnSec: 22 },   // each food pickup gives +34 food, respawns after 22s
  water: { refill: 30, respawnSec: 18 },   // each water pickup gives +30 water, respawns after 18s
  pickupRadius: 0.9,                        // cells — how close the ant must be to auto-collect
  enemies: { type: 'spider', count: 5, respawnSec: 14, safeRadius: 5 },  // live spiders; replace delay; safe cells around the anthill
};

// enemy types as DATA — a 2nd enemy later = another entry + spawning it.
const ENEMY_TYPES = {
  spider: {
    hp: 3,                 // bites to kill
    speed: 1.5,            // move speed (ant maxSpd ≈ 3.4, so the ant can outrun it)
    detectRadius: 7,       // cells — sees & starts chasing the ant
    loseRadius: 11,        // cells — gives up the chase (hysteresis so it doesn't flicker)
    attackRadius: 0.85,    // cells — close enough to bite the ant
    attackDamage: 14,      // HP per successful hit
    attackCooldown: 1.1,   // seconds between its hits
    r: 12,                 // body radius (bigger than the ant's 9)
    bodyCol: '#2b2b30', legCol: '#17171b', eyeCol: '#c0392b',
  },
  beetle: {                // household tank: slow, chunky, hits softer but takes 5 bites
    hp: 5,
    speed: 1.0,
    detectRadius: 6, loseRadius: 9,
    attackRadius: 0.9,
    attackDamage: 10,
    attackCooldown: 1.3,
    r: 11,
    sprite: true,          // drawn from the bug atlas (random colour per spawn)
    bodyCol: '#4a3626', legCol: '#241a10', eyeCol: '#c0392b',   // vector fallback tint
  },
};

// NPC worker ants — ambient wanderers on the surface (appearance only for now).
// Movement is a correlated random walk (persistent heading + noise + stop-and-go),
// the model real ants follow. Architected so a future 'forage' behavior can steer
// them toward food (seek nearest item) without changing the pipeline.
const NPC_ANTS = {
  count: 12,
  r: 5,                     // smaller than the player ant (r 9)
  speed: 1.0,               // base walk speed
  turnJitter: 0.13,         // per-step heading noise (radians)
  reorientEvery: [0.4, 1.5],// seconds between sharper reorientations
  reorientAmt: 1.1,         // radians magnitude of a reorientation
  pauseChance: 0.005,       // per-frame chance to briefly stop
  pauseDur: [0.3, 1.3],     // pause length range (seconds)
  homeNear: 0.008, homeFar: 0.05, homeRange: 950,  // gentle pull toward the colony (stronger past homeRange px)
  bodyCol: '#7a3a1e', legCol: '#3a1b0e',            // worker tint (distinct from the reddish player)
};

const COMBAT = {
  biteReach: 12,           // px added to (antR+enemyR) for a bite to connect
  biteArc: 1.3,            // radians; enemy must be roughly in FRONT of the ant to bite
  biteDamage: 1,           // per bite (spider hp 3 → 3 bites)
  biteCooldown: 0.32,      // seconds between the ant's bites
  antIFrames: 0.8,         // seconds of invulnerability after the ant is hit
  knockback: 6.5,          // impulse applied on any hit (to whoever got hit)
  hitFlashSec: 0.25,       // sprite flash duration on hit
  dmgFlashSec: 0.4,        // red screen-edge flash when the ANT is hit
  drop: { kind: 'food', sub: 'leaf', refill: 40, noRespawn: true },  // a killed spider drops this
};

// survival tuning — all rates PER SECOND (starting guesses; tune on device)
const SURVIVAL = {
  foodDrain: 0.35,       // food lost/sec during normal play      (~285s to empty from full)
  waterDrain: 0.5,       // water lost/sec                          (~200s to empty from full)
  hpStarve: 2.0,         // HP lost/sec while food OR water is at 0  (~50s grace to get home)
  hpRegen: 1.5,          // HP gained/sec while BOTH are above regenThreshold
  regenThreshold: 0.4,   // fraction of max food & water needed for HP to regen
  nestRefillFood: 8.0,   // food/sec regained inside the nest safe zone
  nestRefillWater: 8.0,  // water/sec regained inside the nest safe zone
  nestRadius: 2.5,       // cells from home that count as "at the nest"
  lowWarn: 0.25,         // fraction below which a bar pulses as a warning
};

// ── COLONY (Phase 5A) ─────────────────────────────────────────────
// The COLONY is a SECOND resource layer, kept strictly separate from the
// SCOUT's personal survival (stats.hp/food/water). It has its own shared food
// stockpile, a forager population that hatches from stored food, and nest HP.
// All values are tunable on device.
const COLONY = {
  maxAnts: 50,             // population cap
  startAnts: 3,            // foragers present at game start
  foodPerAnt: 25,          // stored food needed to hatch ONE new forager
  hatchCooldown: 4,        // seconds between hatches (paced, not an instant swarm)
  startFood: 0,            // colony stockpile at start
  nestHpMax: 200,
  nestRegen: 0.5,          // nest HP/sec regen when NO enemy is attacking it (slow self-heal)
  depositRadius: 2.2,      // cells from anthill where a forager (or the scout) deposits food
  scoutForageBonus: 4,     // colony food gained each time the SCOUT picks up a surface food item
  // nest fall (5B): still recoverable, but real stakes now that soldiers can defend
  nestFallFoodLoss: 0.5,   // fraction of stored food lost when the nest falls
  nestFallAntLoss: 0.3,    // fraction of population lost when the nest falls
  nestFallHpRefill: 0.35,  // nest HP restored to this fraction after a fall
};

// Forager = the default ant job. Built as a data-driven entity + a small state
// machine ('out'|'toFood'|'home'|'idle'). Phase 5B adds soldier/builder JOBS as
// a `job` field + behavior branch on the SAME ants array — see JOBS/SOLDIER/BUILDER.
const FORAGER = {
  speed: 1.6,              // slower than the scout (3.4) — background workers
  r: 6,                    // smaller than the scout ant (9) so the player reads as the "hero"
  wanderJitter: 1.8,       // radians of wander turn
  searchRadius: 9,         // cells — how far a roaming forager notices a food item
  carryValue: 12,          // food added to the colony stockpile per item delivered
  bodyCol: '#b0672f', bodyDk: '#8a4e22',   // distinct from the player ant (#c9542f)
  idleAtNestSec: 0.6,      // brief pause at the nest after depositing before heading out again
};

// ── ROLES (Phase 5B) ──────────────────────────────────────────────
// Jobs are BEHAVIORS on the same ants array (each ant has a `job`), NOT separate
// arrays. The player assigns how the population splits via the colony panel; a
// reconciler morphs foragers <-> soldiers/builders toward those targets (free —
// it's labour allocation, not hatching). Default split = all forager, so a run
// that never touches assignment behaves EXACTLY like 5A.
const JOBS = ['forager', 'soldier', 'builder'];

const SOLDIER = {
  speed: 2.2,             // faster than a forager (1.6), still < scout (3.4)
  r: 8,                   // bigger/tougher-looking than a forager (6)
  hp: 4,                  // soldiers take hits before dying
  patrolRadius: 6,        // cells around the nest it patrols when idle
  engageRadius: 8,        // cells — breaks off to fight a spider within this of itself OR the nest
  attackRadius: 0.9,      // cells — close enough to bite a spider
  attackDamage: 1,        // damage per bite to enemy hp (spider hp 3 -> 3 soldier hits)
  attackCooldown: 0.5,    // seconds between a soldier's bites
  knockback: 5,
  bodyCol: '#8a3520', bodyDk: '#5f2414',   // darker/reddish — distinct from forager & scout
};

const BUILDER = {
  speed: 1.7, r: 6,
  repairRate: 6,          // nest HP/sec added while a builder repairs at the nest
  repairRadius: 2.2,      // cells from the nest to count as "repairing"
  bodyCol: '#5a7a3a', bodyDk: '#3f5a28',   // greenish worker tint
};

// ── PROGRESSION (Phase 6) ─────────────────────────────────────────
// 💎 gems brought home = the progression currency. Milestones unlock in order.
// Persisted to localStorage so unlocks survive new games and app relaunches.
const PROGRESSION = {
  milestones: [
    { wins: 1, id: 'park',  label: '🌳 The Park',  desc: 'A wilder field beyond the gate — richer food, more spiders.' },
    { wins: 2, id: 'skins', label: '🎨 Ant skins', desc: 'Choose your scout\'s colour.' },
    { wins: 3, id: 'house', label: '🏠 The House', desc: 'Slip inside for a kitchen-floor heist. Mind the traps.' },
  ],
  skins: [                     // the SCOUT is hand-drawn (vector) — these recolour it
    { name: 'Crimson',  body: '#c9542f', dark: '#8f3a1e', hi: '#e88a5a', col: '#c9542f' },
    { name: 'Onyx',     body: '#3a3a42', dark: '#20202a', hi: '#5a5a66', col: '#3a3a42' },
    { name: 'Emerald',  body: '#3f8a4a', dark: '#276030', hi: '#7fd07a', col: '#3f8a4a' },
    { name: 'Sapphire', body: '#3a5ec9', dark: '#26408f', hi: '#7f9aee', col: '#3a5ec9' },
    { name: 'Amber',    body: '#d69a2e', dark: '#a06f1e', hi: '#f0c86a', col: '#d69a2e' },
    { name: 'Violet',   body: '#8a4ec9', dark: '#5f308f', hi: '#b98ae8', col: '#8a4ec9' },
  ],
};

// ── PARK theme (unlock #1) — same pipeline as the backyard, wilder tuning ──
const PARK_THEME = {
  id: 'park',
  ground: { base: '#3f6a33', tuftCols: ['#33592a', '#4a7a38', '#5f8f45'] },
  counts: { food: 20, water: 10, rock: 26, twig: 18, flower: 34, tuft: 320 },
  food:  { refill: 40, respawnSec: 20 },
  water: { refill: 34, respawnSec: 16 },
  pickupRadius: 0.9,
  enemies: { type: 'spider', count: 8, respawnSec: 12 },   // more spiders, no safe zone out here
};

// ── HOUSE theme (unlock #3) — the kitchen-floor heist ─────────────
const HOUSE_THEME = {
  id: 'house',
  ground: { tileA: '#cfc9b8', tileB: '#b8b2a0', tileSize: 140, baseboard: '#8a7a5e' },
  counts: { food: 10, water: 4 },
  food:  { refill: 50, respawnSec: 26 },     // richer crumbs in here
  water: { refill: 34, respawnSec: 20 },
  pickupRadius: 0.9,
  sugar: { refill: 40, colonyBonus: 150, respawnSec: 180 },   // 🍬 the grand prize (slow respawn)
  enemies: [ { type: 'beetle', count: 4 }, { type: 'spider', count: 2 } ],
  enemyRespawnSec: 16,
};

// ── environmental hazards (house) ─────────────────────────────────
const HAZARD = {
  water: { slow: 0.45, dps: 4 },                                   // wading: heavy slow + HP drain/sec
  zap:   { onSec: 1.1, offSec: 1.9, dmg: 18, radius: 2.4, knock: 9 },   // pulsing outlet zone (radius in cells)
  trap:  { triggerR: 1.4, snapR: 2.0, telegraph: 0.35, dmg: 45, rearmSec: 12, knock: 11 },  // 🪤
};

// ── bug (beetle) sprite atlas ─────────────────────────────────────
// rows: 0=brown 1=dark 2=green 3=red ; cols 0-2 = walk. Faces DOWN like the ants.
const BUG_SPRITE = { src: 'assets/bugs_atlas.png', cell: 64, walk: [0, 1, 2], fps: 8, scale: 4.2 };

// ── ant sprite atlas (pixel art) ──────────────────────────────────
// A normalized sheet: 6 cols x 4 rows of 64px cells. Cols 0-2 = WALK,
// 3-5 = CARRY. Rows = colour variants; each ant role maps to one row.
// Sprites face UP in the art; the blitter rotates them to ant.angle.
// If the image hasn't loaded, drawing falls back to the vector ants.
const ANT_SPRITE = {
  src: 'assets/ants_atlas.png',
  cell: 64, cols: 6, rows: 4,
  walk: [0, 1, 2], carry: [3, 4, 5],
  row: { scout: 1, forager: 0, soldier: 3, builder: 2 },  // red / brown / dark / green
  fps: 9,          // animation frames per second
  scale: 4.6,      // draw size = ant.r * scale (keeps the role size hierarchy)
};
// pure helpers (no state)
const idx = (cx, cy) => cy * COLS + cx;
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const hash01 = n => { const x = Math.sin(n * 127.1 + 0.7) * 43758.5453; return x - Math.floor(x); };
