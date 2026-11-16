// The SHADOW PROTOCOL facility: a 36x30 grid of 4-metre cells holding a research complex —
// laboratory, terminal chamber and server room across the north, control room, operations and
// storage in the middle band, an entry hall, and an open yard to the south where the operator
// starts and the extraction pad waits. This file builds the geometry (instanced walls, floors,
// ceiling, props), the lights, the collision data and the grid pathfinding every mover uses.
import * as THREE from '../vendor/three.module.min.js';
import { TILE, WALL_HEIGHT } from './config.js';
import { makeTextures } from './textures.js';

// '#' wall, '.' indoor floor, 'o' outdoor yard. Row 0 is the north edge.
export const GRID = [
  '####################################',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '####..##########..#########..#######',
  '#..................................#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '####..##########..#########..#######',
  '#..................................#',
  '########..#######..########..#######',
  '#..................................#',
  '#..................................#',
  '#..................................#',
  '#..................................#',
  '##########..#####..######..#########',
  '#oooooooooooooooooooooooooooooooooo#',
  '#oooooooooooooooooooooooooooooooooo#',
  '#oooooooooooooooooooooooooooooooooo#',
  '#oooooooooooooooooooooooooooooooooo#',
  '#oooooooooooooooooooooooooooooooooo#',
  '#oooooooooooooooooooooooooooooooooo#',
  '####################################',
];
export const COLS = 36;
export const ROWS = 30;

export function cellAt(col, row) {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return '#';
  return GRID[row][col];
}
export function isSolid(col, row) {
  return cellAt(col, row) === '#';
}
export function cellOf(x, z) {
  return {
    col: Math.floor(x / TILE + COLS / 2),
    row: Math.floor(z / TILE + ROWS / 2),
  };
}
export function centreOf(col, row) {
  return { x: (col - COLS / 2 + 0.5) * TILE, z: (row - ROWS / 2 + 0.5) * TILE };
}

/** Grid line-of-sight: true when no wall cell blocks the straight line (props do not block sight). */
export function lineOfSight(x0, z0, x1, z1) {
  const distance = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(distance / (TILE * 0.25)));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const { col, row } = cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    if (isSolid(col, row)) return false;
  }
  return true;
}

/** Breadth-first path over floor cells; returns smoothed world-space waypoints (or [] if none). */
export function findPath(from, to) {
  const start = cellOf(from.x, from.z);
  const goal = cellOf(to.x, to.z);
  if (isSolid(goal.col, goal.row)) return [];
  const key = (c, r) => r * COLS + c;
  const came = new Map([[key(start.col, start.row), null]]);
  const queue = [[start.col, start.row]];
  while (queue.length > 0) {
    const [c, r] = queue.shift();
    if (c === goal.col && r === goal.row) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (isSolid(nc, nr) || came.has(key(nc, nr))) continue;
      came.set(key(nc, nr), [c, r]);
      queue.push([nc, nr]);
    }
  }
  if (!came.has(key(goal.col, goal.row))) return [];
  const cells = [];
  let current = [goal.col, goal.row];
  while (current !== null) {
    cells.push(current);
    current = came.get(key(current[0], current[1]));
  }
  cells.reverse();
  // Smooth: drop any waypoint the previous kept point can already see.
  const points = cells.map(([c, r]) => centreOf(c, r));
  points[points.length - 1] = { x: to.x, z: to.z };
  const smoothed = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i += 1) {
    if (!lineOfSight(points[anchor].x, points[anchor].z, points[i].x, points[i].z)) {
      smoothed.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  if (points.length > 1) smoothed.push(points[points.length - 1]);
  return smoothed;
}

/** Points where a fighter can hug cover: floor cells beside a wall or a prop, with the cover side. */
function computeCoverPoints(props) {
  const points = [];
  for (let row = 1; row < ROWS - 1; row += 1) {
    for (let col = 1; col < COLS - 1; col += 1) {
      if (isSolid(col, row)) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (isSolid(col + dc, row + dr)) {
          const centre = centreOf(col, row);
          points.push({ x: centre.x, z: centre.z, dirX: dc, dirZ: dr });
          break;
        }
      }
    }
  }
  for (const prop of props) {
    if (prop.h < 1.0) continue;
    const cx = (prop.minX + prop.maxX) / 2;
    const cz = (prop.minZ + prop.maxZ) / 2;
    points.push({ x: cx, z: prop.minZ - 0.7, dirX: 0, dirZ: -1 });
    points.push({ x: cx, z: prop.maxZ + 0.7, dirX: 0, dirZ: 1 });
    points.push({ x: prop.minX - 0.7, z: cz, dirX: -1, dirZ: 0 });
    points.push({ x: prop.maxX + 0.7, z: cz, dirX: 1, dirZ: 0 });
  }
  return points;
}

