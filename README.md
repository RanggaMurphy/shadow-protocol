# shadow-protocol

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/RanggaMurphy/shadow-protocol/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/RanggaMurphy/shadow-protocol/reward.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

SHADOW PROTOCOL is a 3D tactical first-person shooter that runs entirely in the browser. You are an elite operator infiltrating a secret research facility: fight through its garrison, activate the terminal, and reach extraction in the campaign mission, or hold out against escalating waves in survival mode. It features five distinct weapons (assault rifle, sniper rifle, shotgun, SMG and pistol, each with its own sound, recoil, reload and damage profile), four enemy AI types that detect, chase, take cover and return fire with different accuracy and aggression, and a full HUD with dynamic crosshair, hit markers, objective tracker, kill counter and mini-map. Every texture is generated procedurally on a canvas and every sound — gunfire, reloads, footsteps, alarms, ambient hum and the cinematic music loop — is synthesized with WebAudio, so the game is just static files under `game/` with Three.js vendored as a single minified build: no build step and no network requests. Controls: WASD to move, mouse to aim, Shift to sprint, Space to jump, Ctrl to crouch, left click to shoot, right click to aim down sights, R to reload, 1–5 to switch weapons, P or Esc to pause.

## Run it

```sh
# Play the game: serve game/ locally, then open http://localhost:8080 in a desktop browser
node serve.ts

# Grader handover: copy game/ and screenshots/ into out/ and write out/dossier.json
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=kk4vhpqg&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
