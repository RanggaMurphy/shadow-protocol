// Every sound in SHADOW PROTOCOL is synthesised with WebAudio: five distinct gunshots, reloads,
// footsteps, explosions, the terminal alarm, facility ambience and a low cinematic music bed.
// There are no audio files. Everything is guarded, so a browser without audio plays mute.

export function createAudio() {
  let context = null;
  let master = null;
  let volume = 0.8;
  let alarmNodes = null;
  let ambientNodes = null;
  let musicTimer = null;

  function ensure() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return false;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = volume * 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(from, to, seconds, type, gain, delay = 0, destination = null) {
    if (!ensure()) return;
    try {
      const start = context.currentTime + delay;
      const osc = context.createOscillator();
      const env = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
      env.gain.setValueAtTime(gain, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + seconds);
      osc.connect(env).connect(destination ?? master);
      osc.start(start);
      osc.stop(start + seconds + 0.02);
    } catch { /* audio never breaks the game */ }
  }

  function noiseBurst(seconds, gain, cutoffFrom, cutoffTo, delay = 0, type = 'lowpass') {
    if (!ensure()) return;
    try {
      const start = context.currentTime + delay;
      const frames = Math.max(1, Math.floor(context.sampleRate * seconds));
      const buffer = context.createBuffer(1, frames, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(cutoffFrom, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, cutoffTo), start + seconds);
      const env = context.createGain();
      env.gain.setValueAtTime(gain, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + seconds);
      source.connect(filter).connect(env).connect(master);
      source.start(start);
    } catch { /* as above */ }
  }

  /** A gunshot voice: crack (high noise), body (mid thump) and a mechanical click. */
  function gunshot({ crack, body, tail, gain }) {
    noiseBurst(0.05, gain * 0.9, 5200, 900, 0, 'highpass');
    noiseBurst(tail, gain, crack, body, 0);
    tone(150, 45, tail * 0.9, 'sine', gain * 0.7);
  }

  const SHOTS = {
    ar: { crack: 2600, body: 500, tail: 0.16, gain: 0.5 },
    shotgun: { crack: 1900, body: 300, tail: 0.34, gain: 0.85 },
    sniper: { crack: 3400, body: 380, tail: 0.55, gain: 0.9 },
    smg: { crack: 2800, body: 620, tail: 0.11, gain: 0.42 },
    pistol: { crack: 3000, body: 700, tail: 0.13, gain: 0.45 },
  };

  return {
    unlock() {
      ensure();
    },
    setVolume(value) {
      volume = value;
      if (master) master.gain.value = volume * 0.5;
    },
    shoot(id) {
      gunshot(SHOTS[id] ?? SHOTS.ar);
      if (id === 'sniper') tone(2400, 300, 0.4, 'sine', 0.06, 0.05); // the crack's echo tail
    },
    enemyShoot(distance = 10) {
      const gain = Math.max(0.05, Math.min(0.3, 9 / (distance + 4)));
      noiseBurst(0.14, gain, 1500, 350);
      tone(130, 55, 0.13, 'sine', gain * 0.8);
    },
    dryFire() {
      tone(1200, 900, 0.03, 'square', 0.12);
    },
    reloadStart() {
      tone(500, 240, 0.05, 'square', 0.14);
      noiseBurst(0.04, 0.1, 2000, 800, 0.02);
    },
    reloadEnd() {
      noiseBurst(0.05, 0.16, 2600, 900, 0);
      tone(700, 420, 0.05, 'square', 0.14, 0.03);
      tone(950, 950, 0.04, 'square', 0.12, 0.1);
    },
    weaponSwitch() {
      noiseBurst(0.05, 0.12, 1800, 700);
      tone(620, 480, 0.05, 'square', 0.08, 0.02);
    },
    hitmarker(kill = false) {
      tone(kill ? 1560 : 1250, kill ? 1560 : 1250, 0.045, 'square', kill ? 0.2 : 0.13);
      if (kill) tone(1560, 1560, 0.07, 'square', 0.16, 0.05);
    },
    playerHurt() {
      tone(300, 70, 0.22, 'sawtooth', 0.28);
      noiseBurst(0.18, 0.2, 800, 150);
    },
    explosion(big = true) {
      noiseBurst(big ? 0.9 : 0.5, 0.85, 3000, 60);
      tone(110, 28, big ? 0.85 : 0.5, 'sine', 0.8);
      noiseBurst(0.25, 0.3, 5000, 1500, 0.02, 'highpass');
    },
    footstep(running = false) {
      noiseBurst(0.055, running ? 0.13 : 0.09, 500, 140);
    },
    jump() {
      noiseBurst(0.06, 0.07, 900, 300);
    },
    land() {
      noiseBurst(0.09, 0.14, 420, 120);
    },
    pickup() {
      tone(660, 660, 0.06, 'square', 0.12);
      tone(990, 990, 0.09, 'square', 0.12, 0.06);
    },
    terminalTick(progress) {
      tone(880 + progress * 500, 880 + progress * 500, 0.05, 'sine', 0.1);
    },
    objectiveDone() {
      tone(523, 523, 0.11, 'triangle', 0.2);
      tone(784, 784, 0.11, 'triangle', 0.2, 0.1);
      tone(1047, 1047, 0.24, 'triangle', 0.2, 0.2);
    },
    startAlarm() {
      if (!ensure() || alarmNodes !== null) return;
      try {
        const osc = context.createOscillator();
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        const env = context.createGain();
        osc.type = 'square';
        osc.frequency.value = 620;
        lfo.frequency.value = 0.55;
        lfoGain.gain.value = 190;
        env.gain.value = 0.035;
        lfo.connect(lfoGain).connect(osc.frequency);
        osc.connect(env).connect(master);
        osc.start();
        lfo.start();
        alarmNodes = { osc, lfo };
      } catch { /* ignore */ }
    },
    stopAlarm() {
      if (alarmNodes === null) return;
      try {
        alarmNodes.osc.stop();
        alarmNodes.lfo.stop();
      } catch { /* ignore */ }
      alarmNodes = null;
    },
    startAmbient() {
      if (!ensure() || ambientNodes !== null) return;
      try {
        const osc = context.createOscillator();
        const env = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = 58;
        env.gain.value = 0.05;
        osc.connect(env).connect(master);
        osc.start();
        ambientNodes = { osc };
      } catch { /* ignore */ }
    },
    startMusic() {
      if (!ensure() || musicTimer !== null) return;
      // A slow, dark two-chord pad with a sub pulse: atmosphere, never melody-forward.
      const chords = [[110, 164.8, 220], [87.3, 130.8, 174.6]];
      let step = 0;
      const playChord = () => {
        const chord = chords[step % chords.length];
        for (const freq of chord) tone(freq, freq, 3.8, 'triangle', 0.045);
        tone(chord[0] / 2, chord[0] / 2, 1.6, 'sine', 0.06, 0.1);
        step += 1;
      };
      playChord();
      musicTimer = setInterval(playChord, 4000);
    },
    stopMusic() {
      if (musicTimer !== null) clearInterval(musicTimer);
      musicTimer = null;
    },
  };
}