export function buildFacility(scene, quality) {
  const textures = makeTextures();
  const worldWidth = COLS * TILE;
  const worldDepth = ROWS * TILE;

  const wallMaterial = new THREE.MeshStandardMaterial({
    map: textures.wall, bumpMap: textures.wallBump, bumpScale: 0.5, roughness: 0.88, metalness: 0.12,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x2e333b, roughness: 0.48, metalness: 0.62 });

  // --- Walls as two instanced meshes: interior height and taller perimeter. ---
  const interiorCells = [];
  const perimeterCells = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (!isSolid(col, row)) continue;
      const border = row === 0 || col === 0 || row === ROWS - 1 || col === COLS - 1;
      (border ? perimeterCells : interiorCells).push([col, row]);
    }
  }
  const dummy = new THREE.Object3D();
  function instancedWalls(cells, height) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, height, TILE), wallMaterial, cells.length);
    cells.forEach(([col, row], i) => {
      const { x, z } = centreOf(col, row);
      dummy.position.set(x, height / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  instancedWalls(interiorCells, WALL_HEIGHT);
  instancedWalls(perimeterCells, 5.2);

  // --- Floors and ceiling. ---
  const indoorFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, 23 * TILE),
    new THREE.MeshStandardMaterial({
      map: textures.floor, bumpMap: textures.floorBump, bumpScale: 0.35, roughness: 0.5, metalness: 0.38,
    }),
  );
  textures.floor.repeat.set(COLS / 2, 23 / 2);
  textures.floorBump.repeat.set(COLS / 2, 23 / 2);
  indoorFloor.rotation.x = -Math.PI / 2;
  indoorFloor.position.set(0, 0, (11.5 - ROWS / 2) * TILE);
  indoorFloor.receiveShadow = true;
  scene.add(indoorFloor);

  const yardFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, 7 * TILE),
    new THREE.MeshStandardMaterial({
      map: textures.asphalt, bumpMap: textures.asphaltBump, bumpScale: 0.3, roughness: 0.96, metalness: 0 }),
  );
  yardFloor.rotation.x = -Math.PI / 2;
  yardFloor.position.set(0, -0.01, (26 - ROWS / 2) * TILE);
  yardFloor.receiveShadow = true;
  scene.add(yardFloor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, 23 * TILE),
    new THREE.MeshStandardMaterial({
      map: textures.ceiling, bumpMap: textures.ceilingBump, bumpScale: 0.3, roughness: 0.92, metalness: 0.08 }),
  );
  textures.ceiling.repeat.set(COLS / 2, 23 / 2);
  textures.ceilingBump.repeat.set(COLS / 2, 23 / 2);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, WALL_HEIGHT, (11.5 - ROWS / 2) * TILE);
  scene.add(ceiling);

  // Ceiling beams: dark steel I-beams spanning the halls every few metres.
  const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.55, metalness: 0.6 });
  const beamGeo = new THREE.BoxGeometry(worldWidth - 2, 0.22, 0.34);
  for (let row = 2; row < 23; row += 4) {
    const beam = new THREE.Mesh(beamGeo, beamMaterial);
    beam.position.set(0, WALL_HEIGHT - 0.13, (row + 0.5 - ROWS / 2) * TILE);
    scene.add(beam);
  }

  // --- Props: crates, racks, tables, consoles, pillars, barrels. Each is a collider too. ---
  const props = [];
  const colliders = [];
  const crateMaterial = new THREE.MeshStandardMaterial({
    map: textures.crate, bumpMap: textures.crateBump, bumpScale: 0.4, roughness: 0.82, metalness: 0.05 });
  const rackMaterial = new THREE.MeshStandardMaterial({
    map: textures.rack, bumpMap: textures.rackBump, bumpScale: 0.25, roughness: 0.45, metalness: 0.5 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.6 });
  const barrelMaterial = new THREE.MeshStandardMaterial({
    map: textures.barrel, bumpMap: textures.barrelBump, bumpScale: 0.45, roughness: 0.62, metalness: 0.45 });

  function addBox(cx, cz, w, d, h, material, yBase = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(cx, yBase + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const prop = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, mesh, kind: 'box' };
    props.push(prop);
    colliders.push(prop);
    return prop;
  }
  function crateAt(col, row, stacked = false) {
    const { x, z } = centreOf(col, row);
    addBox(x, z, 2.6, 2.6, 1.15, crateMaterial);
    if (stacked) addBox(x, z, 2.3, 2.3, 1.05, crateMaterial, 1.15);
  }
  function barrelAt(col, row) {
    const { x, z } = centreOf(col, row);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.25, 14), barrelMaterial);
    mesh.position.set(x, 0.625, z);
    mesh.castShadow = true;
    scene.add(mesh);
    const prop = { minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.55, maxZ: z + 0.55, h: 1.25, mesh, kind: 'barrel', hp: 12, x, z, dead: false };
    props.push(prop);
    colliders.push(prop);
    return prop;
  }

  // Yard cover and clutter.
  crateAt(8, 24); crateAt(12, 27, true); crateAt(22, 24); crateAt(27, 26); crateAt(5, 26); crateAt(20, 27);
  barrelAt(30, 27); barrelAt(6, 25);
  // Entry hall pillars and crates.
  addBox(...Object.values(centreOf(11, 19)), 2.2, 2.2, WALL_HEIGHT, trimMaterial);
  addBox(...Object.values(centreOf(24, 19)), 2.2, 2.2, WALL_HEIGHT, trimMaterial);
  crateAt(6, 19); crateAt(28, 20); crateAt(14, 18);
  barrelAt(33, 21);
  // Corridor 16 chokepoint crates.
  crateAt(3, 16); crateAt(32, 16);
  // Extra groupings: corridor ends, hall edge, storage depth.
  crateAt(2, 8); crateAt(33, 8); barrelAt(2, 16);
  crateAt(20, 21); barrelAt(27, 14); crateAt(24, 9);
  // Control room consoles (north edge) and crates.
  for (const col of [3, 5, 7]) {
    const { x, z } = centreOf(col, 9);
    const consoleProp = addBox(x, z - 1.2, 3.4, 1.0, 1.05, darkMetal);
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 0.85),
      new THREE.MeshBasicMaterial({ map: textures.screen }),
    );
    screenMesh.position.set(x, 1.55, z - 1.55);
    screenMesh.rotation.x = -0.28;
    scene.add(screenMesh);
    consoleProp.screen = screenMesh;
  }
  crateAt(5, 12); crateAt(9, 10, true);
  // Operations room: central holo-table and crates.
  const opsTable = centreOf(16, 11);
  addBox(opsTable.x, opsTable.z, 5.2, 2.4, 0.95, darkMetal);
  const holo = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.7),
    new THREE.MeshBasicMaterial({ map: textures.screen, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  );
  holo.rotation.x = -Math.PI / 2;
  holo.position.set(opsTable.x, 1.5, opsTable.z);
  scene.add(holo);
  crateAt(14, 13); crateAt(20, 10);
  // Storage: crate stacks and barrels.
  crateAt(26, 10, true); crateAt(30, 12); crateAt(25, 13); crateAt(33, 10);
  barrelAt(32, 13); barrelAt(24, 14);
  // Laboratory: two long benches and glass tanks (emissive-edged boxes).
  for (const row of [3, 5]) {
    const a = centreOf(4, row);
    addBox(a.x + 4, a.z, 11, 1.4, 0.95, darkMetal);
  }
  for (const col of [2, 9]) {
    const { x, z } = centreOf(col, 1);
    const tank = addBox(x, z + 1.2, 1.6, 1.2, 2.6, new THREE.MeshStandardMaterial({
      color: 0x0d2b26, roughness: 0.15, metalness: 0.1, emissive: 0x0a3d2e, emissiveIntensity: 0.7,
    }));
    tank.kind = 'tank';
  }
  barrelAt(10, 5);
  // Server room: rack rows with a walking aisle.
  for (const row of [2, 4]) {
    for (const col of [25, 27, 29, 31]) {
      const { x, z } = centreOf(col, row);
      addBox(x, z, 3.2, 1.0, 2.3, rackMaterial);
    }
  }
  crateAt(33, 5);
  // Terminal chamber dais.
  const term = centreOf(16, 1);
  addBox(term.x + 2, term.z + 1.4, 6.4, 2.6, 0.5, trimMaterial);

  // --- The objective terminal: console, animated screen and status light at the north wall. ---
  const terminal = new THREE.Group();
  const termBase = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.9), darkMetal);
  termBase.position.set(term.x + 2, 0.55, term.z + 0.6);
  termBase.castShadow = true;
  terminal.add(termBase);
  const termCanvas = document.createElement('canvas');
  termCanvas.width = 256;
  termCanvas.height = 160;
  const termTexture = new THREE.CanvasTexture(termCanvas);
  const termScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 1.9),
    new THREE.MeshBasicMaterial({ map: termTexture }),
  );
  termScreen.position.set(term.x + 2, 2.0, term.z + 0.35);
  termScreen.rotation.x = -0.16;
  terminal.add(termScreen);
  scene.add(terminal);
  colliders.push({ minX: term.x + 0.3, maxX: term.x + 3.7, minZ: term.z, maxZ: term.z + 1.1, h: 1.1, kind: 'terminal' });
  const terminalPos = { x: term.x + 2, z: term.z + 2.6 };

  // --- Extraction pad: glowing ring in the yard's east side. ---
  const padCentre = centreOf(31, 25);
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.1, 40),
    new THREE.MeshBasicMaterial({ color: 0x3fae74, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(padCentre.x, 0.03, padCentre.z);
  scene.add(pad);
  const padLight = new THREE.PointLight(0x3fae74, 12, 13, 1.8);
  padLight.position.set(padCentre.x, 2.2, padCentre.z);
  scene.add(padLight);

  // --- Sky: a painted night dome over the yard (gradient, stars, moon glow). ---
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(255, 28, 14),
    new THREE.MeshBasicMaterial({ map: textures.sky, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  skyDome.renderOrder = -1;
  scene.add(skyDome);

  // --- Lights. Hemisphere does the bounce fill: cool sky above, warm floor bounce below. ---
  scene.add(new THREE.HemisphereLight(0x9db9d9, 0x35302a, 0.7));
  scene.add(new THREE.AmbientLight(0x2c3648, 0.32));
  const moon = new THREE.DirectionalLight(0xb4c9e8, 1.5);
  moon.position.set(38, 52, 68);
  moon.castShadow = quality === 'high';
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -80;
  moon.shadow.camera.right = 80;
  moon.shadow.camera.top = 70;
  moon.shadow.camera.bottom = -70;
  moon.shadow.camera.far = 180;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  moon.shadow.radius = 4;
  scene.add(moon);
  scene.add(moon.target);

  const roomLights = [];
  function roomLight(col, row, color, intensity, distance) {
    const { x, z } = centreOf(col, row);
    const light = new THREE.PointLight(color, intensity, distance, 1.7);
    light.position.set(x, 3.1, z);
    scene.add(light);
    roomLights.push(light);
    return light;
  }
  roomLight(17, 8, 0xcfe0ee, 34, 27); // north corridor
  roomLight(17, 16, 0xcfe0ee, 34, 27); // south corridor
  roomLight(6, 8, 0xcfe0ee, 26, 24); // north corridor, west end
  roomLight(28, 8, 0xcfe0ee, 26, 24); // north corridor, east end
  roomLight(6, 16, 0xcfe0ee, 26, 24); // south corridor, west end
  roomLight(28, 16, 0xcfe0ee, 26, 24); // south corridor, east end
  roomLight(8, 19, 0xd6e4f2, 24, 22); // entry hall, west side
  roomLight(26, 19, 0xd6e4f2, 24, 22); // entry hall, east side
  roomLight(17, 20, 0xd6e4f2, 38, 31); // entry hall
  roomLight(17, 11, 0xcfe0ee, 30, 25); // operations
  roomLight(6, 11, 0xcfe0ee, 28, 23); // control
  roomLight(28, 11, 0xffd9a6, 28, 23); // storage (warm sodium)
  roomLight(5, 3, 0xcfe6da, 26, 23); // laboratory
  roomLight(28, 3, 0xcfe0ee, 28, 23); // server room
  roomLight(16, 2, 0xcfe0ee, 30, 25); // terminal chamber working light
  const alarmLight = roomLight(16, 3, 0xff3b30, 0, 30); // terminal alarm, off until the defence
  alarmLight.position.y = 3.2;

  // Ceiling light fixtures: dark housing, emissive diffuser, and a faint volumetric cone so
  // the light feels like it occupies the air. Emissive/cone only — the point lights do the work.
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x11151a, emissive: 0xd8e6f0, emissiveIntensity: 1.5, roughness: 0.6 });
  const housingMaterial = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.5, metalness: 0.6 });
  const panelGeo = new THREE.BoxGeometry(2.6, 0.05, 0.7);
  const housingGeo = new THREE.BoxGeometry(2.9, 0.07, 1.0);
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: 0x9db9cc, transparent: true, opacity: 0.028, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.FrontSide, fog: false });
  const coneGeo = new THREE.ConeGeometry(1.7, WALL_HEIGHT - 0.35, 20, 1, true);
  for (const [col, row] of [[8, 8], [17, 8], [26, 8], [8, 16], [17, 16], [26, 16], [10, 20], [24, 20], [17, 11], [6, 11], [28, 11], [5, 3], [28, 3], [16, 3],
    [3, 8], [12, 8], [22, 8], [31, 8], [3, 16], [12, 16], [22, 16], [31, 16], [8, 19], [26, 19], [13, 5], [20, 12], [24, 5]]) {
    const { x, z } = centreOf(col, row);
    const housing = new THREE.Mesh(housingGeo, housingMaterial);
    housing.position.set(x, WALL_HEIGHT - 0.015, z);
    scene.add(housing);
    const panel = new THREE.Mesh(panelGeo, panelMaterial);
    panel.position.set(x, WALL_HEIGHT - 0.05, z);
    scene.add(panel);
    const cone = new THREE.Mesh(coneGeo, coneMaterial);
    cone.position.set(x, (WALL_HEIGHT - 0.35) / 2 + 0.12, z);
    scene.add(cone);
  }
  // Wall-mounted tube strips along the two corridors (cool white, like caged fluorescents).
  const neonMaterial = new THREE.MeshStandardMaterial({
    color: 0x14161a, emissive: 0xcfe0ea, emissiveIntensity: 1.35, roughness: 0.6 });
  const neonGeo = new THREE.BoxGeometry(3.4, 0.07, 0.07);
  for (const row of [8, 16]) {
    for (let col = 3; col < COLS - 2; col += 5) {
      if (isSolid(col, row)) continue;
      const { x, z } = centreOf(col, row);
      const strip = new THREE.Mesh(neonGeo, neonMaterial);
      strip.position.set(x, 2.9, z - TILE / 2 + 0.15);
      scene.add(strip);
    }
  }

  // Yard floodlight poles. Two of them carry real spotlights that pool light on the asphalt.
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6, metalness: 0.6 });
  for (const [col, row] of [[3, 23], [32, 23], [3, 28], [32, 28]]) {
    const { x, z } = centreOf(col, row);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), poleMaterial);
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x14161a, emissive: 0xd6e6f5, emissiveIntensity: 1.3 }));
    head.position.set(x, 5.4, z);
    scene.add(head);
    colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, h: 5.4, kind: 'pole' });
    if ((col === 3 && row === 23) || (col === 32 && row === 28)) {
      const spot = new THREE.SpotLight(0xd6e6f5, 260, 34, 0.78, 0.6, 1.5);
      spot.position.set(x, 5.35, z);
      spot.target.position.set(x + (col === 3 ? 5 : -5), 0, z + (row === 23 ? 3 : -3));
      scene.add(spot);
      scene.add(spot.target);
    }
  }

  // --- Dressing (visual only, no colliders): conduit runs, junction boxes, threshold
  // hazard strips and yard traffic cones, all flush to walls, ceiling or floor. ---
  const conduitMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.45, metalness: 0.7 });
  const conduitGeo = new THREE.CylinderGeometry(0.05, 0.05, worldWidth - 6, 8);
  for (const row of [8, 16]) {
    for (const dy of [3.15, 2.98]) {
      const pipe = new THREE.Mesh(conduitGeo, conduitMaterial);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, dy, (row - ROWS / 2) * TILE + 0.09);
      scene.add(pipe);
    }
  }
  const junctionMaterial = new THREE.MeshStandardMaterial({ color: 0x272b31, roughness: 0.55, metalness: 0.5 });
  const ledMaterial = new THREE.MeshStandardMaterial({ color: 0x0c0e10, emissive: 0xd8a03c, emissiveIntensity: 1.2 });
  const junctionGeo = new THREE.BoxGeometry(0.55, 0.8, 0.14);
  const ledGeo = new THREE.BoxGeometry(0.07, 0.07, 0.02);
  for (const [col, row, face] of [[2, 8, -1], [20, 8, -1], [33, 16, -1], [12, 16, -1], [2, 16, -1], [12, 18, -1], [24, 18, -1], [30, 14, 1]]) {
    const { x, z } = centreOf(col, row);
    const boxMesh = new THREE.Mesh(junctionGeo, junctionMaterial);
    boxMesh.position.set(x - 1.2, 1.7, z + face * (TILE / 2 - 0.08));
    scene.add(boxMesh);
    const led = new THREE.Mesh(ledGeo, ledMaterial);
    led.position.set(x - 1.2, 1.92, z + face * (TILE / 2 - 0.16));
    scene.add(led);
  }
  const hazardMaterial = new THREE.MeshStandardMaterial({
    map: textures.hazard, roughness: 0.85, metalness: 0.05,
    polygonOffset: true, polygonOffsetFactor: -1 });
  const hazardGeo = new THREE.PlaneGeometry(3.7, 0.55);
  for (const [col, row] of [[4, 7], [16, 7], [27, 7], [4, 15], [16, 15], [27, 15], [8, 17], [17, 17], [10, 22], [24, 22]]) {
    const { x, z } = centreOf(col, row);
    const decal = new THREE.Mesh(hazardGeo, hazardMaterial);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x + TILE / 2, 0.012, z);
    decal.receiveShadow = true;
    scene.add(decal);
  }
  const trafficConeMaterial = new THREE.MeshStandardMaterial({ color: 0x9c4a26, roughness: 0.8 });
  const coneBandMaterial = new THREE.MeshStandardMaterial({ color: 0xcac2b2, roughness: 0.7 });
  for (const [col, row] of [[2, 24], [33, 24], [18, 28], [9, 23]]) {
    const { x, z } = centreOf(col, row);
    const coneGroup = new THREE.Group();
    const coneBody = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.72, 12), trafficConeMaterial);
    coneBody.position.y = 0.4;
    coneBody.castShadow = true;
    coneGroup.add(coneBody);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.19, 0.14, 12), coneBandMaterial);
    band.position.y = 0.42;
    coneGroup.add(band);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.56), trafficConeMaterial);
    base.position.y = 0.025;
    coneGroup.add(base);
    coneGroup.position.set(x + 1.1, 0, z + 0.9);
    scene.add(coneGroup);
  }

  // --- Environment detail pass: wall panels, vents, pipe runs, stencil door labels,
  // walkway markings, desks with monitors, locker banks and floor cables. Wall and floor
  // dressing is visual only; desks and lockers go through addBox so they collide. ---
  const detailPanelMaterial = new THREE.MeshStandardMaterial({ color: 0x39404a, roughness: 0.6, metalness: 0.5 });
  const screenPanelMaterial = new THREE.MeshBasicMaterial({ map: textures.screen });
  const doorMaterial = new THREE.MeshStandardMaterial({
    map: textures.door, bumpMap: textures.door, bumpScale: 0.2, roughness: 0.6, metalness: 0.4 });
  function flatPanel(x, y, z, w, h, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  // Corridor wall panels and vents (north faces of both corridors, hall north wall).
  for (const [col, faceZ] of [[6, -27.95], [13, -27.95], [20, -27.95], [30, -27.95],
    [6, 4.05], [20, 4.05], [30, 4.05], [12, 12.05], [22, 12.05]]) {
    const { x } = centreOf(col, 8);
    flatPanel(x, 1.85, faceZ, 2.4, 1.5, detailPanelMaterial);
    flatPanel(x, 1.85, faceZ + 0.05, 1.1, 0.7, screenPanelMaterial);
  }
  for (const [col, faceZ] of [[9, -27.95], [24, -27.95], [10, 4.05], [26, 4.05], [17, 12.05]]) {
    const { x } = centreOf(col, 8);
    flatPanel(x, 2.95, faceZ, 0.95, 0.6, rackMaterial); // vent grille
  }
  // Vertical pipe pairs at corridor corners and in the server room.
  const pipeMaterial = conduitMaterial;
  for (const [px, pz] of [[-67.8, -27.8], [65.8, -27.8], [-67.8, 4.2], [65.8, 4.2], [45.8, -53.8], [-53.8, -53.8]]) {
    for (const off of [0, 0.22]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, WALL_HEIGHT, 8), pipeMaterial);
      pipe.position.set(px + off, WALL_HEIGHT / 2, pz);
      pipe.castShadow = true;
      scene.add(pipe);
    }
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pipeMaterial);
    elbow.position.set(px, WALL_HEIGHT - 0.3, pz);
    scene.add(elbow);
  }
  // Stencil door labels above the doorways (painted plate + letterspaced text).
  function makeLabelTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#20242b';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = 'rgba(200,212,224,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = 'rgba(216,222,228,0.85)';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 84);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  for (const [text, x, z] of [
    ['LABORATORY', -52, -27.93], ['TERMINAL', -2, -27.93], ['SERVER', 38, -27.93],
    ['CONTROL', -52, 4.07], ['OPERATIONS', -2, 4.07], ['STORAGE', 38, 4.07],
  ]) {
    const label = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture(text) }));
    label.position.set(x, 2.95, z);
    scene.add(label);
  }
  // Walkway edge lines along both corridors.
  const lineMaterial = new THREE.MeshStandardMaterial({
    color: 0x77683a, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const rowZ of [-26, 6]) {
    for (const off of [-1.35, 1.35]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(128, 0.14), lineMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.011, rowZ + off);
      line.receiveShadow = true;
      scene.add(line);
    }
  }
  // Desks with monitors and chairs: control room pair, ops room pair.
  function deskAt(col, row, flip = 1) {
    const { x, z } = centreOf(col, row);
    addBox(x, z, 3.2, 1.1, 0.78, darkMetal);
    const monitor = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.68),
      new THREE.MeshBasicMaterial({ map: textures.screen }));
    monitor.position.set(x - 0.6, 1.25, z - 0.25 * flip);
    monitor.rotation.x = -0.1;
    if (flip < 0) monitor.rotation.y = Math.PI;
    scene.add(monitor);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), darkMetal);
    stand.position.set(x - 0.6, 0.98, z - 0.22 * flip);
    scene.add(stand);
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.3), detailPanelMaterial);
    keyboard.position.set(x + 0.7, 0.8, z + 0.15 * flip);
    scene.add(keyboard);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12), detailPanelMaterial);
    seat.position.set(x, 0.5, z + 1.05 * flip);
    seat.castShadow = true;
    scene.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.08), detailPanelMaterial);
    back.position.set(x, 0.95, z + 1.32 * flip);
    scene.add(back);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), darkMetal);
    post.position.set(x, 0.25, z + 1.05 * flip);
    scene.add(post);
  }
  deskAt(3, 13); deskAt(7, 13);
  deskAt(13, 13, -1); deskAt(20, 13, -1);
  // Locker banks: laboratory west wall, entry hall north wall.
  {
    const lab = centreOf(1, 3);
    addBox(lab.x - 1.7, lab.z, 0.6, 2.8, 2.1, doorMaterial);
    const hall = centreOf(6, 18);
    addBox(hall.x, hall.z - 1.6, 3.4, 0.55, 2.1, doorMaterial);
    const hall2 = centreOf(28, 18);
    addBox(hall2.x, hall2.z - 1.6, 3.4, 0.55, 2.1, doorMaterial);
  }
  // Floor cables: flat dark runs from the server racks and lab benches (visual only).
  const cableMaterial = new THREE.MeshStandardMaterial({
    color: 0x141519, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const [x, z, len, rot] of [[42, -46, 5.5, 0.2], [50, -38, 4.2, -0.5], [-46, -44, 4.6, 0.9], [-30, -36, 3.8, 0.1], [8, 18, 4.4, 0.7]]) {
    const cable = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.16), cableMaterial);
    cable.rotation.x = -Math.PI / 2;
    cable.rotation.z = rot;
    cable.position.set(x, 0.012, z);
    cable.receiveShadow = true;
    scene.add(cable);
  }

  const coverPoints = computeCoverPoints(props);
  const barrels = props.filter((prop) => prop.kind === 'barrel');

  return {
    colliders,
    props,
    barrels,
    coverPoints,
    terminalPos,
    terminalScreen: { canvas: termCanvas, texture: termTexture },
    extractionPad: { x: padCentre.x, z: padCentre.z, mesh: pad, light: padLight },
    alarmLight,
    playerSpawn: centreOf(17, 26),
    yardSpawns: [centreOf(6, 23), centreOf(28, 23), centreOf(10, 24), centreOf(24, 24), centreOf(17, 23)],
  };
}

