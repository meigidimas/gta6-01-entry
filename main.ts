// Neon Bay Heat — a sun-soaked open-world crime game for make.fun's gta6-01
// bounty ("Make GTA 6"). Danny Cole, a wheelman pulled into Neon Bay's
// underworld, explores a procedural 3D coastal city on foot and by car:
// arcade driving, traffic, a wanted level, missions with a story, a HUD
// with a live minimap, synthesized sound, and localStorage saves.
//
// This program is the entrypoint: it hands the game in. It copies game/
// and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. The game itself is plain static files under game/ —
// game/index.html opens in desktop Chrome and plays offline, with no
// network request and no build step.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// A short build summary on stdout, so a local run shows what was handed in
// without opening the output directory. Deterministic runs print the same
// lines: only the output path and the dossier size vary.
const { statSync, readdirSync } = await import('node:fs');
const shotNames = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).filter((name) => !name.startsWith('.')).sort()
  : [];
console.log(`Neon Bay Heat handed in to ${out}`);
console.log(`dossier.json: ${statSync(dossierPath).size} bytes`);
console.log(`screenshots: ${shotNames.length > 0 ? shotNames.join(', ') : 'none'}`);
