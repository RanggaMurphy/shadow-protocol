// SHADOW PROTOCOL — entry point and game orchestration.
// Owns the renderer, input (keyboard/mouse/pointer lock), the shooting raycast (grid DDA +
// prop AABBs + enemy spheres), explosive barrels, supply pickups, the campaign mission state
// machine (infiltrate → eliminate → terminal → extraction), survival waves, menus/settings,
// and the deterministic ?shot= staging hooks used to capture real screenshots headlessly.
import * as THREE from 'three';
import { TILE, MISSION, ENEMY_TYPES } from './config.js';
import { buildFacility, isSolid, cellOf, centreOf, COLS, ROWS } from './map.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createEnemyManager } from './enemies.js';
import { createHUD } from './hud.js';
import { makeCaseTexture } from './textures.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const godMode = shotMode !== null && shotMode !== 'menu';

// ---------- Renderer / scene ----------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1018);
scene.fog = new THREE.Fog(0x111a29, 42, 175);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 300);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Settings ----------
const settings = { sensitivity: 1, volume: 0.8, quality: 'high' };

// ---------- World & subsystems ----------
const audio = createAudio();
audio.setVolume(settings.volume);
const world = buildFacility(scene, settings.quality);
const effects = createEffects(scene);
const player = createPlayer(camera, world, audio);
const hud = createHUD();

let score = 0;
let kills = 0;
let startTime = 0;
let elapsed = 0;

const enemyHooks = {
  playerPos: player.pos,
  onDeath(enemy) {
    if (enemy.team !== 'enemy') return; // friendly losses are not the player's kills
    kills += 1;
    score += enemy.type.score;
  },
};

const manager = createEnemyManager(scene, world, effects, audio);
manager.setOnAgentDeath((agent) => {
  if (mode === 'clash' && agent.team === 'enemy') score += 25; // elimination ticks for the team
});

function raycastProps(origin, dir, maxDist) {
  let best = null;
  for (const box of world.colliders) {
    const t = rayAabb(origin, dir, box.minX, 0, box.minZ, box.maxX, box.h ?? 3.6, box.maxZ);
    if (t !== null && t < maxDist && (best === null || t < best.dist)) {
      best = { dist: t, point: origin.clone().addScaledVector(dir, t), prop: box };
    }
  }
  return best;
}

