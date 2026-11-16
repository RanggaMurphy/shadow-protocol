// SHADOW PROTOCOL — entry program for make.fun's best-game-01 (Node 22, standard library only).
//
// The game itself is the static site in game/ (open game/index.html in a browser and play).
// This program is the courier: it copies game/ and screenshots/ into the output directory and
// writes dossier.json there with buildDossier from the vendored make.fun library, which is the
// summary the scorer checks and the judge reads. Run it the way the grader does, or locally with
// MAKEFUN_OUTPUT_DIR pointing at a scratch folder:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below are the scorer's own limits for this competition: the dossier text budget, at
// most 4 screenshots of at most 256 KiB each, and game/ held to 993 entries, 48 MiB in total and
// 1,000 bytes a path. buildDossier refuses anything the scorer would refuse.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
