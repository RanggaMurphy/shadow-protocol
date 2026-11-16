// SHADOW PROTOCOL tuning constants: the operator, the arsenal, the hostile types and the
// mission timings. Every other module reads its numbers from here so balance lives in one place.

export const TILE = 4; // metres per grid cell
export const WALL_HEIGHT = 3.6;

export const PLAYER = {
  maxHealth: 100,
  maxArmor: 100,
  walkSpeed: 5.2,
  sprintSpeed: 7.6,
  crouchSpeed: 2.6,
  radius: 0.42,
  standEye: 1.62,
  crouchEye: 1.12,
  jumpVelocity: 7.4,
  gravity: 22,
};

// One entry per weapon, in slot order (keys 1-5). damage is per pellet; rpm rounds per minute;
// spread is the hip-fire cone in radians; recoil is the camera kick per shot; zoom divides the
// field of view while aiming down sights.
export const WEAPONS = [
  {
    id: 'ar', name: 'VK-7 ASSAULT RIFLE', damage: 34, headMult: 2.0, rpm: 640, auto: true,
    magSize: 30, reserveStart: 120, reload: 2.0, pellets: 1, spread: 0.020, recoil: 0.0105,
    zoom: 1.5, bloomPerShot: 0.16,
  },
  {
    id: 'shotgun', name: 'BREACH-12 SHOTGUN', damage: 13, headMult: 1.5, rpm: 68, auto: false,
    magSize: 6, reserveStart: 30, reload: 2.8, pellets: 8, spread: 0.055, recoil: 0.045,
    zoom: 1.25, bloomPerShot: 0.5,
  },
  {
    id: 'sniper', name: 'LONGSHOT .338 SNIPER', damage: 150, headMult: 2.0, rpm: 42, auto: false,
    magSize: 5, reserveStart: 20, reload: 3.1, pellets: 1, spread: 0.0035, recoil: 0.06,
    zoom: 3.2, bloomPerShot: 0.6,
  },
  {
    id: 'smg', name: 'RAPTOR SMG', damage: 21, headMult: 1.8, rpm: 920, auto: true,
    magSize: 36, reserveStart: 144, reload: 1.7, pellets: 1, spread: 0.032, recoil: 0.0075,
    zoom: 1.4, bloomPerShot: 0.11,
  },
  {
    id: 'pistol', name: 'P9 SIDEARM', damage: 26, headMult: 2.0, rpm: 380, auto: false,
    magSize: 12, reserveStart: 60, reload: 1.4, pellets: 1, spread: 0.016, recoil: 0.013,
    zoom: 1.35, bloomPerShot: 0.2,
  },
];

// Hostile types. accuracy is the base hit probability before distance/sprint/crouch modifiers;
// burst/burstPause shape their fire discipline; preferredMin is the closest range (metres) the
// attack state tolerates before advancing again; cover=false types never hide.
export const ENEMY_TYPES = {
  trooper: {
    id: 'trooper', hp: 100, speed: 3.1, damage: 8, accuracy: 0.30, burst: 3, burstPause: 1.15,
    fireInterval: 0.13, range: 30, preferredMin: 6, score: 100, color: 0x4a5568, visor: 0xff5348, cover: true,
  },
  rusher: {
    id: 'rusher', hp: 70, speed: 4.6, damage: 6, accuracy: 0.26, burst: 5, burstPause: 0.8,
    fireInterval: 0.09, range: 22, preferredMin: 3.5, score: 120, color: 0x6b4a2f, visor: 0xffa53c, cover: false,
  },
  marksman: {
    id: 'marksman', hp: 80, speed: 2.7, damage: 16, accuracy: 0.42, burst: 1, burstPause: 1.5,
    fireInterval: 0.3, range: 44, preferredMin: 16, score: 150, color: 0x37474f, visor: 0x53c8ff, cover: true,
  },
  heavy: {
    id: 'heavy', hp: 320, speed: 2.0, damage: 9, accuracy: 0.27, burst: 6, burstPause: 1.3,
    fireInterval: 0.11, range: 30, preferredMin: 7, score: 300, color: 0x5d4037, visor: 0xff3df0, cover: false,
  },
};

export const MISSION = {
  terminalHoldSeconds: 20,
  extractionSeconds: 8,
};
