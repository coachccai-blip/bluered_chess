// Conversion centipions -> probabilité de gain (logistique, coefficient Lichess).
const K = -0.00368208;

/** Probabilité de gain (0..100) pour le camp dont le score est donné. */
export function winProbability(cp: number): number {
  const clamped = Math.max(-2000, Math.min(2000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(K * clamped)) - 1);
}

/** Précision d'un coup (0..100) à partir de la perte de probabilité de gain, comme Lichess. */
export function moveAccuracy(winProbLoss: number): number {
  const loss = Math.max(0, winProbLoss);
  const acc = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}