/**
 * Move a circle (x, z, radius) against the wall grid and the prop colliders, in place on `pos`.
 * Two passes settle corners. Props taller than 0.5 block; low props block too (no climbing).
 */
export function collide(pos, radius, colliders) {
  for (let pass = 0; pass < 2; pass += 1) {
    const { col, row } = cellOf(pos.x, pos.z);
    for (let r = row - 1; r <= row + 1; r += 1) {
      for (let c = col - 1; c <= col + 1; c += 1) {
        if (!isSolid(c, r)) continue;
        pushOutOfBox(pos, radius, (c - COLS / 2) * TILE, (r - ROWS / 2) * TILE, (c - COLS / 2 + 1) * TILE, (r - ROWS / 2 + 1) * TILE);
      }
    }
    for (const box of colliders) {
      pushOutOfBox(pos, radius, box.minX, box.minZ, box.maxX, box.maxZ);
    }
  }
}

function pushOutOfBox(pos, radius, minX, minZ, maxX, maxZ) {
  const nearX = Math.max(minX, Math.min(pos.x, maxX));
  const nearZ = Math.max(minZ, Math.min(pos.z, maxZ));
  const dx = pos.x - nearX;
  const dz = pos.z - nearZ;
  const distSq = dx * dx + dz * dz;
  if (distSq > radius * radius) return;
  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    pos.x = nearX + (dx / dist) * radius;
    pos.z = nearZ + (dz / dist) * radius;
    return;
  }
  // Centre inside the box: leave by the shallowest side.
  const left = pos.x - minX;
  const right = maxX - pos.x;
  const top = pos.z - minZ;
  const bottom = maxZ - pos.z;
  const shallowest = Math.min(left, right, top, bottom);
  if (shallowest === left) pos.x = minX - radius;
  else if (shallowest === right) pos.x = maxX + radius;
  else if (shallowest === top) pos.z = minZ - radius;
  else pos.z = maxZ + radius;
}