function rayAabb(origin, dir, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [origin.x, dir.x, minX, maxX],
    [origin.y, dir.y, minY, maxY],
    [origin.z, dir.z, minZ, maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function raycastGrid(origin, dir, maxDist) {
  let col = Math.floor(origin.x / TILE + COLS / 2);
  let row = Math.floor(origin.z / TILE + ROWS / 2);
  const stepCol = dir.x > 0 ? 1 : -1;
  const stepRow = dir.z > 0 ? 1 : -1;
  const tDeltaCol = Math.abs(TILE / (dir.x || 1e-9));
  const tDeltaRow = Math.abs(TILE / (dir.z || 1e-9));
  const cellMinX = (col - COLS / 2) * TILE;
  const cellMinZ = (row - ROWS / 2) * TILE;
  let tMaxCol = dir.x > 0 ? (cellMinX + TILE - origin.x) / dir.x : dir.x < 0 ? (cellMinX - origin.x) / dir.x : Infinity;
  let tMaxRow = dir.z > 0 ? (cellMinZ + TILE - origin.z) / dir.z : dir.z < 0 ? (cellMinZ - origin.z) / dir.z : Infinity;
  let t = 0;
  for (let i = 0; i < 160; i += 1) {
    if (tMaxCol < tMaxRow) { t = tMaxCol; tMaxCol += tDeltaCol; col += stepCol; }
    else { t = tMaxRow; tMaxRow += tDeltaRow; row += stepRow; }
    if (t > maxDist) return Infinity;
    if (isSolid(col, row)) return t;
  }
  return Infinity;
}

/** The one shooting ray: nearest of wall grid, props, enemies and the ground plane. */
function shootRay(origin, dir, maxDist) {
  let bestDist = Math.min(raycastGrid(origin, dir, maxDist), maxDist + 1);
  let best = null;
  if (bestDist <= maxDist) {
    best = { dist: bestDist, point: origin.clone().addScaledVector(dir, bestDist), enemy: null, prop: null, head: false };
  }
  if (dir.y < -0.001) {
    const tFloor = (0.02 - origin.y) / dir.y;
    if (tFloor > 0 && tFloor < bestDist) {
      bestDist = tFloor;
      best = { dist: tFloor, point: origin.clone().addScaledVector(dir, tFloor), enemy: null, prop: null, head: false };
    }
  }
  const propHit = raycastProps(origin, dir, bestDist);
  if (propHit) {
    bestDist = propHit.dist;
    best = { ...propHit, enemy: null, head: false };
  }
  const enemyHit = manager.raycast(origin, dir, bestDist);
  if (enemyHit) best = enemyHit;
  return best;
}

// ---------- Barrels ----------
const pendingBooms = [];
function explodeBarrel(barrel) {
  if (barrel.dead) return;
  barrel.dead = true;
  barrel.mesh.visible = false;
  const index = world.colliders.indexOf(barrel);
  if (index >= 0) world.colliders.splice(index, 1);
  const centre = new THREE.Vector3(barrel.x, 1, barrel.z);
  effects.explosion(centre);
  audio.explosion();
  const distToPlayer = Math.hypot(player.pos.x - barrel.x, player.pos.z - barrel.z);
  if (distToPlayer < 9) player.addShake(0.02 * (1 - distToPlayer / 9) + 0.004);
  for (const enemy of [...manager.list]) {
    if (!enemy.alive) continue;
    const dist = Math.hypot(enemy.group.position.x - barrel.x, enemy.group.position.z - barrel.z);
    if (dist < 5.5) {
      manager.damage(enemy, Math.round(95 - dist * 12), new THREE.Vector3(enemy.group.position.x, 1.2, enemy.group.position.z), enemyHooks);
    }
  }
  if (player.alive && distToPlayer < 5) {
    damagePlayer(Math.round(50 - distToPlayer * 7));
  }
  for (const other of world.barrels) {
    if (other !== barrel && !other.dead && Math.hypot(other.x - barrel.x, other.z - barrel.z) < 4.2) {
      pendingBooms.push({ barrel: other, t: 0.14 });
    }
  }
}

// ---------- Weapons (needs shootRay, so it is built after) ----------
let hurtSoundT = 0;
function damagePlayer(amount) {
  if (godMode || !player.alive || state !== 'playing') return;
  hud.damage();
  if (hurtSoundT <= 0) {
    audio.playerHurt();
    hurtSoundT = 0.18;
  }
  if (player.damage(amount)) {
    if (mode === 'clash') hud.toast('YOU ARE DOWN — SPECTATING', 2.5);
    else gameOver(false);
  }
}

const weapons = createWeapons(camera, audio, effects, {
  shootRay,
  onHit(hit, baseDamage) {
    if (hit.enemy) {
      const damage = Math.round(baseDamage * (hit.head ? weapons.def.headMult : 1));
      const killed = manager.damage(hit.enemy, damage, hit.point, enemyHooks);
      if (killed && hit.head) score += 50;
      hud.hitmarker(killed);
      audio.hitmarker(killed);
    } else {
      effects.sparks(hit.point);
      if (hit.prop && hit.prop.kind === 'barrel' && !hit.prop.dead) {
        hit.prop.hp -= baseDamage;
        if (hit.prop.hp <= 0) explodeBarrel(hit.prop);
      }
    }
  },
});
const weaponHolderVisible = (visible) => { camera.children.forEach((child) => { child.visible = visible; }); };

// ---------- Pickups ----------
const PICKUP_STYLE = {
  health: { color: 0x63d68f, label: 'HEALTH +35' },
  armor: { color: 0x6fa8d8, label: 'ARMOR +50' },
  ammo: { color: 0xd8b34d, label: 'AMMO RESTOCKED' },
};
const pickups = [];
const caseTextures = {
  health: makeCaseTexture('health'),
  armor: makeCaseTexture('armor'),
  ammo: makeCaseTexture('ammo'),
};
const caseBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.6, metalness: 0.4 });
function spawnPickup(type, x, z, temporary = false) {
  const style = PICKUP_STYLE[type];
  const group = new THREE.Group();
  // A real supply case: painted hard-case with a dark base plate, a status LED and a
  // soft ground ring in the type colour so it still reads at a glance mid-fight.
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.36, 0.46),
    new THREE.MeshStandardMaterial({ map: caseTextures[type], roughness: 0.55, metalness: 0.15 }),
  );
  crate.position.y = 0.08;
  crate.castShadow = true;
  group.add(crate);
  const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.52), caseBaseMaterial);
  basePlate.position.y = -0.13;
  group.add(basePlate);
  const led = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.03, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0c0e10, emissive: style.color, emissiveIntensity: 1.6 }),
  );
  led.position.set(0.2, 0.2, -0.24);
  group.add(led);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 28),
    new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.155;
  group.add(ring);
  group.position.set(x, 0.25, z);
  scene.add(group);
  pickups.push({ type, group, active: true, respawnT: 0, temporary, lifeT: temporary ? 25 : Infinity, phase: Math.random() * 6 });
  return pickups[pickups.length - 1];
}
const FIXED_PICKUPS = [
  ['ammo', 17, 20], ['ammo', 6, 13], ['ammo', 28, 5],
  ['armor', 31, 13], ['armor', 2, 1],
  ['health', 20, 13], ['health', 3, 27], ['health', 17, 18],
];
function resetPickups() {
  for (const pickup of pickups) scene.remove(pickup.group);
  pickups.length = 0;
  for (const [type, col, row] of FIXED_PICKUPS) {
    const { x, z } = centreOf(col, row);
    spawnPickup(type, x, z);
  }
}
function updatePickups(dt) {
  for (const pickup of pickups) {
    if (!pickup.active) {
      pickup.respawnT -= dt;
      if (pickup.respawnT <= 0 && !pickup.temporary) {
        pickup.active = true;
        pickup.group.visible = true;
      }
      continue;
    }
    if (pickup.temporary) {
      pickup.lifeT -= dt;
      if (pickup.lifeT <= 0) {
        pickup.active = false;
        pickup.group.visible = false;
        continue;
      }
    }
    pickup.group.rotation.y += dt * 1.6;
    pickup.group.position.y = 0.25 + Math.sin(performance.now() / 420 + pickup.phase) * 0.08;
    if (!player.alive) continue;
    const dist = Math.hypot(player.pos.x - pickup.group.position.x, player.pos.z - pickup.group.position.z);
    if (dist < 1.15) {
      if (pickup.type === 'health' && player.health >= 100) continue;
      if (pickup.type === 'armor' && player.armor >= 100) continue;
      if (pickup.type === 'health') player.heal(35);
      if (pickup.type === 'armor') player.addArmor(50);
      if (pickup.type === 'ammo') weapons.addAmmoAll();
      hud.toast(PICKUP_STYLE[pickup.type].label, 1.1);
      audio.pickup();
      pickup.active = false;
      pickup.group.visible = false;
      pickup.respawnT = 45;
    }
  }
}

