import type { Game, Analysis } from '../data/models';
import { resultScore } from './profile';

export interface PerformanceEstimate {
  /** Estimation finale (mélange précision + résultat). */
  elo: number;
  /** Estimation tirée de la précision seule. */
  fromAccuracy: number;
  /** Estimation tirée du résultat contre l'adversaire (null si l'adversaire n'a pas d'Elo connu). */
  fromResult: number | null;
  opponentElo: number | null;
  accuracy: number;
  score: 0 | 0.5 | 1;
}

/**
 * Elo correspondant à une précision de partie : environ 60 % → 800, 70 % → 1200, 80 % → 1600, 90 % → 2000.
 * Barème linéaire inspiré des moyennes observées par niveau sur chess.com et Lichess.
 */
export function ratingFromAccuracy(accuracy: number): number {
  const acc = Math.max(0, Math.min(100, accuracy));
  return Math.round(Math.max(400, Math.min(2600, 400 + (acc - 50) * 40)));
}

/** Performance FIDE simplifiée sur une partie : adversaire + 400 (victoire), = (nulle), − 400 (défaite). */
export function ratingFromResult(opponentElo: number, score: 0 | 0.5 | 1): number {
  return Math.round(opponentElo + (score === 1 ? 400 : score === 0 ? -400 : 0));
}

/**
 * Elo de performance d'une partie : 60 % précision (stable, mesurée coup par coup) + 40 % résultat contre l'adversaire
 * (une seule partie est très bruitée). Sans adversaire noté (partie à deux), la précision seule est utilisée.
 */
export function performanceElo(opts: { accuracy: number; score: 0 | 0.5 | 1; opponentElo: number | null }): PerformanceEstimate {
  const fromAccuracy = ratingFromAccuracy(opts.accuracy);
  const fromResult = opts.opponentElo ? ratingFromResult(opts.opponentElo, opts.score) : null;
  const elo = fromResult === null ? fromAccuracy : Math.round(0.6 * fromAccuracy + 0.4 * fromResult);
  return { elo, fromAccuracy, fromResult, opponentElo: opts.opponentElo, accuracy: opts.accuracy, score: opts.score };
}

/** Elo de performance d'une partie enregistrée et analysée. */
export function performanceForGame(game: Pick<Game, 'result' | 'playerColor' | 'botElo'>, analysis: Pick<Analysis, 'accuracy'>): PerformanceEstimate {
  // Les parties à deux et les parties importées sont enregistrées avec botElo = 0.
  const opponentElo = game.botElo > 0 ? game.botElo : null;
  return performanceElo({ accuracy: analysis.accuracy, score: resultScore(game), opponentElo });
}

/** Phrase courte pour le débrief. */
export function performanceText(p: PerformanceEstimate): string {
  const parts = [`ta précision de ${Math.round(p.accuracy)} % vaut environ ${p.fromAccuracy}`];
  if (p.fromResult !== null && p.opponentElo) parts.push(`${p.score === 1 ? 'la victoire' : p.score === 0 ? 'la défaite' : 'la nulle'} contre un bot ${p.opponentElo} vaut environ ${p.fromResult}`);
  return `Elo de performance estimé : ${p.elo} (${parts.join(' ; ')}).`;
}
