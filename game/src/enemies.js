// Hostile operators: soldier rigs built from primitives (legs, torso, head with a glowing visor,
// gun arm) animated in code — walk cycle, aim pose, cover crouch, hit flinch, death fall.
// The AI perceives through line-of-sight, pathfinds on the facility grid, advances, takes cover
// when hurt, and fires accuracy-rolled bursts. Four types fly the brief's variety: trooper,
// rusher, marksman and the armoured heavy.
import * as THREE from '../vendor/three.module.min.js';
import { ENEMY_TYPES } from './config.js';
import { findPath, lineOfSight, collide } from './map.js';

const DARK = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.62, metalness: 0.32 });
const FABRIC = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.96, metalness: 0.0 });
const GUN = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.45, metalness: 0.55 });

function part(w, h, d, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// A human-proportioned operator (~1.85 m): fabric uniform underlayer, segmented armour
// plates over it, helmet with an emissive visor slit, gloves, knee pads, belt pouches,
// backpack and a radio with antenna. Same group pivots as always, so the animation
// code (walk cycle, aim, crouch, death fall) drives it unchanged.
function buildRig(typeDef) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: typeDef.color, roughness: 0.58, metalness: 0.28 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x07080a, emissive: typeDef.visor, emissiveIntensity: 1.5, roughness: 0.35, metalness: 0.2 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x0c0d10, emissive: typeDef.visor, emissiveIntensity: 0.4, roughness: 0.6 });

  // --- Legs: thigh (fabric), knee pad (plate), shin (gear), boot. ---
  function buildLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(0.13 * side, 0.95, 0);
    group.add(leg);
    part(0.17, 0.46, 0.2, FABRIC, 0, -0.23, 0, leg); // thigh
    part(0.18, 0.15, 0.06, bodyMat, 0, -0.47, -0.11, leg); // knee pad
    part(0.15, 0.4, 0.17, DARK, 0, -0.68, 0, leg); // shin
    part(0.16, 0.1, 0.28, DARK, 0, -0.92, -0.05, leg); // boot
    part(0.06, 0.16, 0.15, DARK, 0.115 * side, -0.25, 0, leg); // thigh pouch
    return leg;
  }
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // --- Torso: pelvis, belt + pouches, segmented plates, chest rig, backpack + radio. ---
  const torso = new THREE.Group(); torso.position.set(0, 0.95, 0); group.add(torso);
  const scale = typeDef.id === 'heavy' ? 1.18 : 1;
  torso.scale.set(scale, 1, scale);
  part(0.42, 0.2, 0.27, FABRIC, 0, 0.04, 0, torso); // pelvis
  part(0.44, 0.09, 0.29, DARK, 0, 0.14, 0, torso); // belt
  part(0.11, 0.13, 0.06, DARK, -0.13, 0.1, -0.17, torso); // belt pouches
  part(0.11, 0.13, 0.06, DARK, 0.13, 0.1, -0.17, torso);
  part(0.4, 0.2, 0.28, bodyMat, 0, 0.3, 0, torso); // abdomen plate
  part(0.52, 0.36, 0.31, bodyMat, 0, 0.55, 0, torso); // chest plate
  part(0.54, 0.18, 0.34, FABRIC, 0, 0.5, 0, torso); // chest rig band
  for (const px of [-0.15, 0, 0.15]) part(0.1, 0.14, 0.05, DARK, px, 0.48, -0.19, torso); // mag pouches
  part(0.26, 0.035, 0.012, accentMat, 0, 0.68, -0.16, torso); // unit stripe
  part(0.46, 0.4, 0.06, bodyMat, 0, 0.52, 0.17, torso); // back plate
  part(0.38, 0.42, 0.15, DARK, 0, 0.5, 0.27, torso); // backpack
  part(0.3, 0.12, 0.12, FABRIC, 0, 0.76, 0.27, torso); // backpack top pouch
  part(0.13, 0.18, 0.06, DARK, 0.1, 0.84, 0.28, torso); // radio
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), DARK);
  antenna.position.set(0.14, 1.08, 0.28);
  torso.add(antenna);
  part(0.23, 0.15, 0.3, bodyMat, -0.35, 0.7, 0, torso); // pauldrons
  part(0.23, 0.15, 0.3, bodyMat, 0.35, 0.7, 0, torso);
  part(0.3, 0.1, 0.3, FABRIC, 0, 0.78, 0, torso); // collar

  // --- Head: helmet shell, brim, face guard, emissive visor, rails, NVG mount. ---
  const head = new THREE.Group(); head.position.set(0, 0.82, 0); torso.add(head);
  part(0.28, 0.27, 0.3, bodyMat, 0, 0.15, 0, head); // helmet
  part(0.31, 0.045, 0.35, DARK, 0, 0.05, 0, head); // brim
  part(0.23, 0.13, 0.26, FABRIC, 0, -0.03, 0, head); // face guard
  const visor = part(0.25, 0.06, 0.02, visorMat, 0, 0.15, -0.155, head);
  visor.castShadow = false;
  part(0.035, 0.09, 0.2, DARK, -0.155, 0.13, 0, head); // side rails
  part(0.035, 0.09, 0.2, DARK, 0.155, 0.13, 0, head);
  part(0.07, 0.06, 0.07, DARK, 0, 0.31, -0.08, head); // NVG mount
  part(0.12, 0.1, 0.05, DARK, 0, 0.12, 0.17, head); // counterweight pouch

  // --- Arms: armoured upper arm, fabric forearm, glove; the gun arm keeps its gun. ---
  function buildArm(side, withGun) {
    const arm = new THREE.Group();
    arm.position.set(0.36 * side, 0.62, 0);
    torso.add(arm);
    part(0.14, 0.32, 0.16, bodyMat, 0, -0.14, 0, arm); // upper arm
    part(0.15, 0.1, 0.17, DARK, 0, -0.31, 0, arm); // elbow pad
    part(0.12, 0.28, 0.14, FABRIC, 0, -0.45, -0.02, arm); // forearm
    part(0.11, 0.13, 0.13, DARK, 0, -0.63, -0.03, arm); // glove
    if (withGun) {
      const gun = part(0.07, 0.1, 0.62, GUN, 0.02, -0.42, -0.3, arm);
      gun.castShadow = false;
      part(0.05, 0.14, 0.08, DARK, 0.02, -0.52, -0.12, arm); // magazine
    }
    return arm;
  }
  const armR = buildArm(1, true);
  const armL = buildArm(-1, false);

  return { group, legL, legR, torso, head, armR, armL, bodyMat };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export function createEnemyManager(scene, world, effects, audio) {
  const enemies = [];

  function spawn(typeId, x, z) {
    const def = ENEMY_TYPES[typeId] ?? ENEMY_TYPES.trooper;
    const rig = buildRig(def);
    rig.group.position.set(x, 0, z);
    scene.add(rig.group);
    const enemy = {
      id: enemies.length + Math.floor(Math.random() * 1e6),
      type: def,
      group: rig.group,
      rig,
      hp: def.hp,
      maxHp: def.hp,
      alive: true,
      radius: 0.42,
      state: 'advance',
      path: [],
      pathIndex: 0,
      repathT: Math.random() * 0.4,
      stateT: 0,
      burstLeft: 0,
      burstWait: 0.8 + Math.random() * 1.2,
      shotT: 0,
      walkPhase: Math.random() * 6,
      yaw: Math.PI,
      flashT: 0,
      flinchT: 0,
      deadT: 0,
      lastKnown: null,
      memoryT: 0,
      coverPoint: null,
      coverStage: '',
      coverT: 0,
      hurtRecently: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeT: 0,
    };
    enemies.push(enemy);
    return enemy;
  }

  function damage(enemy, amount, hitPoint, hooks) {
    if (!enemy.alive) return false;
    enemy.hp -= amount;
    enemy.flashT = 0.09;
    enemy.flinchT = 0.16;
    enemy.hurtRecently = Math.min(30, enemy.hurtRecently + amount);
    enemy.lastKnown = hooks.playerPos.clone();
    enemy.memoryT = 5;
    effects.hitFlesh(hitPoint);
    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.deadT = 0;
      effects.deathBurst(_v1.set(enemy.group.position.x, 1.2, enemy.group.position.z));
      hooks.onDeath(enemy);
      return true;
    }
    return false;
  }

  /** Analytic ray vs head/chest/pelvis spheres; returns the nearest enemy hit or null. */
  function raycast(origin, dir, maxDist) {
    let best = null;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const base = enemy.group.position;
      const crouchDrop = enemy.state === 'cover' && enemy.coverStage === 'hide' ? 0.35 : 0;
      const spheres = [
        { y: 1.78 - crouchDrop, r: 0.24, head: true },
        { y: 1.28 - crouchDrop, r: 0.46, head: false },
        { y: 0.68 - crouchDrop * 0.5, r: 0.42, head: false },
      ];
      for (const sphere of spheres) {
        _v1.set(base.x, sphere.y, base.z).sub(origin);
        const tca = _v1.dot(dir);
        if (tca < 0 || tca > maxDist) continue;
        const d2 = _v1.lengthSq() - tca * tca;
        const r2 = sphere.r * sphere.r;
        if (d2 > r2) continue;
        const t = tca - Math.sqrt(r2 - d2);
        if (t < 0 || t > maxDist) continue;
        if (best === null || t < best.dist) {
          best = {
            enemy,
            head: sphere.head,
            dist: t,
            point: origin.clone().addScaledVector(dir, t),
          };
        }
      }
    }
    return best;
  }

  function faceToward(enemy, targetX, targetZ, dt, rate = 10) {
    const targetYaw = Math.atan2(-(targetX - enemy.group.position.x), -(targetZ - enemy.group.position.z));
    let diff = targetYaw - enemy.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    enemy.yaw += diff * Math.min(1, dt * rate);
    enemy.group.rotation.y = enemy.yaw;
  }

  function moveAlongPath(enemy, dt, speed) {
    if (enemy.pathIndex >= enemy.path.length) return true;
    const target = enemy.path[enemy.pathIndex];
    const pos = enemy.group.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.45) {
      enemy.pathIndex += 1;
      return enemy.pathIndex >= enemy.path.length;
    }
    pos.x += (dx / dist) * speed * dt;
    pos.z += (dz / dist) * speed * dt;
    collide(pos, enemy.radius, world.colliders);
    faceToward(enemy, target.x, target.z, dt);
    enemy.walkPhase += dt * speed * 2.1;
    return false;
  }

  function setPath(enemy, target) {
    enemy.path = findPath(enemy.group.position, target);
    enemy.pathIndex = enemy.path.length > 1 ? 1 : 0;
  }

  function nearestCover(enemy, playerPos) {
    let bestPoint = null;
    let bestScore = Infinity;
    for (const point of world.coverPoints) {
      const distToEnemy = Math.hypot(point.x - enemy.group.position.x, point.z - enemy.group.position.z);
      if (distToEnemy > 16) continue;
      // Cover only counts when its blocking side faces the player.
      const toPlayerX = playerPos.x - point.x;
      const toPlayerZ = playerPos.z - point.z;
      if (toPlayerX * point.dirX + toPlayerZ * point.dirZ <= 0.2) continue;
      const score = distToEnemy + Math.random() * 2;
      if (score < bestScore) { bestScore = score; bestPoint = point; }
    }
    return bestPoint;
  }

  function fireShot(enemy, ctx) {
    const def = enemy.type;
    const pos = enemy.group.position;
    const dist = Math.hypot(ctx.playerPos.x - pos.x, ctx.playerPos.z - pos.z);
    const gunTip = _v1.set(pos.x, 1.45, pos.z).add(_v2.set(-Math.sin(enemy.yaw), 0, -Math.cos(enemy.yaw)).multiplyScalar(0.7));
    audio.enemyShoot(dist);
    let hitChance = def.accuracy * THREE.MathUtils.clamp(20 / (dist + 6), 0.3, 1.05);
    if (ctx.playerSprinting) hitChance *= 0.75;
    if (ctx.playerCrouching) hitChance *= 0.8;
    const target = new THREE.Vector3(ctx.playerPos.x, ctx.playerPos.y + 1.25, ctx.playerPos.z);
    if (Math.random() < hitChance) {
      effects.tracer(gunTip.clone(), target, 0xff7a5c);
      ctx.onPlayerDamage(def.damage);
    } else {
      target.x += (Math.random() * 2 - 1) * 1.6;
      target.y += (Math.random() * 2 - 1) * 0.9;
      target.z += (Math.random() * 2 - 1) * 1.6;
      effects.tracer(gunTip.clone(), target, 0xff7a5c);
      effects.sparks(target);
    }
  }

  function updateEnemy(enemy, dt, ctx) {
    const { rig } = enemy;
    const pos = enemy.group.position;

    if (!enemy.alive) {
      enemy.deadT += dt;
      const fall = Math.min(1, enemy.deadT / 0.45);
      rig.group.rotation.x = -fall * (Math.PI / 2) * 0.92;
      rig.group.position.y = -Math.max(0, enemy.deadT - 5) * 0.25;
      return enemy.deadT > 6.5;
    }

    // Material feedback decays.
    if (enemy.flashT > 0) {
      enemy.flashT -= dt;
      rig.bodyMat.emissive.setRGB(0.9, 0.12, 0.1);
      rig.bodyMat.emissiveIntensity = Math.max(0, enemy.flashT / 0.09);
    } else {
      rig.bodyMat.emissiveIntensity = 0;
    }
    if (enemy.flinchT > 0) enemy.flinchT -= dt;
    enemy.hurtRecently = Math.max(0, enemy.hurtRecently - dt * 9);

    // Perception.
    const distToPlayer = Math.hypot(ctx.playerPos.x - pos.x, ctx.playerPos.z - pos.z);
    const seesPlayer = ctx.playerAlive && distToPlayer < 46
      && (distToPlayer < 5.5 || lineOfSight(pos.x, pos.z, ctx.playerPos.x, ctx.playerPos.z));
    if (seesPlayer) {
      enemy.lastKnown = _v2.copy(ctx.playerPos).clone();
      enemy.memoryT = 5;
    } else if (enemy.memoryT > 0) {
      enemy.memoryT -= dt;
      if (enemy.memoryT <= 0) enemy.lastKnown = null;
    }

    const def = enemy.type;
    enemy.stateT += dt;
    enemy.repathT -= dt;

    // Choose cover when badly hurt (rushers and heavies never hide).
    if (enemy.state !== 'cover' && enemy.hurtRecently > enemy.maxHp * 0.3 && def.cover) {
      const point = nearestCover(enemy, ctx.playerPos);
      if (point) {
        enemy.state = 'cover';
        enemy.coverPoint = point;
        enemy.coverStage = 'move';
        enemy.hurtRecently = 0;
        setPath(enemy, point);
      }
    }

    if (enemy.state === 'cover' && enemy.coverPoint) {
      if (enemy.coverStage === 'move') {
        if (moveAlongPath(enemy, dt, def.speed * 1.15) || enemy.stateT > 6) {
          enemy.coverStage = 'hide';
          enemy.coverT = 0.7 + Math.random() * 1.1;
          enemy.stateT = 0;
        }
      } else if (enemy.coverStage === 'hide') {
        enemy.coverT -= dt;
        faceToward(enemy, ctx.playerPos.x, ctx.playerPos.z, dt);
        if (enemy.coverT <= 0) {
          enemy.coverStage = 'peek';
          enemy.coverT = 1 + Math.random() * 0.8;
          enemy.burstLeft = def.burst;
          enemy.shotT = 0;
        }
      } else if (enemy.coverStage === 'peek') {
        enemy.coverT -= dt;
        faceToward(enemy, ctx.playerPos.x, ctx.playerPos.z, dt);
        if (seesPlayer) runBurst(enemy, dt, ctx);
        if (enemy.coverT <= 0) {
          enemy.state = 'advance';
          enemy.coverStage = '';
          enemy.stateT = 0;
        }
      }
    } else if (seesPlayer && distToPlayer < def.range && distToPlayer > def.preferredMin) {
      // Attack: hold ground, strafe a little, fire bursts.
      enemy.state = 'attack';
      faceToward(enemy, ctx.playerPos.x, ctx.playerPos.z, dt);
      enemy.strafeT -= dt;
      if (enemy.strafeT <= 0) {
        enemy.strafeT = 0.9 + Math.random() * 1.2;
        enemy.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const strafeSpeed = def.id === 'marksman' ? 0.4 : 1.1;
      pos.x += Math.cos(enemy.yaw) * enemy.strafeDir * strafeSpeed * dt;
      pos.z += -Math.sin(enemy.yaw) * enemy.strafeDir * strafeSpeed * dt;
      collide(pos, enemy.radius, world.colliders);
      runBurst(enemy, dt, ctx);
      if (def.id === 'marksman' && distToPlayer < 14) {
        // Marksmen fall back when crowded.
        pos.x += Math.sin(enemy.yaw) * 2.2 * dt;
        pos.z += Math.cos(enemy.yaw) * 2.2 * dt;
        collide(pos, enemy.radius, world.colliders);
      }
    } else {
      // Advance on the last known position (or the player when visible but out of range).
      enemy.state = 'advance';
      const target = seesPlayer ? ctx.playerPos : enemy.lastKnown;
      if (target) {
        if (enemy.repathT <= 0) {
          enemy.repathT = 0.55 + Math.random() * 0.3;
          setPath(enemy, target);
        }
        const arrived = moveAlongPath(enemy, dt, def.speed);
        if (arrived && !seesPlayer) {
          // Look around at the last known spot.
          enemy.yaw += dt * 1.4;
          enemy.group.rotation.y = enemy.yaw;
        }
      } else {
        // Idle patrol sway at post.
        enemy.yaw += Math.sin(enemy.stateT * 0.5) * dt * 0.3;
        enemy.group.rotation.y = enemy.yaw;
      }
    }

    // Pose: walk cycle, aim, crouch in cover, flinch.
    const moving = enemy.state === 'advance' || enemy.coverStage === 'move';
    const swing = moving ? Math.sin(enemy.walkPhase) * 0.55 : 0;
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;
    const engaged = seesPlayer || enemy.state === 'attack' || enemy.coverStage === 'peek';
    rig.armR.rotation.x = engaged ? -1.32 : -0.25;
    rig.armL.rotation.x = engaged ? -1.05 : -0.2;
    rig.armL.rotation.z = engaged ? -0.5 : 0;
    const crouchDrop = enemy.state === 'cover' && enemy.coverStage === 'hide' ? 0.35 : 0;
    rig.group.position.y = -crouchDrop;
    rig.legL.rotation.x += crouchDrop > 0 ? 0.9 : 0;
    rig.legR.rotation.x += crouchDrop > 0 ? -0.5 : 0;
    rig.torso.rotation.x = (enemy.flinchT > 0 ? -0.22 : 0) + (engaged ? 0.06 : 0);
    rig.head.rotation.y = THREE.MathUtils.clamp(Math.sin(enemy.stateT * 0.7) * 0.14, -0.2, 0.2);
    return false;
  }

  function runBurst(enemy, dt, ctx) {
    if (enemy.burstLeft > 0) {
      enemy.shotT -= dt;
      if (enemy.shotT <= 0) {
        enemy.shotT = enemy.type.fireInterval;
        enemy.burstLeft -= 1;
        fireShot(enemy, ctx);
      }
    } else {
      enemy.burstWait -= dt;
      if (enemy.burstWait <= 0) {
        enemy.burstLeft = enemy.type.burst;
        enemy.burstWait = enemy.type.burstPause * (0.7 + Math.random() * 0.6);
        enemy.shotT = 0;
      }
    }
  }

  return {
    spawn,
    damage,
    raycast,
    get list() { return enemies; },
    aliveCount() { return enemies.filter((enemy) => enemy.alive).length; },
    update(dt, ctx) {
      // Gentle separation so squads do not stack into one body.
      for (let i = 0; i < enemies.length; i += 1) {
        const a = enemies[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < enemies.length; j += 1) {
          const b = enemies[j];
          if (!b.alive) continue;
          const dx = b.group.position.x - a.group.position.x;
          const dz = b.group.position.z - a.group.position.z;
          const distSq = dx * dx + dz * dz;
          if (distSq > 0.001 && distSq < 0.85) {
            const dist = Math.sqrt(distSq);
            const push = (0.92 - dist) * 0.5;
            const nx = (dx / dist) * push;
            const nz = (dz / dist) * push;
            a.group.position.x -= nx * dt * 3;
            a.group.position.z -= nz * dt * 3;
            b.group.position.x += nx * dt * 3;
            b.group.position.z += nz * dt * 3;
          }
        }
      }
      for (let i = enemies.length - 1; i >= 0; i -= 1) {
        if (updateEnemy(enemies[i], dt, ctx)) {
          scene.remove(enemies[i].group);
          enemies.splice(i, 1);
        }
      }
    },
    clear() {
      for (const enemy of enemies) scene.remove(enemy.group);
      enemies.length = 0;
    },
  };
}
