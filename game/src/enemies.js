// Hostile operators: soldier rigs built from primitives (legs, torso, head with a glowing visor,
// gun arm) animated in code — walk cycle, aim pose, cover crouch, hit flinch, death fall.
// The AI perceives through line-of-sight, pathfinds on the facility grid, advances, takes cover
// when hurt, and fires accuracy-rolled bursts. Four types fly the brief's variety: trooper,
// rusher, marksman and the armoured heavy.
import * as THREE from 'three';
import { ENEMY_TYPES } from './config.js';
import { findPath, lineOfSight, collide } from './map.js';

const DARK = new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.7, metalness: 0.3 });
const GUN = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.5, metalness: 0.5 });

function part(w, h, d, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildRig(typeDef) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: typeDef.color, roughness: 0.65, metalness: 0.2 });
  const visorMat = new THREE.MeshBasicMaterial({ color: typeDef.visor });

  const legL = new THREE.Group(); legL.position.set(-0.14, 0.95, 0); group.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.14, 0.95, 0); group.add(legR);
  part(0.17, 0.95, 0.21, DARK, 0, -0.475, 0, legL);
  part(0.17, 0.95, 0.21, DARK, 0, -0.475, 0, legR);
  part(0.2, 0.1, 0.3, DARK, 0, -0.92, -0.04, legL); // boots
  part(0.2, 0.1, 0.3, DARK, 0, -0.92, -0.04, legR);

  const torso = new THREE.Group(); torso.position.set(0, 0.95, 0); group.add(torso);
  const scale = typeDef.id === 'heavy' ? 1.18 : 1;
  torso.scale.set(scale, 1, scale);
  part(0.52, 0.74, 0.3, bodyMat, 0, 0.37, 0, torso); // chest
  part(0.56, 0.4, 0.36, DARK, 0, 0.42, 0, torso); // vest
  part(0.2, 0.14, 0.34, bodyMat, -0.36, 0.62, 0, torso); // shoulder pads
  part(0.2, 0.14, 0.34, bodyMat, 0.36, 0.62, 0, torso);

  const head = new THREE.Group(); head.position.set(0, 0.82, 0); torso.add(head);
  part(0.27, 0.3, 0.29, bodyMat, 0, 0.13, 0, head); // helmet
  const visor = part(0.24, 0.07, 0.02, visorMat, 0, 0.14, -0.15, head);
  visor.castShadow = false;

  const armR = new THREE.Group(); armR.position.set(0.36, 0.62, 0); torso.add(armR);
  part(0.13, 0.55, 0.15, bodyMat, 0, -0.2, -0.05, armR);
  const gun = part(0.07, 0.1, 0.62, GUN, 0.02, -0.42, -0.3, armR);
  gun.castShadow = false;
  const armL = new THREE.Group(); armL.position.set(-0.36, 0.62, 0); torso.add(armL);
  part(0.13, 0.5, 0.15, bodyMat, 0, -0.16, -0.12, armL);

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
