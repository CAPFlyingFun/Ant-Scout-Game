/* ============================================================
   main.js — event wiring + boot + game loop (loaded last)
   ============================================================ */

// input events
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchmove', onMove, { passive: false });
canvas.addEventListener('touchend', onUp, { passive: false });
canvas.addEventListener('touchcancel', onUp, { passive: false });
canvas.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', e => { if (pointers.size) onMove(e); });
window.addEventListener('mouseup', onUp);

// win-screen "Play again" tap
canvas.addEventListener('pointerdown', e => {
  if (won && winBtn) {
    const x = e.clientX, y = e.clientY;
    if (x >= winBtn.bx && x <= winBtn.bx + winBtn.bw && y >= winBtn.by && y <= winBtn.by + winBtn.bh) newGame();
  }
});

// keyboard (desktop)
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key === 'Enter' && won) newGame();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

window.addEventListener('resize', resize);

// boot
resize();
initEnvironment();                    // decide starting weather (live / manual / offline) from saved settings
registerScene(UndergroundScene);      // register every scene with the manager…
registerScene(SurfaceScene);          // …adding a future scene is just one more line here
newGame();                            // build the starting world so it's a live backdrop behind the menu
wireMenu();
showScreen('menu');

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
