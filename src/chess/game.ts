// Wrapper chess.js : règles FIDE, coups, FEN, PGN. Pur, sans React.
import { Chess, type Move as CjsMove } from 'chess.js';
import type { Color, PieceSymbol, Square } from './types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface MoveRecord {
  san: string;
  lan: string; // ex. e2e4, e7e8q
  from: Square;
  to: Square;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  fenBefore: string;
  fenAfter: string;
  ply: number; // 1 = premier coup des Blancs
  check: boolean;
  mate: boolean;
}

export type GameStatus =
  | { over: false }
  | { over: true; result: '1-0' | '0-1' | '1/2-1/2'; reason: 'checkmate' | 'stalemate' | 'repetition' | 'fifty-moves' | 'insufficient' | 'resign' | 'draw-agreed' };

export function toLan(m: CjsMove): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`;
}

export function moveRecordFrom(m: CjsMove, fenBefore: string, fenAfter: string, ply: number): MoveRecord {
  return {
    san: m.san,
    lan: toLan(m),
    from: m.from as Square,
    to: m.to as Square,
    color: m.color,
    piece: m.piece,
    captured: m.captured,
    promotion: m.promotion,
    fenBefore,
    fenAfter,
    ply,
    check: m.san.includes('+'),
    mate: m.san.includes('#'),
  };
}

/** Coups légaux depuis une case (destinations). */
export function legalMovesFrom(fen: string, from: Square): CjsMove[] {
  const c = new Chess(fen);
  return c.moves({ square: from, verbose: true });
}

export function legalMoves(fen: string): CjsMove[] {
  return new Chess(fen).moves({ verbose: true });
}

/** Indique si un coup from->to demande une promotion. */
export function needsPromotion(fen: string, from: Square, to: Square): boolean {
  return legalMovesFrom(fen, from).some((m) => m.to === to && m.promotion);
}

/** Applique un coup et renvoie le FEN résultant + l'enregistrement, ou null si illégal. */
export function applyMove(fen: string, input: MoveInput | string, ply: number): { fen: string; record: MoveRecord } | null {
  const c = new Chess(fen);
  try {
    const m = typeof input === 'string' ? c.move(input) : c.move({ from: input.from, to: input.to, promotion: input.promotion });
    const after = c.fen();
    return { fen: after, record: moveRecordFrom(m, fen, after, ply) };
  } catch {
    return null;
  }
}

/** Convertit un coup UCI/LAN (e2e4) en SAN pour un FEN donné. */
export function lanToSan(fen: string, lan: string): string | null {
  const c = new Chess(fen);
  try {
    const m = c.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan.length > 4 ? (lan[4] as 'q') : undefined });
    return m.san;
  } catch {
    return null;
  }
}

export function sanToLan(fen: string, san: string): string | null {
  const c = new Chess(fen);
  try {
    return toLan(c.move(san));
  } catch {
    return null;
  }
}

export function gameStatus(fen: string): GameStatus {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { over: true, result: c.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  if (c.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' };
  if (c.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient' };
  if (c.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', reason: 'fifty-moves' };
  return { over: false };
}

/** Statut avec détection de répétition (nécessite l'historique). */
export function gameStatusWithHistory(startFen: string, sans: string[]): GameStatus {
  const c = new Chess(startFen);
  for (const s of sans) c.move(s);
  if (c.isCheckmate()) return { over: true, result: c.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  if (c.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' };
  if (c.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient' };
  if (c.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', reason: 'repetition' };
  if (c.isDrawByFiftyMoves()) return { over: true, result: '1/2-1/2', reason: 'fifty-moves' };
  return { over: false };
}

export function turnOf(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export function inCheck(fen: string): boolean {
  return new Chess(fen).inCheck();
}

export function kingSquare(fen: string, color: Color): Square | null {
  const c = new Chess(fen);
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square as Square;
  return null;
}

export interface PgnHeaders {
  White?: string;
  Black?: string;
  Result?: string;
  Date?: string;
  Event?: string;
  FEN?: string;
  [k: string]: string | undefined;
}

/** Construit un PGN standard (notation Blancs/Noirs conservée pour compatibilité). */
export function buildPgn(startFen: string, sans: string[], headers: PgnHeaders = {}, comments: Record<number, string> = {}): string {
  const c = new Chess(startFen);
  if (startFen !== START_FEN) {
    c.setHeader('SetUp', '1');
    c.setHeader('FEN', startFen);
  }
  for (const [k, v] of Object.entries(headers)) if (v) c.setHeader(k, v);
  sans.forEach((s, i) => {
    c.move(s);
    const cm = comments[i + 1];
    if (cm) c.setComment(cm);
  });
  return c.pgn();
}

/** Rejoue un PGN et renvoie FEN de départ + liste de coups SAN + en-têtes. */
export function parsePgn(pgn: string): { startFen: string; sans: string[]; headers: PgnHeaders; result?: string } {
  const c = new Chess();
  c.loadPgn(pgn);
  const headers = c.getHeaders() as PgnHeaders;
  const startFen = headers.FEN ?? START_FEN;
  const sans = c.history();
  return { startFen, sans, headers, result: headers.Result };
}

/** Liste des FEN successifs à partir d'une suite de SAN. */
export function fenSequence(startFen: string, sans: string[]): string[] {
  const c = new Chess(startFen);
  const out = [c.fen()];
  for (const s of sans) {
    c.move(s);
    out.push(c.fen());
  }
  return out;
}

export function replayRecords(startFen: string, sans: string[]): MoveRecord[] {
  const c = new Chess(startFen);
  const out: MoveRecord[] = [];
  sans.forEach((s, i) => {
    const before = c.fen();
    const m = c.move(s);
    out.push(moveRecordFrom(m, before, c.fen(), i + 1));
  });
  return out;
}

/** Matériel présent (hors rois) pour détecter la phase de jeu. */
export function materialCount(fen: string): { queens: number; minorsAndRooks: number; total: number } {
  const placement = fen.split(' ')[0];
  let queens = 0;
  let minorsAndRooks = 0;
  let total = 0;
  for (const ch of placement) {
    const l = ch.toLowerCase();
    if (l === 'q') queens++;
    if ('nbr'.includes(l)) minorsAndRooks++;
    if ('qnbrp'.includes(l)) total++;
  }
  return { queens, minorsAndRooks, total };
}

export type Phase = 'opening' | 'middlegame' | 'endgame';

export function phaseOf(fen: string, ply: number): Phase {
  const m = materialCount(fen);
  if (m.queens === 0 || m.minorsAndRooks <= 4) return 'endgame';
  if (ply <= 20) return 'opening';
  return 'middlegame';
}

/** Un coup donné laisse-t-il l'adversaire mater en 1 ? */
export function allowsMateInOne(fen: string, lan: string): boolean {
  const c = new Chess(fen);
  try {
    c.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan.length > 4 ? (lan[4] as 'q') : undefined });
  } catch {
    return true;
  }
  for (const m of c.moves({ verbose: true })) {
    c.move(m);
    const mate = c.isCheckmate();
    c.undo();
    if (mate) return true;
  }
  return false;
}

/** Existe-t-il un mat en 1 pour le camp au trait ? */
export function mateInOne(fen: string): string | null {
  const c = new Chess(fen);
  for (const m of c.moves({ verbose: true })) {
    c.move(m);
    const mate = c.isCheckmate();
    c.undo();
    if (mate) return m.san;
  }
  return null;
}