// ---------- Mission / modes ----------
let state = 'menu'; // menu | playing | paused | over
let mode = 'campaign';
let phase = 'infiltrate';
let terminalProgress = 0;
let extractProgress = 0;
let defenceWave = 0;
let stagesSpawned = { start: false, hall: false, mid: false, north: false, terminalGuard: false };
let wave = 0;
let wavePending = 0;
let waveBreakT = 0;
let totalSpawnedThisWave = 0;

// Team Clash state: round-based 5v5, first to 6 rounds.
let clashYou = 0;
let clashEnemy = 0;
let clashRound = 0;
let clashPhase = 'live';
let clashTimer = 100;
let clashBreakT = 0;
const CLASH_ALLIES = ['trooper', 'rusher', 'trooper', 'marksman'];
const CLASH_ENEMIES = ['trooper', 'trooper', 'rusher', 'marksman', 'trooper'];
const CLASH_ALLY_CELLS = [[15, 26], [19, 26], [16, 24], [18, 24]];
const CLASH_ENEMY_CELLS = [[17, 2], [15, 3], [19, 3], [16, 4], [18, 2]];

function spawnAt(type, col, row, team = 'enemy') {
  const { x, z } = centreOf(col, row);
  return manager.spawn(type, x, z, team);
}
function spawnStage(name) {
  if (stagesSpawned[name]) return;
  stagesSpawned[name] = true;
  if (name === 'start') {
    spawnAt('trooper', 8, 25);
    spawnAt('trooper', 27, 24);
  } else if (name === 'hall') {
    spawnAt('trooper', 10, 19);
    spawnAt('rusher', 24, 20);
    spawnAt('trooper', 17, 18);
  } else if (name === 'mid') {
    spawnAt('trooper', 5, 11);
    spawnAt('rusher', 7, 13);
    spawnAt('trooper', 16, 10);
    spawnAt('trooper', 19, 12);
    spawnAt('trooper', 28, 10);
    spawnAt('rusher', 30, 13);
  } else if (name === 'north') {
    spawnAt('trooper', 4, 3);
    spawnAt('marksman', 7, 4);
    spawnAt('trooper', 28, 2);
    spawnAt('trooper', 30, 4);
  } else if (name === 'terminalGuard') {
    spawnAt('trooper', 13, 2);
    spawnAt('marksman', 20, 2);
    spawnAt('heavy', 17, 4);
  }
}

function allStagesSpawned() {
  return Object.values(stagesSpawned).every(Boolean);
}

