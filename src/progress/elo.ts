// Elo « maison » : formule classique, K = 32.
export function expectedScore(player: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - player) / 400));
}

export function updateElo(player: number, opponent: number, score: 0 | 0.5 | 1, k = 32): number {
  return Math.round(player + k * (score - expectedScore(player, opponent)));
}

/** Bot recommandé : +50 après deux victoires, −50 après deux défaites, sinon le plus proche de l'Elo estimé. */
export function recommendBot(current: number, streak: { wins: number; losses: number }, estimatedElo: number): number {
  const clamp = (v: number) => Math.min(1800, Math.max(800, Math.round(v / 50) * 50));
  if (streak.wins >= 2) return clamp(current + 50);
  if (streak.losses >= 2) return clamp(current - 50);
  return clamp(current || estimatedElo);
}

export function updateStreak(streak: { wins: number; losses: number }, score: 0 | 0.5 | 1): { wins: number; losses: number } {
  if (score === 1) return { wins: streak.wins + 1, losses: 0 };
  if (score === 0) return { wins: 0, losses: streak.losses + 1 };
  return { wins: 0, losses: 0 };
}

/** Estimation d'Elo par la formule des performances (utilisée par le script de calibration). */
export function performanceRating(opponentAverage: number, scorePercent: number): number {
  const p = Math.min(0.99, Math.max(0.01, scorePercent));
  return Math.round(opponentAverage + 400 * Math.log10(p / (1 - p)));
}
