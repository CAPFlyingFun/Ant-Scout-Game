/* ============================================================
   state.js — shared mutable game state (declared once here)
   ============================================================ */

// viewport
let W = 0, H = 0, DPR = 1;

// depth meter
let unitIx = 0;               // index into UNITS
let maxDepthMM = 0;           // deepest the ant has reached this run

// world buffers + entities (assigned in genWorld)
let grid, hp, seen;           // grid: 1 dirt / 0 open ; hp: dig progress per cell ; seen: fog memory
let pebbles, treasure, home;

// the scout
const ant = { x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, r: 9, legT: 0, carry: null, hasGem: false };

// camera
const cam = { x: 0, y: 0 };

// input
const input = { moveX: 0, moveY: 0, dig: false, carryEdge: false };
const keys = {};
const pointers = new Map();    // pointerId -> role
let joy = { active: false, baseX: 0, baseY: 0, kx: 0, ky: 0, R: 60, id: -1 };
let joyRest = { x: 0, y: 0 };
let ui = null;

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