function drawTerminal(screenState, progress) {
  const { canvas, texture } = world.terminalScreen;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#04140c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1d5c3a';
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = screenState === 'locked' ? '#ff5348' : screenState === 'done' ? '#53ff9e' : '#ffd94d';
  ctx.font = 'bold 17px monospace';
  ctx.fillText('SHADOW PROTOCOL', 18, 34);
  ctx.font = '13px monospace';
  if (screenState === 'locked') {
    ctx.fillText('TERMINAL LOCKED', 18, 62);
    ctx.fillText('CLEAR ALL HOSTILES', 18, 84);
  } else if (screenState === 'hold') {
    ctx.fillText('UPLOADING EXPLOIT…', 18, 62);
    ctx.fillStyle = '#123324';
    ctx.fillRect(18, 92, 220, 16);
    ctx.fillStyle = '#ffd94d';
    ctx.fillRect(18, 92, 220 * progress, 16);
    ctx.fillText(`${Math.floor(progress * 100)}%`, 18, 128);
  } else {
    ctx.fillText('ACCESS GRANTED', 18, 62);
    ctx.fillText('EXTRACTION UNLOCKED', 18, 84);
  }
  texture.needsUpdate = true;
}

function setPhase(next) {
  phase = next;
  if (next === 'eliminate') {
    hud.setObjective('ELIMINATE ALL HOSTILES');
    hud.toast('CONTACT!');
  } else if (next === 'terminal') {
    hud.setObjective('ACTIVATE THE TERMINAL', 'NORTH CHAMBER — HOLD E AT THE CONSOLE');
    hud.toast('SECTOR CLEAR');
    drawTerminal('hold', 0);
  } else if (next === 'extract') {
    hud.setObjective('REACH EXTRACTION', 'HOLD THE PAD IN THE YARD');
    hud.toast('EXTRACTION OPEN');
    audio.objectiveDone();
    drawTerminal('done', 1);
  }
}

function updateCampaign(dt) {
  const { row, col } = cellOf(player.pos.x, player.pos.z);
  // Stage triggers by sector.
  if (row <= 21) spawnStage('hall');
  if (row <= 15) spawnStage('mid');
  if (row <= 7) spawnStage('north');
  if (row <= 6 && col >= 11 && col <= 22) spawnStage('terminalGuard');

  if (phase === 'infiltrate' && row <= 21) setPhase('eliminate');
  if (phase === 'eliminate') {
    const alive = manager.aliveCount();
    hud.setObjective('ELIMINATE ALL HOSTILES', allStagesSpawned() ? `${alive} HOSTILE${alive === 1 ? '' : 'S'} REMAIN` : 'CLEAR EACH SECTOR');
    if (allStagesSpawned() && alive === 0) setPhase('terminal');
  }

  if (phase === 'terminal') {
    const dist = Math.hypot(player.pos.x - world.terminalPos.x, player.pos.z - world.terminalPos.z);
    const inRange = dist < 2.6;
    if (inRange && keys.interact && player.alive) {
      terminalProgress += dt / MISSION.terminalHoldSeconds;
      audio.terminalTick(terminalProgress);
      if (defenceWave === 0 && terminalProgress > 0.03) {
        defenceWave = 1;
        spawnAt('trooper', 28, 5);
        spawnAt('rusher', 5, 3);
        audio.startAlarm();
        hud.toast('DEFEND THE TERMINAL!');
      }
      if (defenceWave === 1 && terminalProgress > 0.5) {
        defenceWave = 2;
        spawnAt('trooper', 30, 12);
        spawnAt('marksman', 24, 20);
        spawnAt('rusher', 10, 19);
      }
      drawTerminal('hold', terminalProgress);
      if (terminalProgress >= 1) {
        terminalProgress = 1;
        audio.stopAlarm();
        setPhase('extract');
      }
    }
    hud.setInteract(inRange ? 'HOLD E — ACTIVATING TERMINAL' : null, terminalProgress);
    hud.setObjective('ACTIVATE THE TERMINAL', inRange ? '' : 'NORTH CHAMBER — THE CONSOLE BY THE NORTH WALL');
  } else {
    hud.setInteract(null, 0);
  }

  if (phase === 'extract') {
    const dist = Math.hypot(player.pos.x - world.extractionPad.x, player.pos.z - world.extractionPad.z);
    if (dist < 3.1 && player.alive) {
      extractProgress += dt / MISSION.extractionSeconds;
      hud.setObjective('REACH EXTRACTION', `EXTRACTION IN ${Math.ceil(MISSION.extractionSeconds * (1 - extractProgress))}…`);
      if (extractProgress >= 1) {
        score += 500;
        gameOver(true);
      }
    } else {
      extractProgress = Math.max(0, extractProgress - dt / MISSION.extractionSeconds);
    }
  }
  world.alarmLight.intensity = phase === 'terminal' && defenceWave > 0 ? 16 + 12 * Math.sin(performance.now() / 160) : 0;
}

