/* ============================================================
   config.js — constants & pure helpers (loaded first)
   ============================================================ */

// app version (shown next to the menu title). Bump on each release.
const APP_VERSION = 'v0.3.0';

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
