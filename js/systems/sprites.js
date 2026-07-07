/* ============================================================
   sprites.js — pixel-art ant sprites (atlas blitter).
   ------------------------------------------------------------
   Loads assets/ants_atlas.png asynchronously and draws the right frame for a
   given role + state, rotated to face the ant's heading. Until the image is
   ready (or if it fails to load), drawAntSprite() returns false so callers fall
   back to the existing vector ants — nothing ever breaks offline / on a slow load.
   Loaded in the SYSTEMS block (before the draw loop starts in main.js).
   ============================================================ */

let antSheet = null, antSheetReady = false;
let bugSheet = null, bugSheetReady = false;

// guard: `Image` only exists in the browser (not in the headless test harness)
if (typeof Image !== 'undefined') {
  antSheet = new Image();
  antSheet.onload = () => { antSheetReady = true; };
  antSheet.onerror = () => { antSheetReady = false; };
  antSheet.src = ANT_SPRITE.src;
  bugSheet = new Image();
  bugSheet.onload = () => { bugSheetReady = true; };
  bugSheet.onerror = () => { bugSheetReady = false; };
  bugSheet.src = BUG_SPRITE.src;
}

// Draw an ant sprite. role: 'scout'|'forager'|'soldier'|'builder'.
// moving/carrying pick the animation; angle is the heading (0 = +x); sizePx is
// the on-screen size; flash draws a white hit-flash overlay. Returns true if it
// drew a sprite, false if the caller should fall back to vector drawing.
function drawAntSprite(role, moving, carrying, x, y, angle, sizePx, flash) {
  if (!antSheetReady) return false;
  const S = ANT_SPRITE;
  const row = role === 'scout' ? scoutSkinRow()                     // unlocked skin choice
            : (S.row[role] != null) ? S.row[role] : 0;
  const anim = carrying ? S.carry : S.walk;
  const fi = (moving || carrying) ? anim[Math.floor(t * S.fps) % anim.length] : anim[0];
  const sxp = fi * S.cell, syp = row * S.cell;
  const half = sizePx / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI / 2);          // art faces down; align it to the heading
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;         // crisp pixels
  ctx.drawImage(antSheet, sxp, syp, S.cell, S.cell, -half, -half, sizePx, sizePx);
  if (flash) {                               // hit flash: quick white pop
    ctx.globalAlpha = 0.55; ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, half * 0.55, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.imageSmoothingEnabled = prevSmooth;
  ctx.restore();
  return true;
}

// Draw a beetle sprite from the bug atlas. row = colour (0-3). Same conventions
// as drawAntSprite (faces down in the art; returns false -> vector fallback).
function drawBugSprite(row, moving, x, y, angle, sizePx, flash) {
  if (!bugSheetReady) return false;
  const S = BUG_SPRITE;
  const fi = moving ? S.walk[Math.floor(t * S.fps) % S.walk.length] : S.walk[0];
  const half = sizePx / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI / 2);
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bugSheet, fi * S.cell, row * S.cell, S.cell, S.cell, -half, -half, sizePx, sizePx);
  if (flash) {
    ctx.globalAlpha = 0.55; ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, half * 0.55, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.imageSmoothingEnabled = prevSmooth;
  ctx.restore();
  return true;
}
