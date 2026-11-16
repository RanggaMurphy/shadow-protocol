// The five SHADOW PROTOCOL weapons: view models assembled from primitives (each with its own
// silhouette, barrel, magazine and sight), plus the firing brain — rate of fire, spread bloom,
// recoil, reload timing, weapon switching, ADS zoom, muzzle flash, tracers and hit reporting.
// Hits are resolved by a raycast callback the main loop provides (world + enemies).
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const GUNMETAL = new THREE.MeshStandardMaterial({ color: 0x323842, roughness: 0.42, metalness: 0.72, emissive: 0x0a0d12 });
const DARK_PART = new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.52, metalness: 0.45, emissive: 0x05070a });
const GRIP_PART = new THREE.MeshStandardMaterial({ color: 0x3a342a, roughness: 0.88, metalness: 0.05 });
const TAN_PART = new THREE.MeshStandardMaterial({ color: 0x5c5142, roughness: 0.8, metalness: 0.08 });
const SIGHT_DOT = new THREE.MeshBasicMaterial({ color: 0x53ff9e });

function box(w, h, d, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function tube(radius, length, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildViewModel(id) {
  const group = new THREE.Group();
  let tipZ = -0.6;
  if (id === 'ar') {
    box(0.09, 0.13, 0.52, GUNMETAL, 0, 0, -0.1, group); // receiver
    box(0.095, 0.05, 0.3, DARK_PART, 0, -0.075, -0.05, group); // lower rail / magwell
    tube(0.028, 0.34, DARK_PART, 0, 0.03, -0.5, group); // barrel
    tube(0.042, 0.2, TAN_PART, 0, 0.03, -0.4, group); // polymer handguard
    box(0.05, 0.05, 0.1, DARK_PART, 0, 0.03, -0.66, group); // muzzle brake
    box(0.03, 0.025, 0.44, DARK_PART, 0, 0.085, -0.12, group); // top picatinny rail
    const mag = box(0.06, 0.2, 0.1, DARK_PART, 0, -0.15, -0.12, group);
    mag.rotation.x = 0.25;
    box(0.07, 0.16, 0.09, GRIP_PART, 0, -0.13, 0.16, group).rotation.x = 0.3; // grip
    box(0.07, 0.05, 0.22, TAN_PART, 0, 0.01, 0.3, group); // stock
    box(0.02, 0.07, 0.02, DARK_PART, 0, 0.11, -0.3, group); // front post
    box(0.1, 0.03, 0.03, DARK_PART, 0, 0.1, 0.05, group); // rear sight bar
    const dot = box(0.012, 0.012, 0.012, SIGHT_DOT, 0, 0.105, -0.3, group);
    dot.name = 'sightDot';
    tipZ = -0.72;
  } else if (id === 'shotgun') {
    box(0.1, 0.12, 0.5, GUNMETAL, 0, 0, -0.08, group);
    tube(0.045, 0.42, DARK_PART, 0, 0.045, -0.5, group);
    tube(0.055, 0.2, GRIP_PART, 0, -0.01, -0.42, group); // pump
    box(0.06, 0.14, 0.08, DARK_PART, 0, -0.13, 0.02, group);
    box(0.07, 0.16, 0.09, GRIP_PART, 0, -0.13, 0.17, group).rotation.x = 0.3;
    box(0.016, 0.016, 0.016, SIGHT_DOT, 0, 0.1, -0.62, group).name = 'sightDot';
    tipZ = -0.74;
  } else if (id === 'sniper') {
    box(0.08, 0.12, 0.56, GUNMETAL, 0, 0, -0.06, group);
    tube(0.02, 0.55, DARK_PART, 0, 0.02, -0.6, group);
    box(0.06, 0.07, 0.12, DARK_PART, 0, 0.02, -0.9, group); // muzzle
    tube(0.045, 0.24, DARK_PART, 0, 0.13, -0.05, group); // scope
    tube(0.032, 0.02, new THREE.MeshStandardMaterial({ color: 0x0d1a16, roughness: 0.15, metalness: 0.4, emissive: 0x1d4034, emissiveIntensity: 0.7 }), 0, 0.13, -0.18, group); // scope lens
    box(0.05, 0.05, 0.05, DARK_PART, 0, 0.07, -0.05, group); // scope mount
    box(0.015, 0.16, 0.015, DARK_PART, -0.05, -0.08, -0.78, group).rotation.x = 0.5; // bipod legs
    box(0.015, 0.16, 0.015, DARK_PART, 0.05, -0.08, -0.78, group).rotation.x = 0.5;
    box(0.055, 0.16, 0.09, DARK_PART, 0, -0.13, -0.08, group);
    box(0.07, 0.15, 0.1, GRIP_PART, 0, -0.12, 0.18, group).rotation.x = 0.3;
    box(0.07, 0.06, 0.26, GRIP_PART, 0, -0.02, 0.32, group); // stock with cheek rest
    tipZ = -0.98;
  } else if (id === 'smg') {
    box(0.09, 0.14, 0.4, GUNMETAL, 0, 0, -0.05, group);
    tube(0.04, 0.22, DARK_PART, 0, 0.02, -0.36, group); // suppressor
    const mag = box(0.055, 0.26, 0.09, DARK_PART, 0, -0.19, -0.06, group);
    mag.rotation.x = 0.12;
    box(0.07, 0.15, 0.09, GRIP_PART, 0, -0.13, 0.13, group).rotation.x = 0.3;
    box(0.03, 0.1, 0.03, DARK_PART, 0, -0.02, -0.2, group); // foregrip
    box(0.014, 0.014, 0.014, SIGHT_DOT, 0, 0.1, -0.22, group).name = 'sightDot';
    tipZ = -0.5;
  } else { // pistol
    box(0.07, 0.09, 0.3, GUNMETAL, 0, 0.02, -0.05, group); // slide
    box(0.06, 0.07, 0.24, DARK_PART, 0, -0.04, -0.04, group); // frame
    box(0.065, 0.19, 0.09, GRIP_PART, 0, -0.15, 0.05, group).rotation.x = 0.22; // grip
    box(0.012, 0.012, 0.012, SIGHT_DOT, 0, 0.085, -0.18, group).name = 'sightDot';
    tipZ = -0.24;
  }
  group.userData.tipZ = tipZ;
  return group;
}

function makeFlashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,240,200,1)');
  gradient.addColorStop(0.25, 'rgba(255,190,90,0.85)');
  gradient.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,220,150,0.9)';
  ctx.beginPath();
  ctx.moveTo(64, 2); ctx.lineTo(70, 58); ctx.lineTo(126, 64); ctx.lineTo(70, 70);
  ctx.lineTo(64, 126); ctx.lineTo(58, 70); ctx.lineTo(2, 64); ctx.lineTo(58, 58);
  ctx.closePath();
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

