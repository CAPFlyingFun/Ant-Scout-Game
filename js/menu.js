/* ============================================================
   menu.js — main menu + settings overlays (HTML UI over the canvas)
   Loaded after render.js, before main.js.
   ============================================================ */

const $ = id => document.getElementById(id);
let prevScreen = 'menu';

function showScreen(s) {
  gameScreen = s;
  $('menu').classList.toggle('hidden', s !== 'menu');
  $('settings').classList.toggle('hidden', s !== 'settings');
  const co = $('colony'); if (co) co.classList.toggle('hidden', s !== 'colony');       // colony stats panel
  const pr = $('progress'); if (pr) pr.classList.toggle('hidden', s !== 'progress');   // 🏆 progress panel
  const pz = $('pause'); if (pz) pz.classList.toggle('hidden', s !== 'pause');          // ⏸ pause hub
  const mp = $('map'); if (mp) mp.classList.toggle('hidden', s !== 'map');              // 🗺️ map / travel
  $('btnPause').classList.toggle('hidden', s !== 'playing');
  const ec = $('editctrl'); if (ec) ec.classList.toggle('hidden', s !== 'editing');   // control-customize toolbar
  const act = $('btnAction'); if (act && s !== 'playing') act.classList.add('hidden');   // door button only in-game
  if (typeof hideDeath === 'function') hideDeath();          // never leave the death overlay up on a live screen
  if (s === 'settings') refreshSettingsUI();
  if (s === 'menu') updateMenuText();
  if (s === 'editing') syncEditUI();
  if (s === 'colony') refreshColonyUI();
  if (s === 'progress') refreshProgressUI();
  if (s === 'map') refreshMapUI();
}
function openSettings() { prevScreen = (gameScreen === 'playing' || gameScreen === 'pause') ? gameScreen : 'menu'; showScreen('settings'); }

// the in-game ⏸ hub — reachable from the corner ☰ during play
function openPause() { showScreen('pause'); }

// 🏆 Upgrades opens from the main menu OR the pause hub; close returns to the opener
let progressReturn = 'menu';
function openProgress() { progressReturn = (gameScreen === 'pause') ? 'pause' : 'menu'; showScreen('progress'); }

// areas for the 🗺️ map/travel page (surface is the hub; park/house are unlock-gated)
const MAP_AREAS = [
  { id: 'surface',     label: '🌿 Backyard' },
  { id: 'underground', label: '🕳️ Underground' },
  { id: 'park',        label: '🌳 The Park',  unlock: 'park' },
  { id: 'house',       label: '🏠 The House', unlock: 'house' },
];
function refreshMapUI() {
  const wrap = $('mapList'); if (!wrap) return;
  wrap.innerHTML = '';
  for (const a of MAP_AREAS) {
    const unlocked = !a.unlock || isUnlocked(a.unlock);
    const here = scene && scene.id === a.id;
    const row = document.createElement('div');
    row.className = 'colrow' + (unlocked ? '' : ' locked-row');
    const right = here ? '<b>📍 Here</b>'
      : unlocked ? '<button class="mapgo" data-to="' + a.id + '">Travel</button>'
      : '<b>🔒 ' + winsUntil(a.unlock) + ' 💎</b>';
    row.innerHTML = '<span>' + a.label + '</span>' + right;
    wrap.appendChild(row);
  }
  wrap.querySelectorAll('.mapgo').forEach(b => b.onclick = () => { gotoScene(b.dataset.to); showScreen('playing'); });
}

// colony stats panel (read-only in 5A) — tapping the anthill pauses to show it
function openColony() { if (gameScreen === 'playing') showScreen('colony'); }
function refreshColonyUI() {
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('colFood', Math.floor(colony.food));
  set('colPop', colony.population + ' / ' + COLONY.maxAnts);
  set('colNest', Math.ceil(colony.nestHp) + ' / ' + colony.nestHpMax);
  set('colTotal', colony.totalCollected);
  set('colHatch', Math.floor(colony.food) + ' / ' + COLONY.foodPerAnt);
  // 5B role split — foragers are the remainder after soldiers/builders
  const pop = colony.population;
  const s = clamp(colony.jobs.soldier | 0, 0, pop);
  const b = clamp(colony.jobs.builder | 0, 0, pop - s);
  set('colForagers', pop - s - b);
  set('colSoldiers', s);
  set('colBuilders', b);
}

// 🏆 progress panel: gems won, the milestone chain, and (once unlocked) skin swatches
function refreshProgressUI() {
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('prGems', '💎 ' + progress.wins);
  const list = $('prMilestones');
  if (list) {
    list.innerHTML = '';
    for (const m of PROGRESSION.milestones) {
      const row = document.createElement('div');
      row.className = 'colrow' + (isUnlocked(m.id) ? '' : ' locked-row');
      row.innerHTML = '<span>' + m.label + '</span><b>' + (isUnlocked(m.id) ? '✓' : '🔒 ' + m.wins + ' 💎') + '</b>';
      list.appendChild(row);
      const d = document.createElement('div'); d.className = 'jobhint'; d.style.textAlign = 'left'; d.textContent = m.desc;
      list.appendChild(d);
    }
  }
  const sk = $('prSkins');
  if (sk) {
    sk.innerHTML = '';
    const open = isUnlocked('skins');
    PROGRESSION.skins.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (progress.skin === i ? ' active' : '') + (open ? '' : ' disabled');
      b.style.background = s.col; b.title = s.name;
      b.onclick = () => { if (!open) return; progress.skin = i; saveProgress(); refreshProgressUI(); };
      sk.appendChild(b);
    });
    $('prSkinLabel').textContent = open ? 'Scout colour' : 'Scout colour · 🔒 win 2 💎';
  }
}

