/* ============================================================
   state.js — shared mutable game state (declared once here)
   ============================================================ */

// viewport
let W = 0, H = 0, DPR = 1;
// safe-area insets (notch / status bar / home indicator) in CSS px
let safeTop = 0, safeLeft = 0, safeRight = 0, safeBottom = 0;

// screens + environment
let gameScreen = 'menu';                                   // 'menu' | 'settings' | 'playing' | 'dead'
const env = { mode: 'live', kind: 'clear', isDay: 1 };     // 'live' = real weather, 'manual' = chosen

// survival stats (shared across scenes; mutated only via survival.js hooks)
const stats = {
  hp: 100, hpMax: 100,
  food: 100, foodMax: 100,
  water: 100, waterMax: 100,
  dead: false, deathCause: '',
};

// depth meter
let unitIx = 0;               // index into UNITS
let maxDepthMM = 0;           // deepest the ant has reached this run

// world buffers + entities (assigned in genWorld)
let grid, hp, seen;           // grid: 1 dirt / 0 open ; hp: dig progress per cell ; seen: fog memory
let pebbles, treasure, home;

// the scout
const ant = { x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, r: 9, legT: 0, carry: null, hasGem: false,
  invuln: 0, hitFlash: 0, biteT: 0 };   // combat timers (i-frames / hit flash / bite cooldown)
let dmgFlash = 0;                        // red screen-edge flash when the ant takes damage

// camera
const cam = { x: 0, y: 0 };

// input
const input = { moveX: 0, moveY: 0, dig: false, carryEdge: false };
const keys = {};
const pointers = new Map();    // pointerId -> role
let joy = { active: false, baseX: 0, baseY: 0, kx: 0, ky: 0, R: 60, id: -1 };
let joyRest = { x: 0, y: 0 };
let ui = null;

// auto-dig: double-tap DIG to lock digging ON so you can steer hands-free
let autoDig = false;
let autoDigUnlocked = true;   // Phase 5 will gate this (e.g. unlock after N digs); true = available now
let lastDigTap = 0;           // performance.now() of the last DIG press, for double-tap detection

// particles + screen shake
const parts = [], sparks = [], dust = [];
let shake = 0, shakeX = 0, shakeY = 0;

// wind (grass sway); weather.js drives wind.base, updateWind gusts around it
const wind = { phase: 0, strength: 5, target: 5, base: 5, gustT: 0 };

// live weather (defaults = clear day so the scene looks right before any fetch)
const weather = {
  status: 'default',          // 'default' | 'loading' | 'ok' | 'error'
  code: 0, isDay: 1, windKmh: 8, tempF: null, precip: 0,
  label: 'Clear', place: '',
  precipType: 'none',         // 'none' | 'rain' | 'snow'
  storm: false, fog: false,
  sky: { top: [126, 200, 232], bot: [221, 238, 207], topT: [126, 200, 232], botT: [221, 238, 207] },
  rain: [], snow: [],
  flash: 0, flashT: 4,
  chip: null,                 // hit-test rect
};

// dig / carry
let digTarget = null, digProgress = 0;

// loop / mode
let won = false, intro = 1, t = 0;

// HUD hit-test state
let banner = null;
let depthPill = null;
let winBtn = null;
let anthillTap = null;        // screen rect of the surface anthill (tap -> colony stats panel)
let actionLocked = false;     // the contextual door button is showing a 🔒 prompt
let actionLockMsg = '';       // banner text explaining what unlocks it

// ── PROGRESSION (Phase 6) — persists via localStorage ─────────────
const progress = {
  wins: 0,                    // 💎 gems brought home (lifetime)
  unlocked: {},               // id -> true (park / skins / house)
  skin: 0,                    // index into PROGRESSION.skins (vector colour of the hand-drawn scout)
  lastUnlock: '',             // label shown on the win screen when something new unlocked
};

// ── COLONY economy (Phase 5A) ─────────────────────────────────────
// GLOBAL + persists across scenes (SEPARATE from the scout's stats). The forager
// ENTITIES live on the surface scene (SurfaceScene.ants); this is the economy.
const colony = {
  food: 0,                    // shared stockpile (NOT stats.food, which is the scout's hunger)
  population: 0,              // current forager count (mirrors the surface ants array for the HUD)
  nestHp: 0, nestHpMax: 0,    // set from COLONY on new game
  hatchT: 0,                  // hatch cooldown timer
  totalCollected: 0,          // lifetime food delivered (for the stats panel)
  underAttack: false,         // true while an enemy is damaging the nest (pauses regen, drives UI pulse)
  // Phase 5B — desired role counts (foragers = population - soldier - builder).
  // A reconciler morphs ants toward these each surface frame. Default = 0/0 = all forage (== 5A).
  jobs: { soldier: 0, builder: 0 },
};
