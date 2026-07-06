/* ============================================================
   scene_surface.js — the surface overworld (top-down free-roam).
   Phase 1: a large bounded grassy map with ONE anthill door back down.
   No digging, no stats, no enemies yet — those slot into update()/draw()
   and new props in later phases without touching the scene backbone.
   ============================================================ */

const SurfaceScene = {
  id: 'surface',
  worldW: 3600, worldH: 2400,     // generous "huge" feel; the ant hits invisible edges here
  canDig: false,
  built: false,
  hill: { x: 0, y: 0, r: 46 },    // anthill = the entry point AND the door back underground
  props: [],

  build() {
    this.worldW = 3600; this.worldH = 2400;
    this.hill.x = this.worldW * 0.32;
    this.hill.y = this.worldH * 0.42;
    // deterministic scattered detail so it reads as a real place (cheap, no per-frame RNG)
    this.props = [];
    for (let i = 0; i < 480; i++) {
      const x = hash01(i * 1.73 + 0.2) * this.worldW;
      const y = hash01(i * 2.91 + 3.1) * this.worldH;
      const isTuft = hash01(i * 5.13) < 0.72;
      this.props.push({ x, y, type: isTuft ? 'tuft' : 'pebble', s: 0.6 + hash01(i * 7.31) * 0.9, rot: hash01(i * 3.37) * 6.28 });
    }
  },

  enter(from) {
    // spawn a step outside the anthill hole, clear of the door trigger
    ant.x = this.hill.x;
    ant.y = this.hill.y + this.hill.r + 48;
    ant.vx = ant.vy = 0; ant.angle = Math.PI / 2;   // facing away from the hill
  },

  resolveCollision() { /* bounds handled by the shared world-edge clamp; no obstacles in Phase 1 */ },

  update(dt) { /* free roam — Phase 2+ adds survival stats, collectibles, enemies here */ },

  draw() { drawSurface(this); },

  // door: within a small radius of the anthill hole -> go back underground
  actionPrompt() {
    const d = Math.hypot(ant.x - this.hill.x, ant.y - this.hill.y);
    return d < this.hill.r + 34 ? { label: '🕳️ Enter anthill', to: 'underground' } : null;
  },
};

function drawSurface(s) {
  const day = weather.isDay;

  // ground base (day/night ambient)
  ctx.fillStyle = day ? '#3f7a34' : '#183a24';
  ctx.fillRect(0, 0, W, H);

  // scattered deterministic detail — only draw what's near the viewport
  const mx0 = cam.x - W / 2 - 40, mx1 = cam.x + W / 2 + 40, my0 = cam.y - H / 2 - 40, my1 = cam.y + H / 2 + 40;
  for (const p of s.props) {
    if (p.x < mx0 || p.x > mx1 || p.y < my0 || p.y > my1) continue;
    const sx = w2sX(p.x), sy = w2sY(p.y);
    if (p.type === 'tuft') {
      ctx.fillStyle = day ? 'rgba(20,50,16,.35)' : 'rgba(6,20,12,.4)';
      ctx.beginPath(); ctx.ellipse(sx, sy + 3, 7 * p.s, 3 * p.s, 0, 0, 7); ctx.fill();   // soft shadow
      ctx.strokeStyle = day ? '#4e9a3e' : '#2c5c38'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let b = -1; b <= 1; b++) {
        ctx.beginPath(); ctx.moveTo(sx + b * 3, sy + 3);
        ctx.lineTo(sx + b * 3 + Math.cos(p.rot + b * 0.6) * 3, sy + 3 - 11 * p.s); ctx.stroke();
      }
    } else {
      ctx.fillStyle = day ? 'rgba(150,140,120,.9)' : 'rgba(70,74,86,.9)';
      ctx.beginPath(); ctx.ellipse(sx, sy, 4 * p.s, 3 * p.s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(sx - 1, sy - 1, 1.4 * p.s, 1 * p.s, 0, 0, 7); ctx.fill();
    }
  }

  // anthill mound + entrance hole (the door)
  const hx = w2sX(s.hill.x), hy = w2sY(s.hill.y), r = s.hill.r;
  ctx.fillStyle = day ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.34)';
  ctx.beginPath(); ctx.ellipse(hx, hy + r * 0.5, r * 1.15, r * 0.5, 0, 0, 7); ctx.fill();   // ground shadow
  ctx.fillStyle = day ? '#8a6238' : '#4a3623';
  ctx.beginPath(); ctx.ellipse(hx, hy, r, r * 0.72, 0, 0, 7); ctx.fill();
  ctx.fillStyle = day ? '#75512c' : '#3a2a1a';
  ctx.beginPath(); ctx.ellipse(hx, hy - 3, r * 0.82, r * 0.56, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#0a0705';
  ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.34, r * 0.26, 0, 0, 7); ctx.fill();            // dark hole

  drawAnt();

  // night ambient tint over the whole scene
  if (!day) { ctx.fillStyle = 'rgba(12,20,46,.42)'; ctx.fillRect(0, 0, W, H); }

  // precipitation overlay (full screen for a top-down view)
  drawPrecip(H);
}