function setActive(containerId, attr, val) {
  document.querySelectorAll('#' + containerId + ' .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset[attr] === String(val)));
}
function refreshSettingsUI() {
  setActive('segMode', 'mode', env.mode);
  setActive('segTime', 'day', env.isDay);
  setActive('segKind', 'kind', env.kind);
  $('livePanel').classList.toggle('hidden', env.mode !== 'live');
  $('manualPanel').classList.toggle('hidden', env.mode !== 'manual');
  const loc = loadLocation();
  $('locLine').textContent = loc ? ('Saved: ' + (loc.place || (loc.lat.toFixed(2) + ', ' + loc.lon.toFixed(2)))) : 'No saved location';
}
function updateMenuText() {
  const el = $('menuWx'); if (!el) return;
  const icon = wmoIcon(weather.code, weather.isDay);
  el.textContent = icon + ' ' + (weather.tempF != null ? weather.tempF + '°F · ' : '') + weather.label + (weather.place ? ' · ' + weather.place : '');
}

function wireMenu() {
  const ver = $('ver'); if (ver) ver.textContent = APP_VERSION;
  $('btnPlay').onclick     = () => { newGame(); showScreen('playing'); };   // fresh worlds, start underground
  $('btnSettings').onclick = openSettings;
  const bp = $('btnProgress'); if (bp) bp.onclick = () => openProgress();
  const bpc = $('btnProgressClose'); if (bpc) bpc.onclick = () => showScreen(progressReturn);
  $('btnPause').onclick    = openPause;                       // corner ☰ -> in-game pause hub

  // pause hub
  const bR = $('btnResume');        if (bR) bR.onclick = () => showScreen('playing');
  const bM = $('btnPauseMap');      if (bM) bM.onclick = () => showScreen('map');
  const bU = $('btnPauseUpgrades'); if (bU) bU.onclick = () => openProgress();
  const bS = $('btnPauseSettings'); if (bS) bS.onclick = () => openSettings();
  const bQ = $('btnPauseQuit');     if (bQ) bQ.onclick = () => showScreen('menu');
  const bMc = $('btnMapClose');     if (bMc) bMc.onclick = () => showScreen('pause');
  $('btnBack').onclick     = () => showScreen(prevScreen);
  const act = $('btnAction'); if (act) act.onclick = () => {
    if (actionLocked) { banner = { text: '🔒 ' + (actionLockMsg || 'Locked'), t: 2.4 }; return; }
    if (actionTarget) gotoScene(actionTarget);
  };  // door (lock-aware)

  // colony panel: close + 5B role assignment (± steppers, clamped to population)
  const colClose = $('btnColonyClose'); if (colClose) colClose.onclick = () => showScreen('playing');
  document.querySelectorAll('#colony .jobbtn').forEach(btn => btn.onclick = () => {
    const job = btn.dataset.job, dd = +btn.dataset.d, pop = colony.population;
    let s = clamp(colony.jobs.soldier | 0, 0, pop), b = clamp(colony.jobs.builder | 0, 0, pop);
    if (job === 'soldier') s = clamp(s + dd, 0, pop - b);
    else                   b = clamp(b + dd, 0, pop - s);
    colony.jobs.soldier = s; colony.jobs.builder = b;
    refreshColonyUI();
  });

  // death overlay buttons
  $('btnRespawn').onclick  = () => { hideDeath(); resetStats(); newGame(); showScreen('playing'); };
  $('btnDeathMenu').onclick = () => { hideDeath(); resetStats(); showScreen('menu'); };

  // control customization (drag/resize editor)
  $('btnCustomize').onclick = () => startEditControls();
  $('btnEditDone').onclick  = () => showScreen('settings');
  $('btnEditReset').onclick = () => { resetControlLayout(currentOrient()); syncEditUI(); };
  $('editSize').oninput     = (e) => setEditSize(e.target.value);

  document.querySelectorAll('#segMode .seg-btn').forEach(b => b.onclick = () => {
    env.mode = b.dataset.mode; saveEnv();
    if (env.mode === 'manual') applyManualEnv(env.kind, env.isDay);
    else { const loc = loadLocation(); if (loc && navigator.onLine) fetchWeatherByCoords(loc.lat, loc.lon, loc.place); }
    refreshSettingsUI(); updateMenuText();
  });
  document.querySelectorAll('#segTime .seg-btn').forEach(b => b.onclick = () => {
    env.isDay = +b.dataset.day; saveEnv();
    if (env.mode === 'manual') applyManualEnv(env.kind, env.isDay);
    refreshSettingsUI(); updateMenuText();
  });
  document.querySelectorAll('#segKind .seg-btn').forEach(b => b.onclick = () => {
    env.kind = b.dataset.kind; env.mode = 'manual'; saveEnv();
    applyManualEnv(env.kind, env.isDay);
    refreshSettingsUI(); updateMenuText();
  });
  $('btnRandom').onclick = () => {
    const kinds = Object.keys(WEATHER_KINDS);
    env.kind = kinds[(Math.random() * kinds.length) | 0];
    env.isDay = Math.random() < 0.5 ? 0 : 1;
    env.mode = 'manual'; saveEnv(); applyManualEnv(env.kind, env.isDay);
    refreshSettingsUI(); updateMenuText();
  };
  $('btnGPS').onclick = () => setLocationViaGPS();
  $('btnZip').onclick = () => setLocationViaZip();

  window.addEventListener('online',  () => { if (env.mode === 'live') { const loc = loadLocation(); if (loc) fetchWeatherByCoords(loc.lat, loc.lon, loc.place); } });
  window.addEventListener('offline', () => { banner = { text: '📴 Offline', t: 2.2 }; });
}
