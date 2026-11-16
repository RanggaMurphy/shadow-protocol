// Every texture in SHADOW PROTOCOL is painted on a canvas at load: concrete wall panels, deck
// floors, asphalt, military crates, server racks, screens, barrels, supply cases and the night
// sky. Painters work at 512px (1024 for the sky) with wear, grime and seams so surfaces read as
// real materials under the light. Each surface also exports a bump map from the same canvas.
// No image files exist anywhere in the game.
import * as THREE from 'three';

function makeCanvas(size, painter, height = size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  painter(ctx, size, height);
  return canvas;
}

function fromCanvas(canvas, { srgb = true, repeat = 1 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A colour map plus a matching bump map painted by one painter. */
function surface(size, painter, repeat = 1) {
  const canvas = makeCanvas(size, painter);
  return { map: fromCanvas(canvas, { repeat }), bump: fromCanvas(canvas, { srgb: false, repeat }) };
}

function grain(ctx, w, h, base, fleck, count, alpha, fleckSize = 2) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = fleck;
    ctx.globalAlpha = Math.random() * alpha;
    ctx.fillRect(Math.random() * w, Math.random() * h, fleckSize, fleckSize);
  }
  ctx.globalAlpha = 1;
}

function scuffs(ctx, w, h, count, color = '0,0,0') {
  for (let i = 0; i < count; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 12 + Math.random() * 60;
    ctx.strokeStyle = `rgba(${color},${0.04 + Math.random() * 0.1})`;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 14, y + len * (Math.random() > 0.5 ? 1 : 0.3));
    ctx.stroke();
  }
}

