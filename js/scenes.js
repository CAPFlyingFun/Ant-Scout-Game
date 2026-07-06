/* ============================================================
   scenes.js — scene manager + shared movement + the shared update()/draw()
               loop + the contextual "door" button.
   ------------------------------------------------------------
   SHARED systems (movement, camera, input, weather, particles, HUD chrome)
   stay in the usual global files. Each SCENE is a plain object implementing
   the scene contract (build / enter / exit / update / draw / resolveCollision
   / drawHUD? / actionPrompt?) and owns its own world + entities.

   Adding a new scene later (e.g. the household map) = one more file that
   defines such an object + a single registerScene() call in main.js. Nothing
   in this file needs to change.
   ============================================================ */

const Scenes = {};
let scene = null;            // the active scene object
let actionTarget = null;     // door target for the contextual action button

function registerScene(s) { Scenes[s.id] = s; }

function gotoScene(id) {
  if (scene && scene.exit) scene.exit();
  const from = scene ? scene.id : null;
  scene = Scenes[id];
  if (!scene.built) { scene.build(); scene.built = true; }   // build ONCE — world state persists between visits
  digTarget = null; digProgress = 0; autoDig = false;         // clear stale dig highlight + auto-dig on room switch
  scene.enter(from);                                          // reposition the ant at this scene's entry point
  cam.x = ant.x; cam.y = ant.y;                               // snap camera — no glide between rooms
}

function newGame() {                                          // fresh start from the menu's Play button
  for (const k in Scenes) Scenes[k].built = false;            // discard every scene's world -> regenerate on entry
  won = false; intro = 1; banner = null;
  ant.carry = null; ant.hasGem = false;
  parts.length = 0; sparks.length = 0; dust.length = 0; shake = 0;
  resetStats();                                               // start every run at full HP / food / water
  scene = null;
  gotoScene('underground');
}

// Shared movement: accel / friction / turn / integrate — byte-for-byte the same
// feel in every scene. Digging and scene rules live in each scene's update().
function applyMovement(dt) {
  const mv = Math.hypot(input.moveX, input.moveY);
  if (mv > 0.08) {
    const mx = input.moveX / (mv || 1), my = input.moveY / (mv || 1);
    const throttle = Math.min(1, mv);
    ant.vx += mx * MOVE.accel * throttle;
    ant.vy += my * MOVE.accel * throttle;
    // turn toward the input direction gradually (shortest arc) rather than snapping
    const target = Math.atan2(input.moveY, input.moveX);
    let d = target - ant.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    ant.angle += d * MOVE.turn;
  }
  ant.vx *= MOVE.friction; ant.vy *= MOVE.friction;
  let sp = Math.hypot(ant.vx, ant.vy);
  const maxSpd = MOVE.maxSpd * (ant.carry ? 0.78 : 1);
  if (sp > maxSpd) { ant.vx = ant.vx / sp * maxSpd; ant.vy = ant.vy / sp * maxSpd; sp = maxSpd; }
  ant.x += ant.vx; ant.y += ant.vy;
  ant.x = clamp(ant.x, ant.r, scene.worldW - ant.r);          // world edges (scene decides its size)
  ant.y = clamp(ant.y, ant.r, scene.worldH - ant.r);
  ant.legT += sp * 0.09 + 0.02;                               // leg animation (shared)
}

function update(dt) {
  t += dt;

  // input: dig is recomputed each frame — held pointers OR locked auto-dig (dig scenes only)
  input.dig = !!(autoDig && scene && scene.canDig);
  for (const [id, role] of pointers) { if (role === 'dig') input.dig = true; }
  readKeyboard();

  // weather + wind tick every frame so the menu/settings backdrop stays alive
  updateWind(dt);
  updateWeather(dt);

  if (gameScreen !== 'playing') { decayFx(); return; }        // frozen behind menu/settings
  if (won) { decayFx(); updateCamera(); return; }             // win screen: no more sim
  if (intro > 0) intro = Math.max(0, intro - dt * 0.6);

  applyMovement(dt);           // shared movement/integrate
  scene.resolveCollision();    // scene blocks the ant against its own geometry
  scene.update(dt);            // scene sim: digging / entities / objective / door proximity
  updateStats(dt);             // survival drain / regen / nest refill (live play only)

  decayFx();
  updateCamera();              // clamps using scene.worldW / scene.worldH
}

function draw() {
  if (scene) scene.draw();                                    // active scene renders its own world + ant + atmosphere

  // shared lightning flash (weather) layers over whatever scene is showing
  if (weather.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${weather.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }

  if (gameScreen === 'playing') {
    drawUI();                                                 // joystick (+ DIG/GRAB when scene.canDig)
    drawWeatherChip();                                        // shared HUD chrome
    drawStats();                                              // shared HP / food / water bars (both scenes)
    drawBanner();
    depthPill = null;                                         // reset the tap target; the scene HUD repopulates it
    if (scene && scene.drawHUD) scene.drawHUD();              // scene-specific HUD (underground: objective + depth)
    if (intro > 0) drawIntro();
    if (won) drawWin();
  } else if (gameScreen === 'editing') {
    drawControlsEditor();                                     // draggable control ghosts for customization
  }
  drawActionButton();                                         // contextual door button (manages its own visibility)
}

// One shared contextual "door" button (HTML overlay). Each frame we ask the
// active scene for a prompt: { label, to } shows the button (tap -> gotoScene),
// null hides it.
function drawActionButton() {
  const btn = document.getElementById('btnAction');
  if (!btn) return;
  const p = (gameScreen === 'playing' && !won && scene && scene.actionPrompt) ? scene.actionPrompt() : null;
  if (p) {
    actionTarget = p.to;
    if (btn.textContent !== p.label) btn.textContent = p.label;
    const L = uiLayout();                                     // customizable position + size
    btn.style.left = L.actX + 'px';
    btn.style.top = L.actY + 'px';
    btn.style.transform = `translate(-50%,-50%) scale(${L.actS})`;
    btn.classList.remove('hidden');
  } else {
    actionTarget = null;
    btn.classList.add('hidden');
  }
}
