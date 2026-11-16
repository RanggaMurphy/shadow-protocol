// Combat operators for every team: human-proportioned rigs built from capsules, tapered
// cylinders and spheres — never boxes for bodies. Hostiles dress T-side (earth-tone shirts,
// jeans, shemagh or balaclava wraps, sunglasses, thigh holsters); friendlies dress CT-side
// (blue-grey uniform, vest, helmet, goggles). The AI perceives through line-of-sight,
// pathfinds on the facility grid, advances, takes cover when hurt, and fires accuracy-rolled
// bursts at whichever foe it can see — the player and the player's team included.
import * as THREE from '../vendor/three.module.min.js';
import { ENEMY_TYPES } from './config.js';
import { findPath, lineOfSight, collide } from './map.js';

const GUN = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.45, metalness: 0.55 });
const DARK_GEAR = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.85, metalness: 0.05 });

function makeShemaghTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c6b694';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(110, 92, 60, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(140, 60, 44, 0.35)';
  for (let i = 8; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
const SHEMAGH = new THREE.MeshStandardMaterial({ map: makeShemaghTexture(), roughness: 0.95, metalness: 0 });
const BALACLAVA = new THREE.MeshStandardMaterial({ color: 0x232019, roughness: 0.95, metalness: 0 });
const SUNGLASSES = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.15, metalness: 0.35 });
const SKIN_TONES = [0x8a5f43, 0x6e4a32, 0xa9744f, 0x54382a, 0x7a5238];
const ENEMY_SHIRTS = { trooper: 0x8a7a52, rusher: 0x74563a, marksman: 0x6d7259, heavy: 0x5d4a38 };

