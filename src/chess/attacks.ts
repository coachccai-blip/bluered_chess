// Carte d'attaques par case, calculée avec des tables maison (pas moves() de chess.js,
// qui ne renvoie que les coups légaux). Pure, mémoïsée par FEN.
import type { AttackMap, AttackSummary, Color, HangingPiece, PieceSymbol, PlacedPiece, Square } from './types';
import { ALL_SQUARES, PIECE_VALUES, coordsToSquare, opposite, squareToCoords } from './types';

export interface AttackOptions {
  /** Ignorer les pièces clouées absolument (mode « réaliste »). */
  ignorePinned?: boolean;
  /** Compter les rayons X à travers une pièce alliée de même ligne (batteries). */
  xray?: boolean;
}

const KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_DELTAS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export type BoardArray = (PlacedPiece | null)[][]; // [rank][file], rank 0 = 1re rangée

/** Parse la partie « placement » d'un FEN en tableau 8x8 [rank][file]. */
export function parseFenBoard(fen: string): BoardArray {
  const placement = fen.split(' ')[0];
  const board: BoardArray = Array.from({ length: 8 }, () => Array(8).fill(null));
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error(`FEN invalide : ${fen}`);
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += parseInt(ch, 10);
      } else {
        const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toLowerCase() as PieceSymbol;
        board[rank][file] = { type, color, square: coordsToSquare(file, rank)! };
        file++;
      }
    }
  });
  return board;
}

export function boardPieces(board: BoardArray): PlacedPiece[] {
  const out: PlacedPiece[] = [];
  for (const row of board) for (const p of row) if (p) out.push(p);
  return out;
}

function pieceAt(board: BoardArray, file: number, rank: number): PlacedPiece | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return board[rank][file];
}

/** Cases attaquées (ou défendues) par une pièce donnée, en tenant compte des obstacles. */
export function attackedSquaresOf(board: BoardArray, piece: PlacedPiece, xray = false): Square[] {
  const { file, rank } = squareToCoords(piece.square);
  const out: Square[] = [];
  const push = (f: number, r: number) => {
    const s = coordsToSquare(f, r);
    if (s) out.push(s);
  };
  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      push(file - 1, rank + dir);
      push(file + 1, rank + dir);
      break;
    }
    case 'n':
      for (const [df, dr] of KNIGHT_DELTAS) push(file + df, rank + dr);
      break;
    case 'k':
      for (const [df, dr] of KING_DELTAS) push(file + df, rank + dr);
      break;
    case 'b':
    case 'r':
    case 'q': {
      const dirs = piece.type === 'b' ? BISHOP_DIRS : piece.type === 'r' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
      for (const [df, dr] of dirs) {
        let f = file + df;
        let r = rank + dr;
        let passedAlly = false;
        while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
          push(f, r);
          const blocker = pieceAt(board, f, r);
          if (blocker) {
            // Rayon X : on continue seulement à travers une pièce alliée glissant dans la même direction.
            const sameLine =
              blocker.color === piece.color &&
              (blocker.type === 'q' ||
                (blocker.type === 'b' && df !== 0 && dr !== 0) ||
                (blocker.type === 'r' && (df === 0 || dr === 0)));
            if (xray && sameLine && !passedAlly) {
              passedAlly = true;
            } else {
              break;
            }
          }
          f += df;
          r += dr;
        }
      }
      break;
    }
  }
  return out;
}

/** Trouve le roi d'une couleur. */
export function findKing(board: BoardArray, color: Color): PlacedPiece | null {
  for (const p of boardPieces(board)) if (p.type === 'k' && p.color === color) return p;
  return null;
}

/** Une pièce est clouée absolument si, retirée du plateau, son roi serait attaqué par un glisseur sur la même ligne. */
export function isAbsolutelyPinned(board: BoardArray, piece: PlacedPiece): boolean {
  if (piece.type === 'k') return false;
  const king = findKing(board, piece.color);
  if (!king) return false;
  const k = squareToCoords(king.square);
  const p = squareToCoords(piece.square);
  const df = Math.sign(p.file - k.file);
  const dr = Math.sign(p.rank - k.rank);
  if (df === 0 && dr === 0) return false;
  const diagonal = df !== 0 && dr !== 0;
  if (diagonal && Math.abs(p.file - k.file) !== Math.abs(p.rank - k.rank)) return false;
  // Marche du roi vers la pièce : rien entre les deux.
  let f = k.file + df;
  let r = k.rank + dr;
  while (f !== p.file || r !== p.rank) {
    if (pieceAt(board, f, r)) return false;
    f += df;
    r += dr;
  }
  // Puis derrière la pièce : premier obstacle doit être un glisseur ennemi adéquat.
  f += df;
  r += dr;
  while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
    const b = pieceAt(board, f, r);
    if (b) {
      if (b.color === piece.color) return false;
      if (b.type === 'q') return true;
      if (diagonal && b.type === 'b') return true;
      if (!diagonal && b.type === 'r') return true;
      return false;
    }
    f += df;
    r += dr;
  }
  return false;
}