export function createWeapons(camera, audio, effects, hooks) {
  const holder = new THREE.Group();
  holder.scale.setScalar(1.12);
  camera.add(holder);
  const flashTexture = makeFlashTexture();

  const states = WEAPONS.map((def, index) => {
    const model = buildViewModel(def.id);
    model.visible = index === 0;
    holder.add(model);
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    flash.position.set(0, def.id === 'shotgun' ? 0.045 : 0.03, model.userData.tipZ - 0.08);
    model.add(flash);
    return {
      def,
      model,
      flash,
      mag: def.magSize,
      reserve: def.reserveStart,
      cooldown: 0,
      flashLife: 0,
    };
  });

  let currentIndex = 0;
  let reloading = 0;
  let reloadDuration = 0;
  let switching = 0;
  let switchTarget = -1;
  let bloom = 0;
  let kickZ = 0;
  let kickRot = 0;
  let adsT = 0;
  let swayX = 0;
  let swayY = 0;
  const muzzleWorld = new THREE.Vector3();
  const shotDir = new THREE.Vector3();

  const weapons = {
    get current() { return states[currentIndex]; },
    get def() { return states[currentIndex].def; },
    get reloading() { return reloading > 0; },
    get reloadProgress() { return reloadDuration > 0 ? 1 - reloading / reloadDuration : 0; },
    get adsT() { return adsT; },
    get bloom() { return bloom; },
    states,

    startReload() {
      const state = states[currentIndex];
      if (reloading > 0 || switching > 0) return;
      if (state.mag >= state.def.magSize || state.reserve <= 0) return;
      reloading = state.def.reload;
      reloadDuration = state.def.reload;
      audio.reloadStart();
    },

    switchTo(index) {
      if (index === currentIndex || index < 0 || index >= states.length) return;
      if (switching > 0) return;
      switching = 0.26;
      switchTarget = index;
      reloading = 0;
      audio.weaponSwitch();
    },

    addAmmoAll() {
      for (const state of states) {
        state.reserve = Math.min(state.def.reserveStart * 2, state.reserve + state.def.magSize * 3);
      }
    },

    reset() {
      for (const [index, state] of states.entries()) {
        state.mag = state.def.magSize;
        state.reserve = state.def.reserveStart;
        state.cooldown = 0;
        state.model.visible = index === 0;
      }
      currentIndex = 0;
      reloading = 0;
      switching = 0;
      bloom = 0;
    },

    fireOnce(player) {
      const state = states[currentIndex];
      const def = state.def;
      state.mag -= 1;
      state.cooldown = 60 / def.rpm;
      bloom = Math.min(1, bloom + def.bloomPerShot);
      audio.shoot(def.id);

      const origin = player.eyePos(new THREE.Vector3());
      const baseDir = player.viewDir(new THREE.Vector3());
      const ads = adsT > 0.6;
      const moveFactor = player.sprinting ? 1.7 : 1;
      const spread = def.spread * (ads ? 0.25 : 1) * moveFactor * (1 + bloom * 1.6);
      state.model.updateWorldMatrix(true, false);
      muzzleWorld.setFromMatrixPosition(state.flash.matrixWorld);

      for (let pellet = 0; pellet < def.pellets; pellet += 1) {
        shotDir.copy(baseDir);
        shotDir.x += (Math.random() * 2 - 1) * spread;
        shotDir.y += (Math.random() * 2 - 1) * spread;
        shotDir.z += (Math.random() * 2 - 1) * spread;
        shotDir.normalize();
        const hit = hooks.shootRay(origin, shotDir, 120);
        const end = hit ? hit.point : origin.clone().addScaledVector(shotDir, 90);
        effects.tracer(muzzleWorld, end, 0xffd9a0);
        if (hit) hooks.onHit(hit, def.damage);
      }
      effects.muzzle(muzzleWorld);
      effects.muzzleSmoke(muzzleWorld);
      state.flash.material.opacity = 0.95;
      state.flash.rotation.z = Math.random() * Math.PI;
      const flashScale = def.id === 'shotgun' || def.id === 'sniper' ? 1.5 : 1;
      state.flash.scale.set(flashScale, flashScale, flashScale);
      state.flashLife = 0.07;
      kickZ += def.id === 'shotgun' ? 0.16 : def.id === 'sniper' ? 0.2 : 0.07;
      kickRot += def.id === 'sniper' ? 0.05 : 0.02;
      player.applyRecoil(def.recoil * (ads ? 0.65 : 1), (Math.random() * 2 - 1) * def.recoil * 0.3);
      if (def.id === 'shotgun' || def.id === 'sniper') player.addShake(0.008);
    },

    update(dt, input, player) {
      const state = states[currentIndex];
      const def = state.def;

      // ADS: right mouse held, not reloading/switching.
      const wantAds = input.ads && reloading <= 0 && switching <= 0 && player.alive;
      adsT += ((wantAds ? 1 : 0) - adsT) * Math.min(1, dt * 11);
      player.adsFactor = 1 - adsT * 0.5;
      player.fovTarget = adsT > 0.05 ? 75 / (1 + (def.zoom - 1) * adsT) : 75;

      // Timers.
      if (state.cooldown > 0) state.cooldown -= dt;
      if (state.flashLife > 0) {
        state.flashLife -= dt;
        if (state.flashLife <= 0) state.flash.material.opacity = 0;
      }
      if (reloading > 0) {
        reloading -= dt;
        if (reloading <= 0) {
          const take = Math.min(def.magSize - state.mag, state.reserve);
          state.mag += take;
          state.reserve -= take;
          audio.reloadEnd();
        }
      }
      if (switching > 0) {
        switching -= dt;
        if (switching <= 0.13 && switchTarget >= 0) {
          states[currentIndex].model.visible = false;
          currentIndex = switchTarget;
          states[currentIndex].model.visible = true;
          switchTarget = -1;
        }
      }

      // Trigger.
      if (input.reloadPressed) this.startReload();
      if (input.switchTo >= 0) this.switchTo(input.switchTo);
      const triggerDown = def.auto ? input.firing : input.firePressed;
      if (triggerDown && state.cooldown <= 0 && reloading <= 0 && switching <= 0 && player.alive) {
        if (state.mag <= 0) {
          audio.dryFire();
          state.cooldown = 0.3;
          if (state.reserve > 0) this.startReload();
        } else {
          this.fireOnce(player);
        }
      }
      if (input.firing && state.mag === 0 && state.reserve > 0 && reloading <= 0 && switching <= 0) {
        this.startReload();
      }

      // Pose: hip position eases to the ADS position; recoil kick and reload dip compose on top.
      bloom = Math.max(0, bloom - dt * 3.2);
      kickZ = Math.max(0, kickZ - dt * kickZ * 9 - dt * 0.05);
      kickRot = Math.max(0, kickRot - dt * kickRot * 8 - dt * 0.02);
      swayX += ((input.lookDX * -0.0006) - swayX) * Math.min(1, dt * 8);
      swayY += ((input.lookDY * 0.0006) - swayY) * Math.min(1, dt * 8);
      const hipPos = { x: 0.26, y: -0.245, z: -0.45 };
      const adsPos = { x: 0, y: -0.148, z: -0.35 };
      const dip = switching > 0 ? Math.sin((switching / 0.26) * Math.PI) * 0.22 : 0;
      const reloadDip = reloading > 0 ? Math.sin((1 - reloading / reloadDuration) * Math.PI) * 0.16 : 0;
      state.model.position.set(
        hipPos.x + (adsPos.x - hipPos.x) * adsT + swayX,
        hipPos.y + (adsPos.y - hipPos.y) * adsT + swayY - dip - reloadDip,
        hipPos.z + (adsPos.z - hipPos.z) * adsT + kickZ,
      );
      state.model.rotation.set(
        kickRot + (reloading > 0 ? Math.sin((1 - reloading / reloadDuration) * Math.PI) * 0.5 : 0) + dip * 1.4,
        swayX * 2.4,
        dip * 0.4,
      );
      holder.position.set(0, 0, 0);
    },
  };

  weapons.reset();
  return weapons;
}