function grimeBottom(ctx, w, h, strength = 0.35) {
  const grad = ctx.createLinearGradient(0, h * 0.62, 0, h);
  grad.addColorStop(0, 'rgba(8,8,6,0)');
  grad.addColorStop(1, `rgba(8,8,6,${strength})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
}

function rivets(ctx, points, r = 4) {
  for (const [x, y] of points) {
    ctx.fillStyle = 'rgba(12,13,16,0.85)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(210,220,230,0.28)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
}

export function makeTextures() {
  // --- Wall: large prefabricated concrete/steel panels, seams, rivets, stains, worn stencil. ---
  const wallS = surface(512, (ctx, s) => {
    grain(ctx, s, s, '#434a54', '#596270', 5200, 0.16);
    grain(ctx, s, s, '#434a54', '#31363e', 3800, 0.14);
    // Panel subdivision: one vertical seam, two horizontal.
    ctx.strokeStyle = 'rgba(16,18,22,0.9)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s * 0.34); ctx.lineTo(s, s * 0.34);
    ctx.moveTo(0, s * 0.78); ctx.lineTo(s, s * 0.78);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,212,224,0.13)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s / 2 + 3, 0); ctx.lineTo(s / 2 + 3, s);
    ctx.moveTo(0, s * 0.34 + 3); ctx.lineTo(s, s * 0.34 + 3);
    ctx.stroke();
    // Recessed service hatch, upper left panel.
    ctx.fillStyle = '#39404a';
    ctx.fillRect(36, 36, 150, 104);
    ctx.strokeStyle = 'rgba(14,15,18,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 36, 150, 104);
    ctx.fillStyle = 'rgba(10,11,13,0.55)';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(50, 56 + i * 16, 122, 6);
    rivets(ctx, [[20, 20], [s / 2 - 20, 20], [s / 2 + 20, 20], [s - 20, 20],
      [20, s * 0.34 - 16], [s - 20, s * 0.34 - 16], [20, s - 20], [s - 20, s - 20],
      [44, 44], [178, 44], [44, 132], [178, 132]], 4);
    // Worn painted band + stencil near the base.
    ctx.fillStyle = 'rgba(178, 138, 62, 0.30)';
    ctx.fillRect(0, s * 0.78 + 10, s, 20);
    ctx.fillStyle = 'rgba(216, 222, 228, 0.34)';
    ctx.font = 'bold 30px monospace';
    ctx.fillText('B-2', 28, s * 0.78 - 16);
    ctx.font = '17px monospace';
    ctx.fillStyle = 'rgba(216, 222, 228, 0.22)';
    ctx.fillText('SECTOR 7 // NO STEP', 300, s - 24);
    scuffs(ctx, s, s, 46);
    grimeBottom(ctx, s, s, 0.4);
  });

  // --- Indoor floor: worn steel deck plates over concrete, plate seams, traffic polish. ---
  const floorS = surface(512, (ctx, s) => {
    grain(ctx, s, s, '#2e3238', '#3d424b', 6000, 0.18);
    grain(ctx, s, s, '#2e3238', '#22252b', 4200, 0.16);
    ctx.strokeStyle = 'rgba(13,14,17,0.95)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
    ctx.stroke();
    // Traffic polish: lighter worn sheen in the plate centres.
    for (const [x, y] of [[s / 4, s / 4], [3 * s / 4, s / 4], [s / 4, 3 * s / 4], [3 * s / 4, 3 * s / 4]]) {
      const g = ctx.createRadialGradient(x, y, 8, x, y, s * 0.24);
      g.addColorStop(0, 'rgba(190,200,214,0.10)');
      g.addColorStop(1, 'rgba(190,200,214,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - s * 0.25, y - s * 0.25, s * 0.5, s * 0.5);
    }
    rivets(ctx, [[18, 18], [s / 2 - 18, 18], [s / 2 + 18, 18], [s - 18, 18],
      [18, s / 2 - 18], [s - 18, s / 2 - 18], [18, s - 18], [s - 18, s - 18],
      [s / 2 - 18, s / 2 - 18], [s / 2 + 18, s / 2 + 18], [s / 2 - 18, s / 2 + 18], [s / 2 + 18, s / 2 - 18]], 3.4);
    scuffs(ctx, s, s, 60);
    grimeBottom(ctx, s, s, 0.16);
  });

  // --- Yard asphalt: aggregate, cracks, oil stains, one chipped painted line. ---
  const asphaltS = surface(512, (ctx, s) => {
    grain(ctx, s, s, '#26272b', '#34363c', 15000, 0.3, 1.6);
    grain(ctx, s, s, '#26272b', '#191a1d', 7000, 0.25, 2);
    for (let i = 0; i < 7; i += 1) { // oil stains
      const x = Math.random() * s; const y = Math.random() * s; const r = 26 + Math.random() * 70;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(5,5,8,0.35)');
      g.addColorStop(1, 'rgba(5,5,8,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.strokeStyle = 'rgba(10,10,12,0.6)'; // cracks
    for (let i = 0; i < 5; i += 1) {
      let x = Math.random() * s; let y = Math.random() * s;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 6; j += 1) { x += (Math.random() - 0.5) * 70; y += Math.random() * 42; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // Worn painted centre line, chipped away in patches.
    ctx.fillStyle = 'rgba(196, 164, 74, 0.5)';
    ctx.fillRect(0, s / 2 - 5, s, 10);
    ctx.fillStyle = '#26272b';
    for (let i = 0; i < 260; i += 1) {
      ctx.globalAlpha = 0.25 + Math.random() * 0.6;
      ctx.fillRect(Math.random() * s, s / 2 - 6 + Math.random() * 12, 3 + Math.random() * 9, 2.4);
    }
    ctx.globalAlpha = 1;
  }, 6);

  // --- Military supply crate: olive drab, frame beams, edge wear, stencil. ---
  const crateS = surface(512, (ctx, s) => {
    grain(ctx, s, s, '#4e4c3a', '#5d5a45', 4200, 0.18);
    grain(ctx, s, s, '#4e4c3a', '#3a382a', 3200, 0.16);
    ctx.strokeStyle = '#2c2a1e';
    ctx.lineWidth = 34;
    ctx.strokeRect(17, 17, s - 34, s - 34);
    ctx.strokeStyle = 'rgba(226, 220, 190, 0.20)'; // edge wear highlight
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 36, s - 72, s - 72);
    ctx.strokeStyle = '#2c2a1e';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(40, 40); ctx.lineTo(s - 40, s - 40);
    ctx.moveTo(s - 40, 40); ctx.lineTo(40, s - 40);
    ctx.stroke();
    ctx.fillStyle = 'rgba(16, 15, 10, 0.5)';
    ctx.fillRect(s / 2 - 118, s / 2 - 40, 236, 80);
    ctx.fillStyle = '#cfc39a';
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('S-7', s / 2, s / 2 + 2);
    ctx.font = 'bold 21px monospace';
    ctx.fillStyle = 'rgba(207, 195, 154, 0.75)';
    ctx.fillText('SUPPLY // 12.4 KG', s / 2, s / 2 + 30);
    ctx.textAlign = 'left';
    scuffs(ctx, s, s, 40, '12,11,6');
    grimeBottom(ctx, s, s, 0.3);
  });

  // --- Server rack front: vents, handles, muted status LEDs. ---
  const rackS = surface(512, (ctx, s) => {
    ctx.fillStyle = '#14161a';
    ctx.fillRect(0, 0, s, s);
    for (let row = 0; row < 8; row += 1) {
      const y = 10 + row * 62;
      ctx.fillStyle = '#1d2026';
      ctx.fillRect(12, y, s - 24, 50);
      ctx.fillStyle = 'rgba(210,218,228,0.10)';
      ctx.fillRect(12, y, s - 24, 2);
      ctx.fillStyle = '#0b0c0f'; // vent slots
      for (let i = 0; i < 16; i += 1) ctx.fillRect(24 + i * 13, y + 12, 7, 26);
      ctx.fillStyle = '#262a31'; // drive bays
      ctx.fillRect(s - 128, y + 9, 108, 32);
      for (let i = 0; i < 3; i += 1) { // LEDs, desaturated
        ctx.fillStyle = ['#4d7d55', '#7d744d', '#3f5d6e'][i % 3];
        ctx.globalAlpha = 0.55 + Math.random() * 0.4;
        ctx.fillRect(s - 118 + i * 16, y + 20, 6, 6);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#31363e';
      ctx.fillRect(24, y + 42, 60, 4);
    }
    grimeBottom(ctx, s, s, 0.25);
  });

  // --- Console screen: muted tactical UI plot. ---
  const screenS = surface(512, (ctx, s) => {
    ctx.fillStyle = '#08141d';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(110, 178, 205, 0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * s / 8, 0); ctx.lineTo(i * s / 8, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s / 8); ctx.lineTo(s, i * s / 8); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120, 200, 226, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, s - 28, s - 28);
    ctx.beginPath();
    ctx.moveTo(40, s - 110);
    for (let x = 40; x < s - 40; x += 22) {
      ctx.lineTo(x, s - 110 - Math.abs(Math.sin(x * 0.09)) * 150 - Math.random() * 26);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(120, 200, 226, 0.6)';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(40, 44 + i * 30, 90 + Math.random() * 130, 9);
    ctx.fillStyle = 'rgba(214, 92, 74, 0.85)';
    ctx.beginPath(); ctx.arc(s - 56, 52, 11, 0, Math.PI * 2); ctx.fill();
  });

  // --- Fuel barrel: ribbed steel, chipped rust-red paint, rust streaks. ---
  const barrelS = surface(256, (ctx, s) => {
    grain(ctx, s, s, '#5d4034', '#6e4c3a', 2600, 0.22);
    grain(ctx, s, s, '#5d4034', '#3c2a20', 2000, 0.2);
    for (const y of [0.24, 0.52, 0.8]) { // rolled ribs
      ctx.fillStyle = 'rgba(20, 12, 8, 0.55)';
      ctx.fillRect(0, s * y, s, 7);
      ctx.fillStyle = 'rgba(230, 200, 170, 0.16)';
      ctx.fillRect(0, s * y + 7, s, 3);
    }
    for (let i = 0; i < 26; i += 1) { // rust streaks running down
      const x = Math.random() * s;
      ctx.fillStyle = `rgba(46, 26, 16, ${0.1 + Math.random() * 0.22})`;
      ctx.fillRect(x, Math.random() * s * 0.4, 2.5, 30 + Math.random() * 80);
    }
    ctx.fillStyle = 'rgba(226, 214, 178, 0.6)';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FUEL', s / 2, s * 0.42);
    ctx.font = '15px monospace';
    ctx.fillStyle = 'rgba(226, 214, 178, 0.4)';
    ctx.fillText('DIESEL // 200L', s / 2, s * 0.42 + 24);
    ctx.textAlign = 'left';
  });

  // --- Door leaf (kept for parity with the original texture set). ---
  const doorS = surface(256, (ctx, s) => {
    grain(ctx, s, s, '#39414b', '#49525e', 2400, 0.16);
    ctx.strokeStyle = '#14171c';
    ctx.lineWidth = 5;
    ctx.strokeRect(16, 10, s - 32, s - 20);
    ctx.fillStyle = 'rgba(196, 164, 74, 0.75)';
    ctx.fillRect(s / 2 - 6, 34, 12, s - 100);
    ctx.fillStyle = '#101216';
    ctx.fillRect(s / 2 - 30, s - 56, 60, 24);
    scuffs(ctx, s, s, 22);
  });

  // --- Ceiling: acoustic/metal panels, vent grille, water stains. ---
  const ceilingS = surface(512, (ctx, s) => {
    grain(ctx, s, s, '#33373d', '#3f444b', 4200, 0.14);
    ctx.strokeStyle = 'rgba(14,15,18,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(10, 11, 13, 0.5)'; // vent grille quadrant
    for (let i = 0; i < 9; i += 1) ctx.fillRect(s / 2 + 34, 40 + i * 22, 180, 9);
    for (let i = 0; i < 4; i += 1) { // faint stains
      const x = Math.random() * s; const y = Math.random() * s; const r = 30 + Math.random() * 60;
      const g = ctx.createRadialGradient(x, y, 4, x, y, r);
      g.addColorStop(0, 'rgba(24, 20, 14, 0.20)');
      g.addColorStop(1, 'rgba(24, 20, 14, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    rivets(ctx, [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16]], 3);
  });

  // --- Hazard chevrons for doorway thresholds, heavily worn. ---
  const hazardCanvas = makeCanvas(256, (ctx, s) => {
    ctx.fillStyle = '#8f7134';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1d1d20';
    for (let i = -2; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 64, s);
      ctx.lineTo(i * 64 + 64, 0);
      ctx.lineTo(i * 64 + 96, 0);
      ctx.lineTo(i * 64 + 32, s);
      ctx.closePath();
      ctx.fill();
    }
    grain(ctx, s, s, 'rgba(0,0,0,0)', '#101012', 1500, 0.2);
    scuffs(ctx, s, s, 30);
  });
  const hazard = fromCanvas(hazardCanvas);

  // --- Sky dome: night gradient, faint stars, low horizon glow. ---
  const skyCanvas = makeCanvas(1024, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#04060d');
    grad.addColorStop(0.42, '#0a1220');
    grad.addColorStop(0.72, '#16233a');
    grad.addColorStop(0.88, '#2a3a52');
    grad.addColorStop(1, '#3d4c63');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i += 1) { // stars, upper sky only
      const y = Math.pow(Math.random(), 1.6) * h * 0.62;
      ctx.fillStyle = '#dfe9f5';
      ctx.globalAlpha = Math.random() * 0.75 * (1 - y / (h * 0.7));
      const r = Math.random() < 0.06 ? 1.8 : 1;
      ctx.fillRect(Math.random() * w, y, r, r);
    }
    ctx.globalAlpha = 1;
    const moon = ctx.createRadialGradient(w * 0.78, h * 0.2, 4, w * 0.78, h * 0.2, 120);
    moon.addColorStop(0, 'rgba(214, 228, 246, 0.5)');
    moon.addColorStop(0.12, 'rgba(190, 208, 235, 0.18)');
    moon.addColorStop(1, 'rgba(190, 208, 235, 0)');
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(226, 236, 248, 0.9)';
    ctx.beginPath(); ctx.arc(w * 0.78, h * 0.2, 13, 0, Math.PI * 2); ctx.fill();
  }, 512);
  const sky = fromCanvas(skyCanvas);
  sky.wrapS = THREE.ClampToEdgeWrapping;
  sky.wrapT = THREE.ClampToEdgeWrapping;

  return {
    wall: wallS.map, wallBump: wallS.bump,
    floor: floorS.map, floorBump: floorS.bump,
    asphalt: asphaltS.map, asphaltBump: asphaltS.bump,
    crate: crateS.map, crateBump: crateS.bump,
    rack: rackS.map, rackBump: rackS.bump,
    screen: screenS.map,
    barrel: barrelS.map, barrelBump: barrelS.bump,
    door: doorS.map,
    ceiling: ceilingS.map, ceilingBump: ceilingS.bump,
    hazard,
    sky,
  };
}

/** Small painted textures for the three supply cases (health / armor / ammo). */
export function makeCaseTexture(kind) {
  const painters = {
    health: (ctx, s) => {
      grain(ctx, s, s, '#b9bdc0', '#c9cdcf', 1500, 0.14);
      grain(ctx, s, s, '#b9bdc0', '#9ea3a6', 1200, 0.14);
      ctx.fillStyle = '#2e3236';
      ctx.fillRect(0, 0, s, 20); ctx.fillRect(0, s - 20, s, 20);
      ctx.fillStyle = '#a33327';
      ctx.fillRect(s / 2 - 17, s / 2 - 52, 34, 104);
      ctx.fillRect(s / 2 - 52, s / 2 - 17, 104, 34);
      scuffs(ctx, s, s, 18, '40,40,40');
    },
    armor: (ctx, s) => {
      grain(ctx, s, s, '#3d4c5c', '#4a5b6c', 1800, 0.16);
      ctx.fillStyle = '#232d38';
      ctx.fillRect(0, 0, s, 20); ctx.fillRect(0, s - 20, s, 20);
      ctx.fillStyle = 'rgba(214, 222, 230, 0.8)';
      ctx.font = 'bold 30px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ARMOR', s / 2, s / 2 - 2);
      ctx.font = '16px monospace';
      ctx.fillStyle = 'rgba(214, 222, 230, 0.5)';
      ctx.fillText('PLATE SET // IV', s / 2, s / 2 + 24);
      ctx.textAlign = 'left';
      scuffs(ctx, s, s, 18);
    },
    ammo: (ctx, s) => {
      grain(ctx, s, s, '#4a4d33', '#585c3e', 1800, 0.16);
      ctx.fillStyle = '#2f3120';
      ctx.fillRect(0, 0, s, 20); ctx.fillRect(0, s - 20, s, 20);
      ctx.fillStyle = 'rgba(219, 208, 164, 0.85)';
      ctx.font = 'bold 30px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('5.56', s / 2, s / 2 - 2);
      ctx.font = '16px monospace';
      ctx.fillStyle = 'rgba(219, 208, 164, 0.55)';
      ctx.fillText('AMMO // 840 RDS', s / 2, s / 2 + 24);
      ctx.textAlign = 'left';
      scuffs(ctx, s, s, 18, '20,20,10');
    },
  };
  const canvas = makeCanvas(256, painters[kind]);
  return fromCanvas(canvas);
}
