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

/**
 * Précision d'une partie (0..100) comme Lichess (et la méthode CAPS de chess.com) : moyenne des précisions
 * des coups du joueur pondérée par la volatilité de la position (écart-type des probabilités de gain sur une
 * fenêtre glissante), combinée à la moyenne simple par une moyenne harmonique. Les coups joués dans les
 * moments tendus comptent plus que ceux joués dans une position déjà décidée.
 * @param winPercents probabilité de gain (point de vue Blancs) de chaque position, de la position initiale à la dernière.
 * @param accuracies précision de chaque coup (index i = coup menant de la position i à i+1).
 * @param mine index des coups du joueur.
 */
export function gameAccuracy(winPercents: number[], accuracies: number[], mine: number[]): number {
  if (!mine.length) return 0;
  const n = winPercents.length;
  const windowSize = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const windows: number[][] = [];
  const head = winPercents.slice(0, windowSize);
  for (let i = 0; i < Math.min(windowSize, n) - 2; i++) windows.push(head);
  for (let i = 0; i + windowSize <= n; i++) windows.push(winPercents.slice(i, i + windowSize));
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))));
  let wsum = 0;
  let wacc = 0;
  let sum = 0;
  for (const i of mine) {
    const w = weights[i] ?? 0.5;
    wsum += w;
    wacc += accuracies[i] * w;
    sum += accuracies[i];
  }
  const weighted = wsum ? wacc / wsum : 0;
  const mean = sum / mine.length;
  if (weighted + mean === 0) return 0;
  return Math.max(0, Math.min(100, (2 * weighted * mean) / (weighted + mean)));
}

function stdDev(xs: number[]): number {
  if (!xs.length) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / xs.length);
}