function box(w, h, d, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function capsule(radius, length, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 12), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function ball(radius, material, x, y, z, parent, sy = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 12), material);
  mesh.position.set(x, y, z);
  mesh.scale.y = sy;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function tapered(rTop, rBottom, h, material, x, y, z, parent, flatZ = 0.8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 14), material);
  mesh.position.set(x, y, z);
  mesh.scale.z = flatZ;
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// A human operator (~1.85 m) on the same group pivots the animation code has always used:
// legs at the hips, torso above them, head and arms parented to the torso. Enemies read as
// irregular fighters (jeans, shirts, wraps, sunglasses); allies as uniformed CT operators.
function buildRig(typeDef, team, variant) {
  const isAlly = team === 'ally';
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({
    color: SKIN_TONES[variant % SKIN_TONES.length], roughness: 0.72, metalness: 0 });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: isAlly ? 0x46586c : (ENEMY_SHIRTS[typeDef.id] ?? typeDef.color), roughness: 0.92, metalness: 0 });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: isAlly ? 0x39424e : 0x3d4c66, roughness: 0.94, metalness: 0 });
  const vestMat = new THREE.MeshStandardMaterial({
    color: isAlly ? 0x2b3542 : 0x4c4436, roughness: 0.85, metalness: 0.05 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x0c0d10, emissive: isAlly ? 0x53c8ff : typeDef.visor, emissiveIntensity: 0.55, roughness: 0.6 });
  const bodyMat = shirtMat; // hit-flash target, as before

  // --- Legs: jeans thigh and shin capsules, knee ball, boot, thigh holster + straps. ---
  function buildLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(0.13 * side, 0.95, 0);
    group.add(leg);
    capsule(0.088, 0.26, pantsMat, 0, -0.25, 0, leg); // thigh
    ball(0.082, pantsMat, 0, -0.47, 0, leg); // knee
    capsule(0.07, 0.24, pantsMat, 0, -0.66, 0, leg); // shin
    box(0.13, 0.09, 0.27, DARK_GEAR, 0, -0.925, -0.045, leg); // boot
    if (side > 0) { // thigh holster + twin straps on the gun leg
      box(0.07, 0.2, 0.13, DARK_GEAR, 0.115, -0.32, 0.01, leg);
      for (const sy of [-0.2, -0.4]) {
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 14), DARK_GEAR);
        strap.rotation.x = Math.PI / 2;
        strap.position.set(0, sy, 0);
        leg.add(strap);
      }
    }
    return leg;
  }
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // --- Torso: pelvis, belt, tapered shirt, vest/rig with pouches, pack, shoulders. ---
  const torso = new THREE.Group(); torso.position.set(0, 0.95, 0); group.add(torso);
  const scale = typeDef.id === 'heavy' ? 1.15 : 1;
  torso.scale.set(scale, 1, scale);
  ball(0.2, pantsMat, 0, 0.03, 0, torso, 0.62); // pelvis
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.178, 0.07, 14), DARK_GEAR);
  belt.position.set(0, 0.14, 0); belt.scale.z = 0.82; belt.castShadow = true; torso.add(belt);
  tapered(0.205, 0.158, 0.5, shirtMat, 0, 0.42, 0, torso); // shirt torso
  tapered(0.228, 0.196, 0.3, vestMat, 0, 0.5, 0, torso, 0.84); // vest / chest rig
  for (const px of [-0.11, 0, 0.11]) box(0.09, 0.13, 0.05, DARK_GEAR, px, 0.44, -0.185, torso); // mag pouches
  box(0.2, 0.03, 0.014, accentMat, 0, 0.64, -0.178, torso); // unit stripe
  ball(0.088, shirtMat, -0.245, 0.6, 0, torso); // shoulders
  ball(0.088, shirtMat, 0.245, 0.6, 0, torso);
  const pack = capsule(0.13, 0.22, vestMat, 0, 0.45, 0.21, torso);
  pack.scale.z = 0.62; // backpack
  box(0.12, 0.16, 0.05, DARK_GEAR, 0.09, 0.78, 0.22, torso); // radio
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.34, 5), DARK_GEAR);
  antenna.position.set(0.13, 1.0, 0.22);
  torso.add(antenna);
  if (!isAlly) { // shemagh neck wrap + chest drape for the T-side look
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.05, 8, 16), SHEMAGH);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.set(0, 0.7, 0);
    wrap.castShadow = true;
    torso.add(wrap);
    const drape = capsule(0.05, 0.1, SHEMAGH, 0.03, 0.5, -0.19, torso);
    drape.rotation.x = 0.25;
  }

  // --- Head: skull sphere, then team dressing (wraps + sunglasses / helmet + goggles). ---
  const head = new THREE.Group(); head.position.set(0, 0.8, 0); torso.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skinMat);
  neck.position.set(0, 0.02, 0);
  head.add(neck);
  ball(0.132, skinMat, 0, 0.17, 0, head); // skull
  if (isAlly) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0x2e3a48, roughness: 0.55, metalness: 0.25 }));
    helmet.position.set(0, 0.175, 0);
    helmet.castShadow = true;
    head.add(helmet);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.016, 16), helmet.material);
    brim.position.set(0, 0.175, 0);
    head.add(brim);
    const goggles = box(0.2, 0.055, 0.03, SUNGLASSES, 0, 0.195, -0.122, head);
    goggles.castShadow = false;
    box(0.07, 0.05, 0.06, DARK_GEAR, 0, 0.33, -0.06, head); // NVG mount
  } else {
    const wrapMat = typeDef.id === 'rusher' || typeDef.id === 'marksman' ? SHEMAGH : BALACLAVA;
    const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), wrapMat);
    wrap.position.set(0, 0.155, 0);
    wrap.castShadow = true;
    head.add(wrap); // lower-face wrap
    const shades = box(0.21, 0.05, 0.03, SUNGLASSES, 0, 0.2, -0.12, head);
    shades.castShadow = false; // sunglasses
    if (typeDef.id === 'marksman') { // patrol cap
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.142, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x55583e, roughness: 0.9 }));
      cap.position.set(0, 0.185, 0);
      head.add(cap);
      box(0.17, 0.018, 0.11, cap.material, 0, 0.185, -0.15, head);
    } else if (typeDef.id === 'trooper' || typeDef.id === 'heavy') { // head wrap crown
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), wrapMat);
      crown.position.set(0, 0.175, 0);
      head.add(crown);
    }
  }

  // --- Arms: shirt upper, forearm (bare skin T-side, sleeved CT-side), gloved hand, gun. ---
  function buildArm(side, withGun) {
    const arm = new THREE.Group();
    arm.position.set(0.335 * side, 0.6, 0);
    torso.add(arm);
    capsule(0.062, 0.18, shirtMat, 0, -0.14, 0, arm); // upper arm
    ball(0.057, shirtMat, 0, -0.29, 0, arm); // elbow
    capsule(0.052, 0.17, isAlly ? shirtMat : skinMat, 0, -0.42, 0, arm); // forearm
    ball(0.062, DARK_GEAR, 0, -0.58, 0, arm, 1.2); // glove
    if (withGun) {
      const gun = box(0.07, 0.1, 0.62, GUN, 0.02, -0.42, -0.3, arm);
      gun.castShadow = false;
      box(0.05, 0.14, 0.08, DARK_GEAR, 0.02, -0.52, -0.12, arm); // magazine
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
  let spawnCounter = 0;
  let agentDeathHook = null;

  function spawn(typeId, x, z, team = 'enemy') {
    const def = ENEMY_TYPES[typeId] ?? ENEMY_TYPES.trooper;
    const rig = buildRig(def, team, spawnCounter);
    spawnCounter += 1;
    rig.group.position.set(x, 0, z);
    scene.add(rig.group);
    const enemy = {
      id: enemies.length + Math.floor(Math.random() * 1e6),
      type: def,
      team,
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
      if (agentDeathHook) agentDeathHook(enemy);
      return true;
    }
    return false;
  }

  /** Analytic ray vs head/chest/pelvis spheres; only agents of `team` can be hit. */
  function raycast(origin, dir, maxDist, team = 'enemy') {
    let best = null;
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.team !== team) continue;
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

  function nearestCover(enemy, foePos) {
    let bestPoint = null;
    let bestScore = Infinity;
    for (const point of world.coverPoints) {
      const distToEnemy = Math.hypot(point.x - enemy.group.position.x, point.z - enemy.group.position.z);
      if (distToEnemy > 16) continue;
      // Cover only counts when its blocking side faces the foe.
      const toFoeX = foePos.x - point.x;
      const toFoeZ = foePos.z - point.z;
      if (toFoeX * point.dirX + toFoeZ * point.dirZ <= 0.2) continue;
      const score = distToEnemy + Math.random() * 2;
      if (score < bestScore) { bestScore = score; bestPoint = point; }
    }
    return bestPoint;
  }

  /** Every live opponent this agent could engage: the player plus the opposing team. */
  function foeCandidates(enemy, ctx) {
    const list = [];
    if (enemy.team === 'enemy' && ctx.playerAlive) {
      list.push({
        pos: ctx.playerPos, isPlayer: true, agent: null,
        sprinting: ctx.playerSprinting, crouching: ctx.playerCrouching,
      });
    }
    const foeTeam = enemy.team === 'enemy' ? 'ally' : 'enemy';
    for (const other of enemies) {
      if (!other.alive || other.team !== foeTeam) continue;
      list.push({
        pos: other.group.position, isPlayer: false, agent: other,
        sprinting: false, crouching: other.state === 'cover' && other.coverStage === 'hide',
      });
    }
    return list;
  }

  function fireShot(enemy, ctx, foe) {
    const def = enemy.type;
    const pos = enemy.group.position;
    const dist = Math.hypot(foe.pos.x - pos.x, foe.pos.z - pos.z);
    const gunTip = _v1.set(pos.x, 1.45, pos.z).add(_v2.set(-Math.sin(enemy.yaw), 0, -Math.cos(enemy.yaw)).multiplyScalar(0.7));
    audio.enemyShoot(dist);
    let hitChance = def.accuracy * THREE.MathUtils.clamp(20 / (dist + 6), 0.3, 1.05);
    if (foe.sprinting) hitChance *= 0.75;
    if (foe.crouching) hitChance *= 0.8;
    const target = new THREE.Vector3(foe.pos.x, foe.pos.y + 1.25, foe.pos.z);
    if (Math.random() < hitChance) {
      effects.tracer(gunTip.clone(), target, 0xff7a5c);
      if (foe.isPlayer) {
        ctx.onPlayerDamage(def.damage);
      } else {
        damage(foe.agent, def.damage, target, { playerPos: pos, onDeath() {} });
      }
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

    // Perception: nearest visible foe wins; memory of the last sighting fades.
    let foe = null;
    let foeDist = Infinity;
    for (const candidate of foeCandidates(enemy, ctx)) {
      const dist = Math.hypot(candidate.pos.x - pos.x, candidate.pos.z - pos.z);
      if (dist >= 46 || dist >= foeDist) continue;
      if (dist < 5.5 || lineOfSight(pos.x, pos.z, candidate.pos.x, candidate.pos.z)) {
        foe = candidate;
        foeDist = dist;
      }
    }
    const seesFoe = foe !== null;
    if (seesFoe) {
      enemy.lastKnown = _v2.copy(foe.pos).clone();
      enemy.memoryT = 5;
    } else if (enemy.memoryT > 0) {
      enemy.memoryT -= dt;
      if (enemy.memoryT <= 0) enemy.lastKnown = null;
    }
    const foePos = foe ? foe.pos : (enemy.lastKnown ?? pos);

    const def = enemy.type;
    enemy.stateT += dt;
    enemy.repathT -= dt;

    // Choose cover when badly hurt (rushers and heavies never hide).
    if (enemy.state !== 'cover' && enemy.hurtRecently > enemy.maxHp * 0.3 && def.cover) {
      const point = nearestCover(enemy, foePos);
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
        faceToward(enemy, foePos.x, foePos.z, dt);
        if (enemy.coverT <= 0) {
          enemy.coverStage = 'peek';
          enemy.coverT = 1 + Math.random() * 0.8;
          enemy.burstLeft = def.burst;
          enemy.shotT = 0;
        }
      } else if (enemy.coverStage === 'peek') {
        enemy.coverT -= dt;
        faceToward(enemy, foePos.x, foePos.z, dt);
        if (seesFoe) runBurst(enemy, dt, ctx, foe);
        if (enemy.coverT <= 0) {
          enemy.state = 'advance';
          enemy.coverStage = '';
          enemy.stateT = 0;
        }
      }
    } else if (seesFoe && foeDist < def.range && foeDist > def.preferredMin) {
      // Attack: hold ground, strafe a little, fire bursts.
      enemy.state = 'attack';
      faceToward(enemy, foe.pos.x, foe.pos.z, dt);
      enemy.strafeT -= dt;
      if (enemy.strafeT <= 0) {
        enemy.strafeT = 0.9 + Math.random() * 1.2;
        enemy.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const strafeSpeed = def.id === 'marksman' ? 0.4 : 1.1;
      pos.x += Math.cos(enemy.yaw) * enemy.strafeDir * strafeSpeed * dt;
      pos.z += -Math.sin(enemy.yaw) * enemy.strafeDir * strafeSpeed * dt;
      collide(pos, enemy.radius, world.colliders);
      runBurst(enemy, dt, ctx, foe);
      if (def.id === 'marksman' && foeDist < 14) {
        // Marksmen fall back when crowded.
        pos.x += Math.sin(enemy.yaw) * 2.2 * dt;
        pos.z += Math.cos(enemy.yaw) * 2.2 * dt;
        collide(pos, enemy.radius, world.colliders);
      }
    } else {
      // Advance on the last known position (or the foe when visible but out of range).
      enemy.state = 'advance';
      const target = seesFoe ? foe.pos : enemy.lastKnown;
      if (target) {
        if (enemy.repathT <= 0) {
          enemy.repathT = 0.55 + Math.random() * 0.3;
          setPath(enemy, target);
        }
        const arrived = moveAlongPath(enemy, dt, def.speed);
        if (arrived && !seesFoe) {
          // Look around at the last known spot.
          enemy.yaw += dt * 1.4;
          enemy.group.rotation.y = enemy.yaw;
        }
      } else if (ctx.rallyPoints && ctx.rallyPoints[enemy.team]) {
        // Team modes: push toward this team's rally point until contact is made.
        const rally = ctx.rallyPoints[enemy.team];
        if (enemy.repathT <= 0) {
          enemy.repathT = 0.8 + Math.random() * 0.4;
          setPath(enemy, {
            x: rally.x + ((enemy.id % 5) - 2) * 2.4,
            z: rally.z,
          });
        }
        moveAlongPath(enemy, dt, def.speed);
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
    const engaged = seesFoe || enemy.state === 'attack' || enemy.coverStage === 'peek';
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

  function runBurst(enemy, dt, ctx, foe) {
    if (enemy.burstLeft > 0) {
      enemy.shotT -= dt;
      if (enemy.shotT <= 0) {
        enemy.shotT = enemy.type.fireInterval;
        enemy.burstLeft -= 1;
        fireShot(enemy, ctx, foe);
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
    setOnAgentDeath(fn) { agentDeathHook = fn; },
    get list() { return enemies; },
    aliveCount(team) {
      return enemies.filter((enemy) => enemy.alive && (team === undefined || enemy.team === team)).length;
    },
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
