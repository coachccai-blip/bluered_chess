// Copie le build Stockfish « lite mono-thread » depuis node_modules vers public/engine.
// Lancé automatiquement avant `dev` et `build` (voir package.json).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve('node_modules/stockfish/bin');
const dst = resolve('public/engine');
mkdirSync(dst, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  const from = resolve(src, f);
  if (!existsSync(from)) {
    console.error(`Fichier moteur introuvable : ${from}. Lance npm install.`);
    process.exit(1);
  }
  copyFileSync(from, resolve(dst, f));
}
console.log('Moteur Stockfish lite copié dans public/engine/');
