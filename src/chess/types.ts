// Types purs, sans dépendance React. Les couleurs internes restent 'w' / 'b' (chess.js).
export type Color = 'w' | 'b';
export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square =
  | 'a8' | 'b8' | 'c8' | 'd8' | 'e8' | 'f8' | 'g8' | 'h8'
  | 'a7' | 'b7' | 'c7' | 'd7' | 'e7' | 'f7' | 'g7' | 'h7'
  | 'a6' | 'b6' | 'c6' | 'd6' | 'e6' | 'f6' | 'g6' | 'h6'
  | 'a5' | 'b5' | 'c5' | 'd5' | 'e5' | 'f5' | 'g5' | 'h5'
  | 'a4' | 'b4' | 'c4' | 'd4' | 'e4' | 'f4' | 'g4' | 'h4'
  | 'a3' | 'b3' | 'c3' | 'd3' | 'e3' | 'f3' | 'g3' | 'h3'
  | 'a2' | 'b2' | 'c2' | 'd2' | 'e2' | 'f2' | 'g2' | 'h2'
  | 'a1' | 'b1' | 'c1' | 'd1' | 'e1' | 'f1' | 'g1' | 'h1';

export interface Piece {
  type: PieceSymbol;
  color: Color;
}

export interface PlacedPiece extends Piece {
  square: Square;
}

export interface Attacker {
  piece: PieceSymbol;
  from: Square;
}

/** Pour chaque case : les attaquants blancs (Bleu) et noirs (Rouge). */
export type AttackMap = Record<Square, { w: Attacker[]; b: Attacker[] }>;

export interface HangingPiece extends PlacedPiece {
  /** Raison : non défendue, attaquée par une pièce de moindre valeur, ou plus d'attaquants que de défenseurs. */
  reason: 'undefended' | 'lower-value-attacker' | 'outnumbered';
  attackers: Attacker[];
  defenders: Attacker[];
}

export interface AttackSummary {
  map: AttackMap;
  /** Pièces en prise (attaquées et pas assez défendues). */
  hanging: HangingPiece[];
  /** Pièces non défendues mais pas encore attaquées (« pendantes »). */
  loose: PlacedPiece[];
  /** Cases contrôlées par les deux camps. */
  contested: Square[];
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

export const ALL_SQUARES: Square[] = (() => {
  const out: Square[] = [];
  for (const r of [...RANKS].reverse()) for (const f of FILES) out.push(`${f}${r}` as Square);
  return out;
})();

export function squareToCoords(sq: Square): { file: number; rank: number } {
  return { file: sq.charCodeAt(0) - 97, rank: parseInt(sq[1], 10) - 1 };
}

export function coordsToSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${RANKS[rank]}` as Square;
}

export function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}
