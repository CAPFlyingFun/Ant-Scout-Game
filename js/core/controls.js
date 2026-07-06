/* ============================================================
   controls.js — customizable on-screen controls.
   Each thumb control (joystick / DIG / GRAB / door) has a saved position +
   size, with SEPARATE layouts for portrait and landscape. An in-settings edit
   mode lets you drag & resize them (CODM/PUBG style). Defaults reproduce the
   original hard-coded layout, so nothing changes until you customize.
   Loaded after input.js (owns uiLayout now); before menu.js/main.js.
   ============================================================ */

const CTRL_KEYS = ['joy', 'dig', 'grab', 'action'];
const CTRL_LABEL = { joy: 'Move', dig: 'DIG', grab: 'GRAB', action: 'Door' };

// per-orientation overrides: {} = all defaults; else { joy:{nx,ny,s}, ... }
let controlLayout = { portrait: {}, landscape: {} };
let editSelected = 'joy';
let editDrag = null;                 // { key, dx, dy } while dragging in edit mode

function currentOrient() { return W >= H ? 'landscape' : 'portrait'; }

function loadControlLayout() {
  try { const s = JSON.parse(localStorage.getItem('antscout.controls'));
        if (s && s.portrait && s.landscape) controlLayout = s; } catch (e) {}
}
function saveControlLayout() {
  try { localStorage.setItem('antscout.controls', JSON.stringify(controlLayout)); } catch (e) {}
}
function resetControlLayout(orient) { controlLayout[orient] = {}; saveControlLayout(); ensureLayout(orient); }

// default control centres (px) — matches the original layout so feel is unchanged
function defaultControlPositions() {
  const pad = Math.max(70, Math.min(W, H) * 0.16);
  const R = Math.max(52, Math.min(W, H) * 0.11);
  const bottom = H - pad - safeBottom;
  return {
    base: { joy: R, dig: R * 0.92, grab: R * 0.62, action: R * 0.7 },
    joy:    { x: pad + safeLeft,                y: bottom },
    dig:    { x: W - pad - safeRight,           y: bottom },
    grab:   { x: W - pad - safeRight - R * 1.7, y: bottom + R * 0.35 },
    action: { x: W / 2,                         y: bottom - R - 30 },
  };
}

// fill every key of an orientation from defaults (normalized) so it's editable
function ensureLayout(orient) {
  const d = defaultControlPositions();
  const L = controlLayout[orient] || (controlLayout[orient] = {});
  for (const k of CTRL_KEYS) if (!L[k]) L[k] = { nx: d[k].x / W, ny: d[k].y / H, s: 1 };
}

// resolve a control's pixel centre + radius (custom override or default)
function resolveControl(key, d) {
  const o = (controlLayout[currentOrient()] || {})[key];
  const s = o ? o.s : 1;
  return { x: o ? o.nx * W : d[key].x, y: o ? o.ny * H : d[key].y, r: d.base[key] * s, s };
}

// the single source of truth for where the controls are (used by input + render)
function uiLayout() {
  const d = defaultControlPositions();
  const j = resolveControl('joy', d), dg = resolveControl('dig', d), gr = resolveControl('grab', d), ac = resolveControl('action', d);
  joy.R = j.r;
  joyRest.x = j.x; joyRest.y = j.y;
  return {
    digX: dg.x, digY: dg.y, digR: dg.r,
    carryX: gr.x, carryY: gr.y, carryR: gr.r,
    actX: ac.x, actY: ac.y, actR: ac.r, actS: ac.s,
  };
}

// the joystick activates on the half of the screen its anchor sits on
function joyZoneHit(x, y) { return (joyRest.x < W / 2) ? x < W / 2 : x >= W / 2; }

// ---------- edit mode ----------
function editorControls() {
  const d = defaultControlPositions();
  return CTRL_KEYS.map(k => { const c = resolveControl(k, d); return { key: k, x: c.x, y: c.y, r: c.r }; });
}
function startEditControls() { ensureLayout(currentOrient()); editSelected = 'joy'; showScreen('editing'); }

function editorDown(e) {
  const p = e.changedTouches ? e.changedTouches[0] : e;
  const x = p.clientX, y = p.clientY;
  let best = null, bestD = Infinity;
  for (const c of editorControls()) {
    const dd = Math.hypot(x - c.x, y - c.y);
    if (dd < c.r * 1.3 && dd < bestD) { bestD = dd; best = c; }
  }
  if (best) { editSelected = best.key; editDrag = { key: best.key, dx: x - best.x, dy: y - best.y }; syncEditUI(); }
}
function editorMove(e) {
  if (!editDrag) return;
  const p = e.changedTouches ? e.changedTouches[0] : e;
  ensureLayout(currentOrient());
  const o = controlLayout[currentOrient()][editDrag.key];
  const r = defaultControlPositions().base[editDrag.key] * o.s;
  const minX = safeLeft + r, maxX = W - safeRight - r;
  const minY = safeTop + 104 + r, maxY = H - safeBottom - r;   // keep clear of the top edit bar
  o.nx = clamp(p.clientX - editDrag.dx, minX, maxX) / W;
  o.ny = clamp(p.clientY - editDrag.dy, minY, maxY) / H;
}
function editorUp() { if (editDrag) { editDrag = null; saveControlLayout(); } }

function setEditSize(v) {
  ensureLayout(currentOrient());
  controlLayout[currentOrient()][editSelected].s = clamp(+v || 1, 0.6, 1.6);
  saveControlLayout();
}

function syncEditUI() {
  ensureLayout(currentOrient());
  const o = document.getElementById('editOrient'); if (o) o.textContent = currentOrient() === 'landscape' ? 'Landscape' : 'Portrait';
  const sel = document.getElementById('editSel'); if (sel) sel.textContent = CTRL_LABEL[editSelected];
  const sz = document.getElementById('editSize'); if (sz) sz.value = controlLayout[currentOrient()][editSelected].s;
}

// draw the draggable control ghosts + selection highlight while editing
function drawControlsEditor() {
  ctx.fillStyle = 'rgba(6,5,4,.4)'; ctx.fillRect(0, 0, W, H);
  const d = defaultControlPositions();
  for (const k of CTRL_KEYS) {
    const c = resolveControl(k, d), sel = k === editSelected;
    ctx.globalAlpha = 1;
    ctx.fillStyle = sel ? 'rgba(224,164,74,.32)' : 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7); ctx.fill();
    ctx.strokeStyle = sel ? '#e0a44a' : 'rgba(255,255,255,.6)'; ctx.lineWidth = sel ? 3 : 2;
    ctx.setLineDash(sel ? [] : [6, 5]); ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(Math.min(c.r * 0.5, 15))}px -apple-system,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(CTRL_LABEL[k], c.x, c.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}