const SURVIVAL_SPOTS = [[6, 23], [28, 23], [10, 24], [24, 24], [17, 23], [10, 19], [24, 19], [17, 16]];
function survivalComposition(n) {
  const list = [];
  const total = 3 + n * 2;
  for (let i = 0; i < total; i += 1) {
    let type = 'trooper';
    const roll = Math.random();
    if (n >= 2 && roll < 0.3) type = 'rusher';
    else if (n >= 3 && roll > 0.85) type = 'marksman';
    list.push(type);
  }
  if (n % 3 === 0) list.push('heavy');
  return list;
}
let survivalQueue = [];
function updateSurvival(dt) {
  if (waveBreakT > 0) {
    waveBreakT -= dt;
    if (waveBreakT <= 0) startWave();
    return;
  }
  while (survivalQueue.length > 0 && manager.aliveCount() < 8) {
    const type = survivalQueue.shift();
    const [col, row] = SURVIVAL_SPOTS[Math.floor(Math.random() * SURVIVAL_SPOTS.length)];
    spawnAt(type, col, row);
  }
  if (survivalQueue.length === 0 && manager.aliveCount() === 0 && state === 'playing') {
    score += 250 * wave;
    hud.toast(`WAVE ${wave} CLEAR  +${250 * wave}`);
    audio.objectiveDone();
    waveBreakT = 3;
  }
  hud.setObjective('SURVIVE', `WAVE ${wave} — ${manager.aliveCount() + survivalQueue.length} HOSTILES INBOUND`);
}
function startWave() {
  wave += 1;
  survivalQueue = survivalComposition(wave);
  totalSpawnedThisWave = survivalQueue.length;
  hud.toast(`WAVE ${wave}`);
  void totalSpawnedThisWave;
}

// ---------- Team Clash ----------
function startClashRound() {
  clashRound += 1;
  clashPhase = 'live';
  clashTimer = 100;
  manager.clear();
  player.reset(world.playerSpawn);
  weapons.roundReset();
  CLASH_ALLIES.forEach((type, i) => {
    const [col, row] = CLASH_ALLY_CELLS[i];
    spawnAt(type, col, row, 'ally');
  });
  CLASH_ENEMIES.forEach((type, i) => {
    const [col, row] = CLASH_ENEMY_CELLS[i];
    spawnAt(type, col, row, 'enemy');
  });
  hud.setObjective('TEAM CLASH — ELIMINATE THE HOSTILE TEAM', `ROUND ${clashRound} · FIRST TO 6 ROUNDS`);
  hud.toast(`ROUND ${clashRound}`, 2);
}
function clashRoundWin(winner) {
  if (winner === 'you') {
    clashYou += 1;
    score += 300;
  } else {
    clashEnemy += 1;
  }
  hud.toast(winner === 'you'
    ? `ROUND WON — YOU ${clashYou} · ${clashEnemy} ENEMY`
    : `ROUND LOST — YOU ${clashYou} · ${clashEnemy} ENEMY`, 3);
  audio.objectiveDone();
  if (clashYou >= 6 || clashEnemy >= 6) {
    gameOver(clashYou > clashEnemy);
    return;
  }
  clashPhase = 'break';
  clashBreakT = 3.6;
}
function updateClash(dt) {
  if (clashPhase === 'break') {
    clashBreakT -= dt;
    if (clashBreakT <= 0) startClashRound();
    return;
  }
  clashTimer -= dt;
  const youAlive = (player.alive ? 1 : 0) + manager.aliveCount('ally');
  const enemyAlive = manager.aliveCount('enemy');
  if (enemyAlive === 0) clashRoundWin('you');
  else if (youAlive === 0) clashRoundWin('enemy');
  else if (clashTimer <= 0) clashRoundWin('enemy'); // clock out: defenders take the round
}

// ---------- Flow ----------
const screens = {
  menu: document.getElementById('screen-menu'),
  how: document.getElementById('screen-how'),
  settings: document.getElementById('screen-settings'),
  pause: document.getElementById('screen-pause'),
  over: document.getElementById('screen-over'),
};
function showScreen(name) {
  for (const [key, element] of Object.entries(screens)) {
    element.classList.toggle('hidden', key !== name);
  }
}
let settingsReturn = 'menu';

