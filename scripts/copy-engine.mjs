// Copie les binaires nécessaires depuis node_modules vers public/ (dossiers ignorés par git) :
// - Stockfish lite mono-thread -> public/engine/
// - ONNX Runtime (WASM) et phonémiseur Piper -> public/tts/ (voix HD hors ligne, chargés à la demande)
// Lancé automatiquement avant `dev` et `build` (voir package.json).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function copyAll(srcDir, dstDir, files) {
  mkdirSync(dstDir, { recursive: true });
  for (const f of files) {
    const from = resolve(srcDir, f);
    if (!existsSync(from)) {
      console.error(`Fichier introuvable : ${from}. Lance npm install.`);
      process.exit(1);
    }
    copyFileSync(from, resolve(dstDir, f));
  }
}

copyAll('node_modules/stockfish/bin', 'public/engine', ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']);
copyAll('node_modules/onnxruntime-web/dist', 'public/tts/ort', ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']);
copyAll('node_modules/@diffusionstudio/piper-wasm/build', 'public/tts/piper', ['piper_phonemize.wasm', 'piper_phonemize.data']);
console.log('Moteur Stockfish et fichiers de voix HD copiés dans public/');
