// Générateurs d'exercices internes (visualisation à l'aveugle, compte des attaquants).
import { computeAttacks, parseFenBoard, attackedSquaresOf, boardPieces } from '../chess/attacks';
import { ALL_SQUARES, type Square } from '../chess/types';

export const PRACTICE_FENS = [
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  'r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 4 8',
  'rnbqkb1r/pp3ppp/2p2n2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 5',
  '2kr3r/ppp1qppp/2n1bn2/4p3/2B1P3/2N2N2/PPP2PPP/R2QR1K1 w - - 0 11',
  'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2P1PN2/PP1NBPPP/R1BQ1RK1 w - - 0 8',
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  '4k3/8/8/3N4/8/2B5/8/4K3 w - - 0 1',
  '4k3/8/3n4/8/8/8/2B5/4K3 w - - 0 1',
];

export interface BlindfoldQuestion {
  fen: string;
  piece: Square;
  pieceName: string;
  answer: Square[];
}

/** « Quelles cases le cavalier e5 attaque-t-il ? » sur un cavalier ou un fou de la position. */
export function knightSquaresQuestion(rng: () => number = Math.random): BlindfoldQuestion {
  const fen = PRACTICE_FENS[Math.floor(rng() * PRACTICE_FENS.length)];
  const board = parseFenBoard(fen);
  const candidates = boardPieces(board).filter((p) => p.type === 'n' || p.type === 'b');
  const piece = candidates[Math.floor(rng() * candidates.length)];
  return {
    fen,
    piece: piece.square,
    pieceName: piece.type === 'n' ? 'cavalier' : 'fou',
    answer: attackedSquaresOf(board, piece),
  };
}

export interface CountQuestion {
  fen: string;
  square: Square;
  blue: number;
  red: number;
}

export function countAttackersQuestion(rng: () => number = Math.random): CountQuestion {
  const fen = PRACTICE_FENS[Math.floor(rng() * PRACTICE_FENS.length)];
  const { map } = computeAttacks(fen);
  // Préférer une case contestée ou occupée.
  const interesting = ALL_SQUARES.filter((s) => map[s].w.length + map[s].b.length >= 2);
  const pool = interesting.length ? interesting : ALL_SQUARES;
  const square = pool[Math.floor(rng() * pool.length)];
  return { fen, square, blue: map[square].w.length, red: map[square].b.length };
}

/** Score de précision (0..100) entre la réponse et les cases attendues. */
export function blindfoldScore(answer: Square[], expected: Square[]): number {
  const exp = new Set(expected);
  const ans = new Set(answer);
  let correct = 0;
  for (const s of ans) if (exp.has(s)) correct++;
  const wrong = ans.size - correct;
  const missed = exp.size - correct;
  const total = exp.size + wrong;
  return total === 0 ? 100 : Math.max(0, Math.round(((exp.size - missed - wrong) / total) * 100));
}
