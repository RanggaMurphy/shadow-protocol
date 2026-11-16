// Combat feel lives here: pooled particles (sparks, hit bursts, smoke, explosion fire), tracer
// rounds, two reusable dynamic lights for muzzle flashes and explosions, and shockwave rings.
// Everything is pre-allocated and additive-blended, so effects cost no per-frame allocation.
import * as THREE from 'three';

const MAX_PARTICLES = 1600;

export function createEffects(scene) {
  // Soft round sprite so particles read as sparks and smoke, not raw squares.
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = 64;
  spriteCanvas.height = 64;
  const spriteCtx = spriteCanvas.getContext('2d');
  const gradient = spriteCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  spriteCtx.fillStyle = gradient;
  spriteCtx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(spriteCanvas);

  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const gravity = new Float32Array(MAX_PARTICLES);
  const baseColor = new Float32Array(MAX_PARTICLES * 3);
  for (let i = 0; i < MAX_PARTICLES; i += 1) positions[i * 3 + 1] = -999;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.13, map: sprite, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;

  function emit(x, y, z, vx, vy, vz, seconds, r, g, b, grav) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    velocities[i * 3] = vx; velocities[i * 3 + 1] = vy; velocities[i * 3 + 2] = vz;
    baseColor[i * 3] = r; baseColor[i * 3 + 1] = g; baseColor[i * 3 + 2] = b;
    life[i] = seconds;
    maxLife[i] = seconds;
    gravity[i] = grav;
  }

  function burst(pos, { count, color, speed, spread = 1, up = 0.4, seconds = 0.5, grav = -4 }) {
    const [r, g, b] = color;
    for (let n = 0; n < count; n += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.3 + Math.random() * 0.7);
      emit(
        pos.x, pos.y, pos.z,
        Math.sin(phi) * Math.cos(theta) * s * spread,
        Math.cos(phi) * s * up + speed * 0.25,
        Math.sin(phi) * Math.sin(theta) * s * spread,
        seconds * (0.5 + Math.random() * 0.8),
        r, g, b, grav,
      );
    }
  }

  // Tracers: a pool of thin stretched boxes.
  const tracerPool = [];
  const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
  for (let i = 0; i < 28; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mesh.visible = false;
    scene.add(mesh);
    tracerPool.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;
  const UP = new THREE.Vector3(0, 1, 0);
  const mid = new THREE.Vector3();
  function tracer(from, to, color = 0xffd9a0) {
    const slot = tracerPool[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracerPool.length;
    const length = from.distanceTo(to);
    if (length < 0.5) return;
    mid.addVectors(from, to).multiplyScalar(0.5);
    slot.mesh.position.copy(mid);
    slot.mesh.scale.set(1, 1, length);
    slot.mesh.lookAt(to);
    slot.mesh.material.color.setHex(color);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.visible = true;
    slot.life = 0.055;
  }

  // Ambient dust: a few hundred motes drifting slowly through the light, everywhere in the
  // facility. Pure atmosphere — tiny, dim, and updated on a sine wobble from base positions.
  const DUST_COUNT = 420;
  const dustBase = new Float32Array(DUST_COUNT * 3);
  const dustPhase = new Float32Array(DUST_COUNT);
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i += 1) {
    dustBase[i * 3] = (Math.random() - 0.5) * 138;
    dustBase[i * 3 + 1] = 0.3 + Math.random() * 3.1;
    dustBase[i * 3 + 2] = (Math.random() - 0.5) * 112;
    dustPhase[i] = Math.random() * Math.PI * 2;
  }
  dustPositions.set(dustBase);
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    size: 0.03, map: sprite, color: 0x9fb8cc, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  dust.frustumCulled = false;
  scene.add(dust);
  let dustTime = 0;

  // Shockwave rings for explosions.
  const ringPool = [];
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    ringPool.push({ mesh, life: 0 });
  }
  let ringCursor = 0;

  // Two reusable dynamic lights.
  const flashLight = new THREE.PointLight(0xffc37a, 0, 15, 1.8);
  scene.add(flashLight);
  let flashLife = 0;
  const boomLight = new THREE.PointLight(0xff9040, 0, 26, 1.6);
  scene.add(boomLight);
  let boomLife = 0;

  const tmpColor = new THREE.Color();

  return {
    sparks(pos) {
      burst(pos, { count: 7, color: [1, 0.72, 0.3], speed: 3.4, seconds: 0.32, grav: -6 });
    },
    hitFlesh(pos) {
      burst(pos, { count: 9, color: [0.75, 0.1, 0.12], speed: 2.6, seconds: 0.45, grav: -5 });
    },
    deathBurst(pos) {
      burst(pos, { count: 26, color: [0.85, 0.15, 0.18], speed: 4.2, seconds: 0.7, grav: -5 });
      burst(pos, { count: 10, color: [1, 0.6, 0.25], speed: 3, seconds: 0.4, grav: -3 });
    },
    muzzleSmoke(pos) {
      burst(pos, { count: 2, color: [0.16, 0.16, 0.18], speed: 0.5, seconds: 0.7, grav: 1.2 });
    },
    explosion(pos) {
      burst(pos, { count: 46, color: [1, 0.55, 0.16], speed: 8.5, seconds: 0.8, grav: -2 });
      burst(pos, { count: 24, color: [1, 0.85, 0.4], speed: 5, seconds: 0.5, grav: -1 });
      burst(pos, { count: 18, color: [0.25, 0.22, 0.2], speed: 2.2, seconds: 1.3, grav: 1.5 });
      const ring = ringPool[ringCursor];
      ringCursor = (ringCursor + 1) % ringPool.length;
      ring.mesh.position.set(pos.x, 0.15, pos.z);
      ring.mesh.visible = true;
      ring.life = 0.45;
      boomLight.position.set(pos.x, pos.y + 0.6, pos.z);
      boomLight.intensity = 160;
      boomLife = 0.4;
    },
    tracer,
    muzzle(pos, colorHex = 0xffc37a) {
      flashLight.position.copy(pos);
      flashLight.color.setHex(colorHex);
      flashLight.intensity = 38;
      flashLife = 0.05;
    },
    update(dt) {
      dustTime += dt;
      for (let i = 0; i < DUST_COUNT; i += 1) {
        const phase = dustPhase[i];
        dustPositions[i * 3] = dustBase[i * 3] + Math.sin(dustTime * 0.11 + phase) * 0.85;
        dustPositions[i * 3 + 1] = dustBase[i * 3 + 1] + Math.sin(dustTime * 0.07 + phase * 1.7) * 0.3;
        dustPositions[i * 3 + 2] = dustBase[i * 3 + 2] + Math.cos(dustTime * 0.09 + phase) * 0.85;
      }
      dustGeometry.attributes.position.needsUpdate = true;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -999;
          colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0;
          continue;
        }
        velocities[i * 3 + 1] += gravity[i] * dt;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.03) positions[i * 3 + 1] = 0.03;
        const fade = life[i] / maxLife[i];
        colors[i * 3] = baseColor[i * 3] * fade;
        colors[i * 3 + 1] = baseColor[i * 3 + 1] * fade;
        colors[i * 3 + 2] = baseColor[i * 3 + 2] * fade;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      for (const slot of tracerPool) {
        if (!slot.mesh.visible) continue;
        slot.life -= dt;
        slot.mesh.material.opacity = Math.max(0, slot.life / 0.055) * 0.85;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
      for (const ring of ringPool) {
        if (!ring.mesh.visible) continue;
        ring.life -= dt;
        const t = 1 - Math.max(0, ring.life) / 0.45;
        const scale = 1 + t * 7;
        ring.mesh.scale.set(scale, scale, scale);
        ring.mesh.material.opacity = (1 - t) * 0.7;
        if (ring.life <= 0) ring.mesh.visible = false;
      }
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) flashLight.intensity = 0;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        boomLight.intensity = Math.max(0, boomLife / 0.4) * 160;
      }
      void tmpColor;
      void UP;
    },
  };
}
