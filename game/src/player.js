// The operator: first-person controller with walk/sprint/crouch/jump, head-bob, footsteps,
// landing, recoil kick and screen shake on the camera, plus health/armor bookkeeping.
// Movement collides against the facility grid and props via map.collide.
import * as THREE from '../vendor/three.module.min.js';
import { PLAYER } from './config.js';
import { collide } from './map.js';

export function createPlayer(camera, world, audio) {
  const pos = new THREE.Vector3(world.playerSpawn.x, 0, world.playerSpawn.z);
  const velocity = new THREE.Vector3();
  let yaw = 0; // face north, into the facility (yard spawn looks toward the complex)
  let pitch = 0;
  let vy = 0;
  let grounded = true;
  let crouching = false;
  let eyeHeight = PLAYER.standEye;
  let bobPhase = 0;
  let bobAmount = 0;
  let stepCycle = 0;
  let recoilPitch = 0;
  let recoilYaw = 0;
  let shakeMag = 0;
  let fov = 75;

  const player = {
    pos,
    radius: PLAYER.radius,
    health: PLAYER.maxHealth,
    armor: 0,
    alive: true,
    sprinting: false,
    adsFactor: 1, // weapons lower this while aiming down sights
    fovTarget: 75,
    sensitivity: 1,

    reset(spawn) {
      pos.set(spawn.x, 0, spawn.z);
      velocity.set(0, 0, 0);
      vy = 0;
      yaw = 0;
      pitch = 0;
      this.health = PLAYER.maxHealth;
      this.armor = 25;
      this.alive = true;
      recoilPitch = 0;
      recoilYaw = 0;
      shakeMag = 0;
    },

    eyePos(out = new THREE.Vector3()) {
      return out.set(pos.x, pos.y + eyeHeight, pos.z);
    },

    viewDir(out = new THREE.Vector3()) {
      const cp = Math.cos(pitch + recoilPitch);
      return out.set(
        -Math.sin(yaw + recoilYaw) * cp,
        Math.sin(pitch + recoilPitch),
        -Math.cos(yaw + recoilYaw) * cp,
      );
    },

    applyRecoil(pitchKick, yawKick) {
      recoilPitch += pitchKick;
      recoilYaw += yawKick;
    },

    addShake(amount) {
      shakeMag = Math.min(0.05, shakeMag + amount);
    },

    damage(amount) {
      if (!this.alive) return false;
      let remaining = amount;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, Math.ceil(amount * 0.65));
        this.armor -= absorbed;
        remaining = amount - absorbed;
      }
      this.health -= remaining;
      this.addShake(0.012);
      if (this.health <= 0) {
        this.health = 0;
        this.alive = false;
        return true;
      }
      return false;
    },

    heal(amount) {
      this.health = Math.min(PLAYER.maxHealth, this.health + amount);
    },

    addArmor(amount) {
      this.armor = Math.min(PLAYER.maxArmor, this.armor + amount);
    },

    update(dt, input) {
      if (!this.alive) {
        // Death cam: sink and tilt.
        eyeHeight = Math.max(0.45, eyeHeight - dt * 1.4);
        camera.position.set(pos.x, pos.y + eyeHeight, pos.z);
        camera.rotation.set(-0.4, yaw, 0.35, 'YXZ');
        return;
      }

      // Look.
      yaw -= input.lookDX * 0.0021 * this.sensitivity;
      pitch -= input.lookDY * 0.0021 * this.sensitivity;
      pitch = Math.max(-1.45, Math.min(1.45, pitch));

      crouching = input.crouch;
      const targetEye = crouching ? PLAYER.crouchEye : PLAYER.standEye;
      eyeHeight += (targetEye - eyeHeight) * Math.min(1, dt * 11);

      // Wish direction in world space.
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      let wishX = 0;
      let wishZ = 0;
      if (input.forward) { wishX -= sin; wishZ -= cos; }
      if (input.back) { wishX += sin; wishZ += cos; }
      if (input.left) { wishX -= cos; wishZ += sin; }
      if (input.right) { wishX += cos; wishZ -= sin; }
      const wishLength = Math.hypot(wishX, wishZ);
      const moving = wishLength > 0.01;
      if (moving) { wishX /= wishLength; wishZ /= wishLength; }

      this.sprinting = moving && input.sprint && !crouching && !input.back && this.adsFactor > 0.9;
      let speed = crouching ? PLAYER.crouchSpeed : (this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed);
      speed *= this.adsFactor < 0.9 ? 0.55 : 1;

      const accel = grounded ? 42 : 6;
      velocity.x += wishX * accel * dt;
      velocity.z += wishZ * accel * dt;
      if (grounded) {
        const friction = moving ? 1.5 : 11;
        velocity.x -= velocity.x * Math.min(1, friction * dt);
        velocity.z -= velocity.z * Math.min(1, friction * dt);
      }
      const horizontal = Math.hypot(velocity.x, velocity.z);
      if (horizontal > speed) {
        velocity.x = (velocity.x / horizontal) * speed;
        velocity.z = (velocity.z / horizontal) * speed;
      }

      // Vertical: gravity and jump.
      if (grounded && input.jump && !crouching) {
        vy = PLAYER.jumpVelocity;
        grounded = false;
        audio.jump();
      }
      vy -= PLAYER.gravity * dt;
      pos.y += vy * dt;
      pos.x += velocity.x * dt;
      pos.z += velocity.z * dt;
      collide(pos, this.radius, world.colliders);
      if (pos.y <= 0) {
        if (!grounded && vy < -6) {
          audio.land();
          this.addShake(0.006);
        }
        pos.y = 0;
        vy = 0;
        grounded = true;
      }

      // Head-bob and footsteps follow horizontal speed on the ground.
      if (grounded && horizontal > 0.6) {
        const rate = horizontal * 1.55;
        bobPhase += dt * rate;
        stepCycle += dt * rate;
        bobAmount = Math.min(1, horizontal / PLAYER.walkSpeed);
        if (stepCycle > Math.PI * 2) {
          stepCycle -= Math.PI * 2;
          audio.footstep(this.sprinting);
        }
      } else {
        bobAmount = Math.max(0, bobAmount - dt * 5);
      }
      const bobY = Math.sin(bobPhase * 2) * 0.028 * bobAmount;
      const bobX = Math.cos(bobPhase) * 0.02 * bobAmount;

      // Recoil and shake decay.
      recoilPitch = Math.max(0, recoilPitch - dt * recoilPitch * 7 - dt * 0.02);
      recoilYaw *= Math.max(0, 1 - dt * 9);
      shakeMag = Math.max(0, shakeMag - dt * 0.09);
      const shakeX = (Math.random() * 2 - 1) * shakeMag;
      const shakeY = (Math.random() * 2 - 1) * shakeMag;

      // FOV eases toward the target (ADS zoom, sprint stretch).
      const target = this.sprinting && moving ? 79 : this.fovTarget;
      fov += (target - fov) * Math.min(1, dt * 10);
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

      camera.position.set(
        pos.x + (-Math.cos(yaw)) * bobX * 0 + Math.cos(yaw) * bobX,
        pos.y + eyeHeight + bobY,
        pos.z - Math.sin(yaw) * bobX,
      );
      camera.rotation.set(pitch + recoilPitch + shakeY, yaw + recoilYaw + shakeX, 0, 'YXZ');
    },

    get yaw() { return yaw; },
    get pitch() { return pitch; },
    setLook(newYaw, newPitch) {
      yaw = newYaw;
      pitch = newPitch;
    },
  };

  player.reset(world.playerSpawn);
  return player;
}