function startGame(chosenMode) {
  mode = chosenMode;
  manager.clear();
  weapons.reset();
  player.reset(world.playerSpawn);
  player.sensitivity = settings.sensitivity;
  score = 0;
  kills = 0;
  elapsed = 0;
  startTime = performance.now();
  terminalProgress = 0;
  extractProgress = 0;
  defenceWave = 0;
  stagesSpawned = { start: false, hall: false, mid: false, north: false, terminalGuard: false };
  wave = 0;
  waveBreakT = 0;
  survivalQueue = [];
  for (const barrel of world.barrels) {
    if (barrel.dead) {
      barrel.dead = false;
      barrel.hp = 12;
      barrel.mesh.visible = true;
      world.colliders.push(barrel);
    }
  }
  resetPickups();
  audio.stopAlarm();
  audio.startAmbient();
  audio.startMusic();
  weaponHolderVisible(true);
  hud.showHud(true);
  showScreen(null);
  state = 'playing';
  if (mode === 'campaign') {
    spawnStage('start');
    phase = 'infiltrate';
    hud.setObjective('INFILTRATE THE FACILITY', 'BREACH THE COMPLEX TO THE NORTH');
    drawTerminal('locked', 0);
    hud.toast('OPERATION BLACKSITE');
  } else if (mode === 'clash') {
    clashYou = 0;
    clashEnemy = 0;
    clashRound = 0;
    startClashRound();
  } else {
    hud.setObjective('SURVIVE');
    startWave();
  }
  if (shotMode === null) renderer.domElement.requestPointerLock();
}

function gameOver(won) {
  if (state === 'over') return;
  state = 'over';
  hud.showHud(false);
  audio.stopAlarm();
  audio.stopMusic();
  if (document.pointerLockElement) document.exitPointerLock();
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60).toString().padStart(2, '0');
  document.getElementById('over-title').textContent = mode === 'clash'
    ? (won ? 'TEAM CLASH — VICTORY' : 'TEAM CLASH — DEFEAT')
    : won ? 'MISSION COMPLETE' : mode === 'survival' ? `YOU SURVIVED ${wave} WAVE${wave === 1 ? '' : 'S'}` : 'OPERATOR DOWN';
  document.getElementById('over-title').style.color = won ? '#53ff9e' : '#ff8a7a';
  document.getElementById('over-stats').innerHTML =
    `FINAL SCORE <b>${score.toLocaleString('en-US')}</b><br>` +
    `KILLS <b>${kills}</b> &nbsp;·&nbsp; TIME <b>${minutes}:${seconds}</b>` +
    (mode === 'campaign' ? `<br>OBJECTIVE <b>${won ? 'COMPLETE' : phase.toUpperCase()}</b>` : '') +
    (mode === 'clash' ? `<br>ROUNDS <b>YOU ${clashYou} — ${clashEnemy} ENEMY</b>` : '');
  showScreen('over');
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  showScreen('pause');
}
function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  showScreen(null);
  if (shotMode === null) renderer.domElement.requestPointerLock();
}
function quitToMenu() {
  state = 'menu';
  manager.clear();
  audio.stopAlarm();
  audio.stopMusic();
  hud.setClash(null);
  hud.showHud(false);
  weaponHolderVisible(false);
  showScreen('menu');
}

