// Heads-up display: health/armor bars, ammo counter with reload bar, objective tracker, kill and
// score counter, dynamic crosshair, hitmarkers, damage vignette, interact prompt, announcements,
// the sniper scope overlay, and a top-down canvas minimap of the facility. All DOM is declared
// in index.html; this module only reads and writes it.
import { GRID, COLS, ROWS, cellOf } from './map.js';

export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const elements = {
    hud: $('hud'),
    hpFill: $('hp-fill'),
    hpNum: $('hp-num'),
    armorFill: $('armor-fill'),
    armorNum: $('armor-num'),
    weaponName: $('weapon-name'),
    mag: $('mag'),
    reserve: $('reserve'),
    reloadWrap: $('reload-wrap'),
    reloadFill: $('reload-fill'),
    objText: $('obj-text'),
    objSub: $('obj-sub'),
    score: $('score'),
    kills: $('kills'),
    waveInfo: $('wave-info'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    vignette: $('damage-vignette'),
    scope: $('scope'),
    interact: $('interact'),
    interactFill: $('interact-fill'),
    toast: $('toast'),
    minimap: $('minimap'),
    clashHud: $('clash-hud'),
    clashYou: $('clash-you'),
    clashEnemy: $('clash-enemy'),
    clashAlive: $('clash-alive'),
    clashTime: $('clash-time'),
  };
  const mapCtx = elements.minimap.getContext('2d');

  // Prerender the static facility plan once; live dots are drawn over it each frame.
  const plan = document.createElement('canvas');
  plan.width = elements.minimap.width;
  plan.height = elements.minimap.height;
  const planCtx = plan.getContext('2d');
  const cellW = plan.width / COLS;
  const cellH = plan.height / ROWS;
  planCtx.fillStyle = '#0a0e14';
  planCtx.fillRect(0, 0, plan.width, plan.height);
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = GRID[row][col];
      if (cell === '#') planCtx.fillStyle = '#33415580';
      else if (cell === 'o') planCtx.fillStyle = '#1a2417';
      else planCtx.fillStyle = '#141c26';
      if (cell === '#') planCtx.fillStyle = '#3b4a61';
      planCtx.fillRect(col * cellW, row * cellH, cellW + 0.5, cellH + 0.5);
    }
  }

  let hitT = 0;
  let toastT = 0;
  let damageFlash = 0;
  let lastObjective = '';
  let lastObjectiveSub = '';

  function worldToMap(x, z) {
    const { col, row } = cellOf(x, z);
    return { x: (col + 0.5) * cellW, y: (row + 0.5) * cellH };
  }

  return {
    elements,
    showHud(visible) {
      elements.hud.classList.toggle('hidden', !visible);
    },
    setObjective(text, sub = '') {
      if (text !== lastObjective) {
        elements.objText.textContent = text;
        lastObjective = text;
      }
      if (sub !== lastObjectiveSub) {
        elements.objSub.textContent = sub;
        lastObjectiveSub = sub;
      }
    },
    toast(text, seconds = 2.4) {
      elements.toast.textContent = text;
      elements.toast.classList.add('show');
      toastT = seconds;
    },
    /** Team Clash scoreboard strip; pass null to hide it. */
    setClash(info) {
      if (!info) {
        elements.clashHud.classList.add('hidden');
        return;
      }
      elements.clashHud.classList.remove('hidden');
      elements.clashYou.textContent = `YOU ${info.you}`;
      elements.clashEnemy.textContent = `${info.enemy} ENEMY`;
      elements.clashAlive.textContent = `ALIVE ${info.youAlive} v ${info.enemyAlive} · ROUND ${info.round}`;
      const seconds = Math.max(0, Math.ceil(info.time));
      elements.clashTime.textContent = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
    },
    hitmarker(kill) {
      elements.hitmarker.classList.toggle('kill', kill);
      elements.hitmarker.classList.add('show');
      hitT = kill ? 0.28 : 0.14;
    },
    damage() {
      damageFlash = 1;
    },
    update(dt, view) {
      // view: { player, weapons, score, kills, wave, mode, enemies, terminalPos, extractionPad, playerYaw }
      const { player, weapons } = view;
      elements.hpFill.style.width = `${Math.max(0, player.health)}%`;
      elements.hpFill.style.background = player.health > 30 ? '#53ff9e' : '#ff5348';
      elements.hpNum.textContent = Math.ceil(player.health);
      elements.armorFill.style.width = `${Math.max(0, player.armor)}%`;
      elements.armorNum.textContent = Math.ceil(player.armor);
      elements.weaponName.textContent = weapons.def.name;
      elements.mag.textContent = weapons.current.mag;
      elements.reserve.textContent = weapons.current.reserve;
      elements.reloadWrap.classList.toggle('hidden', !weapons.reloading);
      if (weapons.reloading) elements.reloadFill.style.width = `${weapons.reloadProgress * 100}%`;
      elements.score.textContent = view.score.toLocaleString('en-US');
      elements.kills.textContent = view.kills;
      elements.waveInfo.textContent = view.mode === 'survival' ? `WAVE ${view.wave}` : view.mode === 'clash' ? 'TEAM CLASH' : 'CAMPAIGN';

      // Crosshair spread grows with bloom and movement.
      const spreadPx = 7 + weapons.bloom * 26 + (player.sprinting ? 7 : 0) + (1 - weapons.adsT) * 3;
      elements.crosshair.style.setProperty('--spread', `${spreadPx.toFixed(1)}px`);
      elements.crosshair.style.opacity = weapons.adsT > 0.75 && weapons.def.id === 'sniper' ? '0' : '1';
      elements.scope.classList.toggle('hidden', !(weapons.adsT > 0.6 && weapons.def.id === 'sniper'));

      if (hitT > 0) {
        hitT -= dt;
        if (hitT <= 0) elements.hitmarker.classList.remove('show');
      }
      if (toastT > 0) {
        toastT -= dt;
        if (toastT <= 0) elements.toast.classList.remove('show');
      }
      damageFlash = Math.max(0, damageFlash - dt * 1.6);
      const lowHp = player.alive && player.health <= 30 ? 0.25 + 0.15 * Math.sin(performance.now() / 280) : 0;
      elements.vignette.style.opacity = Math.min(1, damageFlash * 0.85 + lowHp).toFixed(2);

      // Minimap.
      mapCtx.drawImage(plan, 0, 0);
      if (view.mode === 'campaign') {
        const t = worldToMap(view.terminalPos.x, view.terminalPos.z);
        mapCtx.fillStyle = '#ffd94d';
        mapCtx.fillRect(t.x - 2.5, t.y - 2.5, 5, 5);
        const pad = worldToMap(view.extractionPad.x, view.extractionPad.z);
        mapCtx.fillStyle = '#53ff9e';
        mapCtx.beginPath();
        mapCtx.arc(pad.x, pad.y, 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const enemy of view.enemies) {
        if (!enemy.alive) continue;
        mapCtx.fillStyle = enemy.team === 'ally' ? '#53c8ff' : '#ff5348';
        const p = worldToMap(enemy.group.position.x, enemy.group.position.z);
        mapCtx.fillRect(p.x - 1.8, p.y - 1.8, 3.6, 3.6);
      }
      const pp = worldToMap(player.pos.x, player.pos.z);
      mapCtx.save();
      mapCtx.translate(pp.x, pp.y);
      mapCtx.rotate(-view.playerYaw);
      mapCtx.fillStyle = '#7ee2ff';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -5);
      mapCtx.lineTo(3.4, 4);
      mapCtx.lineTo(-3.4, 4);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
    setInteract(text, progress) {
      if (text === null) {
        elements.interact.classList.add('hidden');
        return;
      }
      elements.interact.classList.remove('hidden');
      elements.interact.querySelector('span').textContent = text;
      elements.interactFill.style.width = `${Math.round(progress * 100)}%`;
    },
  };
}
