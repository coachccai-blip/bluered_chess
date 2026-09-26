// Analyse coup par coup avec Stockfish (section 7, étape 1) puis classification et motifs.
import { Chess } from 'chess.js';
import type { EngineClient } from '../engine/engineClient';
import { lineScore } from '../engine/engineClient';
import { lanToSan, phaseOf, replayRecords, pvToSan, type MoveRecord } from '../chess/game';
import { explainBest } from './explain';
import { legalMoves } from '../chess/game';
import { classifyMove } from './classify';
import { detectMotifs } from './motifs';
import { selectKeyMoments, summarize, type GameSummary, type KeyMoment, type MoveEval } from './coach';
import { moveAccuracy, winProbability } from './winprob';

export interface AnalysisOptions {
  depth?: number;
  movetime?: number;
  onProgress?: (done: number, total: number, partial: MoveEval[]) => void;
  signal?: AbortSignal;
}

export interface GameAnalysis {
  engineDepth: number;
  moves: MoveEval[];
  keyMoments: KeyMoment[];
  summary: GameSummary;
}

interface PosEval {
  /** Score point de vue Blancs. */
  cpWhite: number;
  /** Mat en N du point de vue du camp au trait (signé), ou null. */
  mate: number | null;
  bestLan: string | null;
  /** Variante principale (LAN), meilleur coup en tête. */
  pv: string[];
}

async function evalPosition(engine: EngineClient, fen: string, opts: AnalysisOptions): Promise<PosEval> {
  const res = await engine.analyze(fen, { depth: opts.depth, movetime: opts.movetime, multiPv: 1 });
  const line = res.lines.find((l) => l.multipv === 1) ?? res.lines[0];
  const stm = fen.split(' ')[1] === 'w' ? 1 : -1;
  if (!line) {
    // Position terminale (mat ou pat).
    if (legalMoves(fen).length === 0 && new Chess(fen).isCheckmate()) return { cpWhite: -10000 * stm, mate: 0, bestLan: null, pv: [] };
    return { cpWhite: 0, mate: null, bestLan: null, pv: [] };
  }
  const score = lineScore(line);
  return { cpWhite: score * stm, mate: line.mate ?? null, bestLan: res.bestMove ?? line.pv[0] ?? null, pv: line.pv };
}

/** Analyse une partie (SAN depuis startFen). Les évaluations sont en cp point de vue Blancs. */
export async function analyzeGame(
  engine: EngineClient,
  startFen: string,
  sans: string[],
  playerColor: 'w' | 'b',
  opts: AnalysisOptions = {},
): Promise<GameAnalysis> {
  const depth = opts.depth ?? 14;
  const records = replayRecords(startFen, sans);
  const evals: PosEval[] = [];
  const total = records.length + 1;
  const moves: MoveEval[] = [];

  evals.push(await evalPosition(engine, startFen, { ...opts, depth }));
  for (let i = 0; i < records.length; i++) {
    if (opts.signal?.aborted) throw new Error('Analyse annulée');
    const rec = records[i];
    evals.push(await evalPosition(engine, rec.fenAfter, { ...opts, depth }));
    moves.push(buildMoveEval(rec, evals[i], evals[i + 1], records.slice(0, i)));
    opts.onProgress?.(i + 2, total, moves);
  }
  const keyMoments = selectKeyMoments(moves, playerColor);
  const summary = summarize(moves, playerColor, moveAccuracy);
  return { engineDepth: depth, moves, keyMoments, summary };
}

export function buildMoveEval(rec: MoveRecord, before: PosEval, after: PosEval, previous: MoveRecord[]): MoveEval {
  const sign = rec.color === 'w' ? 1 : -1;
  const wpBefore = winProbability(before.cpWhite * sign);
  const wpAfter = winProbability(after.cpWhite * sign);
  const winProbLoss = Math.max(0, wpBefore - wpAfter);
  const bestLan = before.bestLan;
  const bestSan = bestLan ? lanToSan(rec.fenBefore, bestLan) : null;
  const isBest = bestLan === rec.lan;
  const mateAvailableBefore = before.mate !== null && before.mate > 0 ? before.mate : null;
  // Après le coup, c'est l'adversaire au trait : un mat négatif pour lui = mat toujours disponible pour moi.
  // Un coup qui mate ne « rate » jamais le mat ; sinon un mat négatif pour l'adversaire = mat toujours disponible.
  const mateStillAvailableAfter = rec.mate || (after.mate !== null && after.mate < 0);
  const mateAgainstAfter = after.mate !== null && after.mate > 0 ? after.mate : null;
  const category = rec.mate
    ? 'excellent'
    : classifyMove({
    winProbLoss,
    isBest,
    isOnlyMove: legalMoves(rec.fenBefore).length === 1,
    mateAvailableBefore,
    mateStillAvailableAfter,
  });
  const significant = ['mistake', 'blunder', 'mate_missed'].includes(category) || winProbLoss > 8;
  const motifs = detectMotifs({
    record: rec,
    bestMoveLan: bestLan,
    bestMoveSan: bestSan,
    significant,
    previousRecords: previous,
    mateAvailableBefore,
    mateAgainstAfter,
  });
  const bestLine = pvToSan(rec.fenBefore, before.pv.slice(0, 5));
  const threatLan = after.pv[0] ?? after.bestLan;
  const threat = threatLan ? lanToSan(rec.fenAfter, threatLan) : null;
  const move: MoveEval = {
    ply: rec.ply,
    san: rec.san,
    lan: rec.lan,
    color: rec.color,
    fenBefore: rec.fenBefore,
    fenAfter: rec.fenAfter,
    evalBefore: before.cpWhite,
    evalAfter: after.cpWhite,
    bestMove: bestSan,
    bestMoveLan: bestLan,
    bestLine,
    threat,
    threatLan: threatLan ?? null,
    winProbLoss,
    category,
    motifs,
    phase: phaseOf(rec.fenBefore, rec.ply),
  };
  move.explanation = explainBest(move);
  return move;
}
