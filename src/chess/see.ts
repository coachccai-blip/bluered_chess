// Évaluation statique d'échange (SEE) simplifiée : série de captures sur une case.
import type { AttackMap, Color, PieceSymbol, Square } from './types';
import { PIECE_VALUES, opposite } from './types';

/**
 * Gain matériel attendu (en centipions) pour `side` qui capture en premier sur `square`
 * une pièce de valeur `victimValue`. Les attaquants sont pris dans l'ordre croissant de valeur.
 * Approximation : ignore les rayons X découverts pendant la séquence.
 */
export function staticExchange(map: AttackMap, square: Square, side: Color, victimType: PieceSymbol): number {
  const order = (arr: { piece: PieceSymbol }[]) =>
    [...arr].map((a) => PIECE_VALUES[a.piece]).sort((a, b) => a - b);
  const att = { w: order(map[square].w), b: order(map[square].b) };
  const gains: number[] = [];
  let onSquare = PIECE_VALUES[victimType];
  let stm = side;
  let depth = 0;
  while (att[stm].length > 0) {
    const attackerValue = att[stm].shift()!;
    gains[depth] = onSquare - (depth > 0 ? gains[depth - 1] : 0);
    // Le roi ne peut pas capturer sur une case encore attaquée.
    if (attackerValue === PIECE_VALUES.k && att[opposite(stm)].length > 0) break;
    onSquare = attackerValue;
    stm = opposite(stm);
    depth++;
  }
  if (depth === 0) return 0;
  // Remontée minimax : chaque camp peut s'arrêter.
  for (let i = depth - 1; i > 0; i--) {
    gains[i - 1] = -Math.max(-gains[i - 1], gains[i]);
  }
  return gains[0];
}
