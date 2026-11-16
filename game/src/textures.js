// Every texture in SHADOW PROTOCOL is painted on a canvas at load: wall panels, floors, asphalt,
// crates, server racks, screens and barrels. No image files exist anywhere in the game.
import * as THREE from 'three';

function canvasTexture(size, painter, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  painter(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function grain(ctx, size, base, fleck, count, alpha) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = fleck;
    ctx.globalAlpha = Math.random() * alpha;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  const wall = canvasTexture(256, (ctx, s) => {
    grain(ctx, s, '#2b3038', '#454c58', 900, 0.25);
    ctx.strokeStyle = '#171a20';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.stroke();
    ctx.fillStyle = '#1d2129';
    ctx.fillRect(10, 10, s - 20, 26);
    ctx.fillStyle = '#3d434f';
    for (const [x, y] of [[14, 14], [s - 18, 14], [14, s - 18], [s - 18, s - 18], [14, s / 2], [s - 18, s / 2]]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 176, 32, 0.5)';
    ctx.fillRect(0, s - 18, s, 6);
  });

  const floor = canvasTexture(256, (ctx, s) => {
    grain(ctx, s, '#22252c', '#33373f', 700, 0.3);
    ctx.strokeStyle = '#121419';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.strokeStyle = 'rgba(90, 200, 255, 0.10)';
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
  });

  const asphalt = canvasTexture(256, (ctx, s) => {
    grain(ctx, s, '#1d1f24', '#2e3138', 2600, 0.35);
    ctx.strokeStyle = 'rgba(230, 200, 90, 0.28)';
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 20]);
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }, 6);

  const crate = canvasTexture(256, (ctx, s) => {
    grain(ctx, s, '#4a4234', '#5d5340', 500, 0.25);
    ctx.strokeStyle = '#241f16';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, s - 14, s - 14);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s, s);
    ctx.moveTo(s, 0);
    ctx.lineTo(0, s);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20, 18, 12, 0.55)';
    ctx.fillRect(s / 2 - 34, s / 2 - 13, 68, 26);
    ctx.fillStyle = '#c8b98a';
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('S-7', s / 2, s / 2 + 6);
  });

  const rack = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#14161c';
    ctx.fillRect(0, 0, s, s);
    for (let row = 0; row < 8; row += 1) {
      const y = 8 + row * 30;
      ctx.fillStyle = '#1e2129';
      ctx.fillRect(8, y, s - 16, 24);
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = Math.random() > 0.4 ? '#39d353' : '#2a7d3f';
        ctx.fillRect(16 + i * 12, y + 8, 5, 5);
      }
      ctx.fillStyle = '#0c0e12';
      ctx.fillRect(s - 70, y + 5, 54, 14);
    }
  });

  const screen = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#04121c';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(55, 224, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    ctx.beginPath();
    ctx.moveTo(24, s - 60);
    for (let x = 24; x < s - 24; x += 16) {
      ctx.lineTo(x, s - 60 - Math.abs(Math.sin(x * 0.11)) * 90 - Math.random() * 18);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(55, 224, 255, 0.85)';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(24, 26 + i * 16, 60 + Math.random() * 90, 6);
    ctx.fillStyle = '#ff5147';
    ctx.beginPath();
    ctx.arc(s - 34, 32, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  const barrel = canvasTexture(128, (ctx, s) => {
    grain(ctx, s, '#5a3b2e', '#6e4a38', 500, 0.3);
    ctx.fillStyle = '#c33';
    ctx.fillRect(0, 18, s, 12);
    ctx.fillRect(0, s - 30, s, 12);
    ctx.fillStyle = 'rgba(255, 220, 120, 0.8)';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FUEL', s / 2, s / 2 + 5);
  });

  const door = canvasTexture(256, (ctx, s) => {
    grain(ctx, s, '#333a44', '#454e5a', 500, 0.2);
    ctx.strokeStyle = '#14171c';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 8, s - 28, s - 16);
    ctx.fillStyle = '#ffb020';
    ctx.fillRect(s / 2 - 5, 30, 10, s - 90);
    ctx.fillStyle = '#101216';
    ctx.fillRect(s / 2 - 26, s - 52, 52, 22);
  });

  return { wall, floor, asphalt, crate, rack, screen, barrel, door };
}
