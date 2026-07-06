/* ============================================================
   config.js — constants & pure helpers (loaded first)
   ============================================================ */

// app version (shown next to the menu title). Bump on each release.
const APP_VERSION = 'v0.4.0';

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

// pure helpers (no state)
const idx = (cx, cy) => cy * COLS + cx;
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const hash01 = n => { const x = Math.sin(n * 127.1 + 0.7) * 43758.5453; return x - Math.floor(x); };
