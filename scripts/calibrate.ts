// Calibration des bots (à lancer en local, gratuit) : fait jouer chaque profil contre des références Stockfish
// à Elo natif connu et estime son Elo par la formule des performances.
// Usage : npm run calibrate -- [--games 20] [--profiles 800,900,1000]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EngineClient, type EngineTransport } from '../src/engine/engineClient';
import { BOT_PROFILES, profileFor, type BotProfile } from '../src/engine/botProfiles';
import { botMove } from '../src/engine/bot';
import { applyMove, gameStatusWithHistory, START_FEN } from '../src/chess/game';
import { performanceRating } from '../src/progress/elo';

function nodeTransport(): EngineTransport {
  const child = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-19-lite-single.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = createInterface({ input: child.stdout });
  let cb: ((l: string) => void) | null = null;
  rl.on('line', (l) => cb?.(l));
  return {
    postMessage: (m) => child.stdin.write(m + '\n'),
    onMessage: (f) => {
      cb = f;
    },
    terminate: () => child.kill(),
  };
}

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const GAMES = parseInt(opt('games', '20'), 10);
const PROFILES = opt('profiles', '')
  .split(',')
  .filter(Boolean)
  .map((s) => parseInt(s, 10));
const REFERENCES = [1350, 1500, 1800];

async function playGame(engine: EngineClient, a: BotProfile, b: BotProfile, aIsWhite: boolean): Promise<0 | 0.5 | 1> {
  let fen = START_FEN;
  const sans: string[] = [];
  for (let ply = 0; ply < 300; ply++) {
    const status = gameStatusWithHistory(START_FEN, sans);
    if (status.over) {
      if (status.result === '1/2-1/2') return 0.5;
      const whiteWon = status.result === '1-0';
      return whiteWon === aIsWhite ? 1 : 0;
    }
    const whiteToMove = fen.split(' ')[1] === 'w';
    const mover = whiteToMove === aIsWhite ? a : b;
    const choice = await botMove(engine, fen, sans, mover);
    if (!choice) return 0.5;
    const res = applyMove(fen, { from: choice.lan.slice(0, 2) as never, to: choice.lan.slice(2, 4) as never, promotion: (choice.lan[4] as 'q') || undefined }, ply + 1);
    if (!res) return 0.5;
    fen = res.fen;
    sans.push(res.record.san);
  }
  return 0.5;
}

async function main() {
  const engine = new EngineClient(nodeTransport());
  await engine.init();
  const targets = PROFILES.length ? PROFILES.map(profileFor) : BOT_PROFILES.filter((p) => p.mode === 'hybrid');
  console.log(`Calibration : ${targets.length} profil(s), ${GAMES} partie(s) par référence.`);
  for (const p of targets) {
    let score = 0;
    let n = 0;
    let oppSum = 0;
    for (const ref of REFERENCES) {
      const refProfile = profileFor(ref);
      for (let g = 0; g < GAMES; g++) {
        const s = await playGame(engine, p, refProfile, g % 2 === 0);
        score += s;
        n++;
        oppSum += ref;
      }
    }
    const perf = performanceRating(oppSum / n, score / n);
    const delta = perf - p.elo;
    console.log(`Bot ${p.elo} (${p.name}) : score ${(100 * score) / n}% → Elo estimé ${perf} (écart ${delta >= 0 ? '+' : ''}${delta}). ` + (Math.abs(delta) > 40 ? `Ajuster T=${p.temperature} / gaffes=${p.blunderRate}` : 'OK'));
  }
  engine.dispose();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
