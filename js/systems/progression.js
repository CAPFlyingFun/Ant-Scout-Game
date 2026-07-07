/* ============================================================
   progression.js — Phase 6: gems-won progression + unlocks.
   ------------------------------------------------------------
   💎 Each dig win (gem brought home) advances progress.wins. Milestones in
   PROGRESSION.milestones unlock in order (park map, ant skins, house map).
   Everything persists to localStorage so unlocks survive new games and app
   relaunches. Maps check isUnlocked(id); the scout sprite reads scoutSkinRow().
   Loaded in the SYSTEMS block, before menu.js (which builds the Progress panel).
   ============================================================ */

function saveProgress() {
  try { localStorage.setItem('antscout.progress', JSON.stringify({
    wins: progress.wins, unlocked: progress.unlocked, skin: progress.skin })); } catch (e) {}
}

function loadProgress() {
  try {
    const s = JSON.parse(localStorage.getItem('antscout.progress'));
    if (s) {
      progress.wins = s.wins | 0;
      progress.unlocked = s.unlocked || {};
      progress.skin = (s.skin != null) ? Math.min(PROGRESSION.skins.length - 1, Math.max(0, s.skin | 0)) : 0;
    }
  } catch (e) {}
  applyMilestones(false);   // reconcile unlocks with the wins count (no banners)
}

function isUnlocked(id) { return !!progress.unlocked[id]; }
function scoutSkinRow() { return ANT_SPRITE.row.scout; }                 // (legacy; scout is vector now)
function scoutSkin() {                                                    // vector palette for the hand-drawn scout
  const i = isUnlocked('skins') ? progress.skin : 0;
  return PROGRESSION.skins[i] || PROGRESSION.skins[0];
}

// grant any milestones the wins count has reached; announce new ones if asked
function applyMilestones(announce) {
  let newest = '';
  for (const m of PROGRESSION.milestones) {
    if (progress.wins >= m.wins && !progress.unlocked[m.id]) {
      progress.unlocked[m.id] = true;
      newest = m.label;
    }
  }
  if (announce && newest) progress.lastUnlock = newest;
  return newest;
}

// called once at the moment the gem reaches home (underground win)
function recordWin() {
  progress.wins++;
  progress.lastUnlock = '';
  applyMilestones(true);
  saveProgress();
}

// how many more wins until the next locked milestone (for 🔒 door messages)
function winsUntil(id) {
  const m = PROGRESSION.milestones.find(x => x.id === id);
  return m ? Math.max(0, m.wins - progress.wins) : 0;
}