function emptyMap(): AttackMap {
  const m = {} as AttackMap;
  for (const s of ALL_SQUARES) m[s] = { w: [], b: [] };
  return m;
}

const cache = new Map<string, AttackSummary>();

/** Carte complète d'attaques + dérivés pour un FEN. */
export function computeAttacks(fen: string, opts: AttackOptions = {}): AttackSummary {
  const key = `${fen.split(' ').slice(0, 2).join(' ')}|${opts.ignorePinned ? 1 : 0}|${opts.xray ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const board = parseFenBoard(fen);
  const map = emptyMap();
  const pieces = boardPieces(board);
  for (const piece of pieces) {
    if (opts.ignorePinned && isAbsolutelyPinned(board, piece)) continue;
    for (const sq of attackedSquaresOf(board, piece, opts.xray)) {
      map[sq][piece.color].push({ piece: piece.type, from: piece.square });
    }
  }

  const hanging: HangingPiece[] = [];
  const loose: PlacedPiece[] = [];
  const contested: Square[] = [];
  for (const sq of ALL_SQUARES) {
    const cell = map[sq];
    if (cell.w.length > 0 && cell.b.length > 0) contested.push(sq);
    const piece = board[squareToCoords(sq).rank][squareToCoords(sq).file];
    if (!piece || piece.type === 'k') continue;
    const attackers = cell[opposite(piece.color)];
    const defenders = cell[piece.color];
    if (attackers.length === 0) {
      if (defenders.length === 0) loose.push(piece);
      continue;
    }
    const value = PIECE_VALUES[piece.type];
    const minAttacker = Math.min(...attackers.map((a) => PIECE_VALUES[a.piece]));
    let reason: HangingPiece['reason'] | null = null;
    if (defenders.length === 0) reason = 'undefended';
    else if (minAttacker < value) reason = 'lower-value-attacker';
    else if (attackers.length > defenders.length && minAttacker <= value) reason = 'outnumbered';
    if (reason) hanging.push({ ...piece, reason, attackers, defenders });
  }

  const summary: AttackSummary = { map, hanging, loose, contested };
  if (cache.size > 500) cache.clear();
  cache.set(key, summary);
  return summary;
}

/** Nombre d'attaquants d'une couleur sur une case. */
export function attackCount(map: AttackMap, sq: Square, color: Color): number {
  return map[sq][color].length;
}

/** Pièces d'une couleur attaquées par une pièce donnée (utile pour les fourchettes). */
export function targetsOf(board: BoardArray, piece: PlacedPiece): PlacedPiece[] {
  const out: PlacedPiece[] = [];
  for (const sq of attackedSquaresOf(board, piece)) {
    const { file, rank } = squareToCoords(sq);
    const t = board[rank][file];
    if (t && t.color !== piece.color) out.push(t);
  }
  return out;
}

/** Clouages : glisseur ennemi -> pièce -> pièce plus précieuse (ou roi) alignée derrière. */
export interface Pin {
  by: PlacedPiece;
  pinned: PlacedPiece;
  to: PlacedPiece;
  absolute: boolean;
}

export function findPins(board: BoardArray, victimColor: Color): Pin[] {
  const pins: Pin[] = [];
  for (const slider of boardPieces(board)) {
    if (slider.color === victimColor || !['b', 'r', 'q'].includes(slider.type)) continue;
    const dirs = slider.type === 'b' ? BISHOP_DIRS : slider.type === 'r' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    const { file, rank } = squareToCoords(slider.square);
    for (const [df, dr] of dirs) {
      let f = file + df;
      let r = rank + dr;
      let first: PlacedPiece | null = null;
      while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        const p = pieceAt(board, f, r);
        if (p) {
          if (!first) {
            if (p.color !== victimColor) break;
            first = p;
          } else {
            if (p.color === victimColor && PIECE_VALUES[p.type] > PIECE_VALUES[first.type]) {
              pins.push({ by: slider, pinned: first, to: p, absolute: p.type === 'k' });
            }
            break;
          }
        }
        f += df;
        r += dr;
      }
    }
  }
  return pins;
}

/** Fourchettes : une pièce attaque au moins deux cibles de valeur supérieure ou non défendues. */
export interface Fork {
  by: PlacedPiece;
  targets: PlacedPiece[];
}

export function findForks(board: BoardArray, map: AttackMap, attackerColor: Color): Fork[] {
  const forks: Fork[] = [];
  for (const piece of boardPieces(board)) {
    if (piece.color !== attackerColor) continue;
    const targets = targetsOf(board, piece).filter((t) => {
      if (t.type === 'k') return true;
      const defended = map[t.square][t.color].length > 0;
      return PIECE_VALUES[t.type] > PIECE_VALUES[piece.type] || !defended;
    });
    if (targets.length >= 2) forks.push({ by: piece, targets });
  }
  return forks;
}
