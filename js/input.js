/* ============================================================
   input.js — on-screen joystick + buttons, HUD taps, keyboard
   (event listeners are wired up in main.js)
   ============================================================ */

function uiLayout() {
  const pad = Math.max(70, Math.min(W, H) * 0.16);
  joy.R = Math.max(52, Math.min(W, H) * 0.11);
  // keep controls clear of side notches (landscape) and the home indicator (bottom)
  const bottom = H - pad - safeBottom;
  joyRest.x = pad + safeLeft; joyRest.y = bottom;
  return {
    digX: W - pad - safeRight, digY: bottom, digR: joy.R * 0.92,
    carryX: W - pad - safeRight - joy.R * 1.7, carryY: bottom + joy.R * 0.35, carryR: joy.R * 0.62,
  };
}

function hit(x, y, bx, by, r) { return (x - bx) ** 2 + (y - by) ** 2 <= r * r; }
function inRect(x, y, R) { return R && x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h; }

function onDown(e) {
  for (const p of (e.changedTouches ? e.changedTouches : [e])) {
    const id = p.identifier !== undefined ? p.identifier : 'mouse';
    const x = p.clientX, y = p.clientY;
    ui = uiLayout();
    if (inRect(x, y, depthPill)) { unitIx = (unitIx + 1) % UNITS.length; pointers.set(id, 'ui'); }
    else if (inRect(x, y, weather.chip)) { requestWeather(); pointers.set(id, 'ui'); }
    else if (scene && scene.canDig && hit(x, y, ui.digX, ui.digY, ui.digR)) {
      const now = performance.now();
      if (autoDig) {                                          // any tap while AUTO is on turns it off
        autoDig = false; lastDigTap = 0; banner = { text: 'Auto-dig off', t: 1.4 };
      } else if (autoDigUnlocked && now - lastDigTap < 350) { // double-tap locks it on
        autoDig = true; lastDigTap = 0; banner = { text: '⛏️ Auto-dig ON — tap DIG to stop', t: 2.4 };
      } else {
        lastDigTap = now;
      }
      pointers.set(id, 'dig'); input.dig = true;              // holding still digs manually
    }
    else if (scene && scene.canDig && hit(x, y, ui.carryX, ui.carryY, ui.carryR)) { pointers.set(id, 'carry'); input.carryEdge = true; }
    else if (x < W * 0.5 && !joy.active) {            // left half -> floating joystick
      joy.active = true; joy.id = id; joy.baseX = x; joy.baseY = y; joy.kx = x; joy.ky = y; pointers.set(id, 'joy');
    } else { pointers.set(id, 'none'); }
  }
  e.preventDefault();
}

function onMove(e) {
  for (const p of (e.changedTouches ? e.changedTouches : [e])) {
    const id = p.identifier !== undefined ? p.identifier : 'mouse';
    if (pointers.get(id) === 'joy') {
      let dx = p.clientX - joy.baseX, dy = p.clientY - joy.baseY;
      const d = Math.hypot(dx, dy) || 0.0001;
      if (d > joy.R) { dx = dx / d * joy.R; dy = dy / d * joy.R; }
      joy.kx = joy.baseX + dx; joy.ky = joy.baseY + dy;
      input.moveX = dx / joy.R; input.moveY = dy / joy.R;
    }
  }
  e.preventDefault();
}

function onUp(e) {
  for (const p of (e.changedTouches ? e.changedTouches : [e])) {
    const id = p.identifier !== undefined ? p.identifier : 'mouse';
    const role = pointers.get(id);
    if (role === 'joy') { joy.active = false; joy.id = -1; input.moveX = 0; input.moveY = 0; }
    if (role === 'dig') { input.dig = false; }
    pointers.delete(id);
  }
  e.preventDefault();
}

function readKeyboard() {
  let kx = 0, ky = 0;
  if (keys['a'] || keys['arrowleft']) kx -= 1;
  if (keys['d'] || keys['arrowright']) kx += 1;
  if (keys['w'] || keys['arrowup']) ky -= 1;
  if (keys['s'] || keys['arrowdown']) ky += 1;
  if (kx || ky) { const d = Math.hypot(kx, ky); input.moveX = kx / d; input.moveY = ky / d; }
  else if (!joy.active) { input.moveX = 0; input.moveY = 0; }
  input.dig = input.dig || !!(keys['j'] || keys[' ']);
  if (keys['k'] || keys['e']) { if (!input._carryKey) { input.carryEdge = true; input._carryKey = true; } }
  else input._carryKey = false;
}