// ---------- Input ----------
const keys = {
  forward: false, back: false, left: false, right: false,
  jump: false, sprint: false, crouch: false, interact: false,
  firing: false, ads: false,
};
let lookDX = 0;
let lookDY = 0;
let firePressed = false;
let reloadPressed = false;
let switchTo = -1;

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  ControlLeft: 'crouch', ControlRight: 'crouch', KeyC: 'crouch',
  Space: 'jump', KeyE: 'interact',
};
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') event.preventDefault();
  if (event.code.startsWith('Control')) event.preventDefault();
  const mapped = KEYMAP[event.code];
  if (mapped) keys[mapped] = true;
  if (event.code === 'KeyR' && state === 'playing') reloadPressed = true;
  if (event.code.startsWith('Digit') && state === 'playing') {
    const index = Number(event.code.slice(5)) - 1;
    if (index >= 0 && index < 5) switchTo = index;
  }
  if (event.code === 'KeyP') {
    if (state === 'playing' && document.pointerLockElement) document.exitPointerLock();
    else if (state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (event) => {
  const mapped = KEYMAP[event.code];
  if (mapped) keys[mapped] = false;
});
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === renderer.domElement && state === 'playing') {
    lookDX += event.movementX;
    lookDY += event.movementY;
  }
});
window.addEventListener('mousedown', (event) => {
  audio.unlock();
  if (state !== 'playing') return;
  if (shotMode === null && document.pointerLockElement !== renderer.domElement) return;
  if (event.button === 0) {
    keys.firing = true;
    firePressed = true;
  }
  if (event.button === 2) keys.ads = true;
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) keys.firing = false;
  if (event.button === 2) keys.ads = false;
});
window.addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('click', () => {
  if (state === 'playing' && shotMode === null && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  if (shotMode !== null) return;
  if (document.pointerLockElement !== renderer.domElement && state === 'playing') pauseGame();
});

// ---------- Menu wiring ----------
document.getElementById('btn-campaign').addEventListener('click', () => { audio.unlock(); startGame('campaign'); });
document.getElementById('btn-clash').addEventListener('click', () => { audio.unlock(); startGame('clash'); });
document.getElementById('btn-survival').addEventListener('click', () => { audio.unlock(); startGame('survival'); });
document.getElementById('btn-how').addEventListener('click', () => showScreen('how'));
document.getElementById('btn-how-back').addEventListener('click', () => showScreen('menu'));
document.getElementById('btn-settings').addEventListener('click', () => { settingsReturn = 'menu'; showScreen('settings'); });
document.getElementById('btn-pause-settings').addEventListener('click', () => { settingsReturn = 'pause'; showScreen('settings'); });
document.getElementById('btn-set-back').addEventListener('click', () => showScreen(settingsReturn));
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', () => startGame(mode));
document.getElementById('btn-quit').addEventListener('click', quitToMenu);
document.getElementById('btn-again').addEventListener('click', () => startGame(mode));
document.getElementById('btn-over-menu').addEventListener('click', quitToMenu);
document.getElementById('set-sens').addEventListener('input', (event) => {
  settings.sensitivity = Number(event.target.value);
  player.sensitivity = settings.sensitivity;
});
document.getElementById('set-vol').addEventListener('input', (event) => {
  settings.volume = Number(event.target.value);
  audio.setVolume(settings.volume);
});
document.getElementById('set-quality').addEventListener('change', (event) => {
  settings.quality = event.target.value;
  const moonLight = scene.children.find((child) => child.isDirectionalLight);
  if (moonLight) moonLight.castShadow = settings.quality === 'high';
  renderer.setPixelRatio(settings.quality === 'high' ? Math.min(window.devicePixelRatio, 1.5) : 1);
});

// ---------- Screenshot staging (?shot=) ----------
let shotFireT = 0;
function stageShot() {
  if (shotMode === null || shotMode === 'menu') return;
  if (shotMode === 'victory') {
    startGame('campaign');
    score = 2450;
    kills = 17;
    elapsed = 342;
    gameOver(true);
    return;
  }
  if (shotMode === 'gameover') {
    startGame('survival');
    score = 1875;
    kills = 23;
    wave = 4;
    elapsed = 388;
    gameOver(false);
    return;
  }
  if (shotMode === 'clash') {
    startGame('clash');
    // Stage a mid-round firefight in the entry hall: hands on the rifle, a teammate on each
    // flank, two hostiles pushing in from the south doors.
    const spot = centreOf(17, 19);
    player.pos.set(spot.x, 0, spot.z);
    player.setLook(Math.PI, 0.01); // face south, down the hall
    const foes = manager.list.filter((agent) => agent.team === 'enemy');
    const pals = manager.list.filter((agent) => agent.team === 'ally');
    const place = (agent, col, row, dx = 0) => {
      if (!agent) return;
      const cell = centreOf(col, row);
      agent.group.position.set(cell.x + dx, 0, cell.z);
      agent.lastKnown = player.pos.clone();
      agent.memoryT = 30;
    };
    place(foes[0], 17, 21);
    place(foes[1], 18, 22);
    place(pals[0], 16, 20);
    place(pals[1], 18, 20);
    shotFireT = 2.6;
    return;
  }
  startGame('campaign');
  if (shotMode === 'firefight') {
    const spot = centreOf(17, 19);
    player.pos.set(spot.x, 0, spot.z);
    player.setLook(Math.PI, 0.01); // face south, into the hall squad at fighting distance
    spawnStage('mid');
    spawnAt('trooper', 15, 21);
    spawnAt('rusher', 19, 21);
    spawnAt('trooper', 17, 22);
    shotFireT = 2.6;
  } else if (shotMode === 'terminal') {
    spawnStage('start'); spawnStage('hall'); spawnStage('mid'); spawnStage('north'); spawnStage('terminalGuard');
    manager.clear();
    spawnAt('marksman', 20, 2);
    spawnAt('trooper', 13, 3);
    setPhase('terminal');
    terminalProgress = 0.55;
    drawTerminal('hold', terminalProgress);
    player.pos.set(world.terminalPos.x, 0, world.terminalPos.z + 2.4);
    player.setLook(0, -0.06); // face north, straight at the console
  }
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
let menuAngle = 0;
let framesRendered = 0;
let firstFrameAt = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now() / 1000;

  if (state === 'menu' || (state === 'over' && shotMode === 'menu')) {
    menuAngle += dt * 0.05;
    camera.position.set(Math.sin(menuAngle) * 52, 27, Math.cos(menuAngle) * 52);
    camera.lookAt(0, 0, -6);
    camera.fov = 60;
    camera.updateProjectionMatrix();
  } else if (state === 'playing' || state === 'over') {
    if (state === 'playing') elapsed = (performance.now() - startTime) / 1000;
    const playerInput = {
      forward: keys.forward, back: keys.back, left: keys.left, right: keys.right,
      jump: keys.jump, sprint: keys.sprint, crouch: keys.crouch,
      lookDX, lookDY,
    };
    if ((shotMode === 'firefight' || shotMode === 'clash') && shotFireT > 0) {
      shotFireT -= dt;
      keys.firing = (shotFireT % 0.55) < 0.34;
      if (keys.firing) firePressed = true;
    }
    player.update(dt, playerInput);
    weapons.update(dt, {
      firing: keys.firing, firePressed, ads: keys.ads, reloadPressed, switchTo, lookDX, lookDY,
    }, player);
    lookDX = 0;
    lookDY = 0;
    firePressed = false;
    reloadPressed = false;
    switchTo = -1;

    if (hurtSoundT > 0) hurtSoundT -= dt;
    manager.update(dt, {
      playerPos: player.pos,
      playerAlive: player.alive,
      playerSprinting: player.sprinting,
      playerCrouching: keys.crouch,
      onPlayerDamage: damagePlayer,
      rallyPoints: mode === 'clash'
        ? { ally: centreOf(17, 8), enemy: centreOf(17, 18) }
        : null,
    });
    for (let i = pendingBooms.length - 1; i >= 0; i -= 1) {
      pendingBooms[i].t -= dt;
      if (pendingBooms[i].t <= 0) {
        explodeBarrel(pendingBooms[i].barrel);
        pendingBooms.splice(i, 1);
      }
    }
    updatePickups(dt);
    if (state === 'playing') {
      if (mode === 'campaign') updateCampaign(dt);
      else if (mode === 'clash') updateClash(dt);
      else updateSurvival(dt);
    }
    // Survival drop chance on fresh kills.
    hud.update(dt, {
      player, weapons, score, kills, wave, mode,
      enemies: manager.list,
      terminalPos: world.terminalPos,
      extractionPad: world.extractionPad,
      playerYaw: player.yaw,
    });
    hud.setClash(state === 'playing' && mode === 'clash' ? {
      you: clashYou,
      enemy: clashEnemy,
      round: clashRound,
      youAlive: (player.alive ? 1 : 0) + manager.aliveCount('ally'),
      enemyAlive: manager.aliveCount('enemy'),
      time: clashPhase === 'live' ? clashTimer : 0,
    } : null);
    // Extraction pad pulse.
    const padPulse = phase === 'extract' && mode === 'campaign' ? 0.65 + 0.35 * Math.sin(now * 6) : 0.45 + 0.2 * Math.sin(now * 2.4);
    world.extractionPad.mesh.material.opacity = padPulse;
    world.extractionPad.light.intensity = 8 + padPulse * 8;
  }

  effects.update(dt);
  renderer.render(scene, camera);
  framesRendered += 1;
  if (firstFrameAt === 0) firstFrameAt = performance.now();
  if (shotMode !== null && framesRendered > 30 && performance.now() - firstFrameAt > 2400) {
    window.__shotReady = true;
  }
}

// Survival kill drops: watch the kill counter.
let lastKills = 0;
setInterval(() => {
  if (state === 'playing' && mode === 'survival' && kills > lastKills) {
    for (let i = lastKills; i < kills; i += 1) {
      if (Math.random() < 0.22) {
        const types = ['health', 'armor', 'ammo'];
        spawnPickup(types[Math.floor(Math.random() * 3)], player.pos.x + (Math.random() * 4 - 2), player.pos.z + (Math.random() * 4 - 2), true);
      }
    }
  }
  lastKills = kills;
}, 400);

weaponHolderVisible(false);
hud.showHud(false);
showScreen('menu');
stageShot();
frame();

// Debug/testing handle (harmless; used by the headless screenshot harness).
window.__game = { scene, camera, renderer, player, manager, world, weapons };
