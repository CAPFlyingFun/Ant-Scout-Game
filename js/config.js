/* ============================================================
   config.js — constants & pure helpers (loaded first)
   ============================================================ */

// app version (shown next to the menu title). Bump on each release.
const APP_VERSION = 'v0.0.8';

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

// pure helpers (no state)
const idx = (cx, cy) => cy * COLS + cx;
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const hash01 = n => { const x = Math.sin(n * 127.1 + 0.7) * 43758.5453; return x - Math.floor(x); };
