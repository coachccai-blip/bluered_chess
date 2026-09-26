// Répétition espacée des erreurs (système de boîtes de Leitner) : 1, 3, 7, 14 puis 30 jours.
import type { Analysis, Drill, Game } from '../data/models';
import { newId } from '../data/models';

export const DRILL_INTERVALS_DAYS = [1, 3, 7, 14, 30];
const DAY = 24 * 3600 * 1000;

/** Prochaine échéance et boîte après une réponse. */
export function nextReview(box: number, ok: boolean, now = Date.now()): { box: number; due: number } {
  if (!ok) return { box: 0, due: now + DAY };
  const nb = Math.min(box + 1, DRILL_INTERVALS_DAYS.length);
  return { box: nb, due: now + DRILL_INTERVALS_DAYS[nb - 1] * DAY };
}

/** Fiches à créer à partir d'une analyse : gaffes, erreurs et mats ratés du joueur, avec le meilleur coup connu. */
export function drillsFromAnalysis(game: Game, analysis: Analysis, now = Date.now()): Drill[] {
  const color = game.playerColor === 'blue' ? 'w' : 'b';
  return analysis.moves
    .filter((m) => m.color === color && ['blunder', 'mistake', 'mate_missed'].includes(m.category) && m.bestMoveLan && m.bestMove)
    .map((m) => ({
      id: newId(),
      gameId: game.id,
      ply: m.ply,
      fen: m.fenBefore,
      bestMove: m.bestMove!,
      bestMoveLan: m.bestMoveLan!,
      playedSan: m.san,
      motif: m.motifs[0]?.motif ?? null,
      category: m.category,
      box: 0,
      due: now,
      attempts: 0,
      successes: 0,
      createdAt: now,
    }));
}

export function dueDrills(drills: Drill[], now = Date.now()): Drill[] {
  return drills.filter((d) => d.due <= now && d.box < DRILL_INTERVALS_DAYS.length).sort((a, b) => a.due - b.due);
}

/** Une fiche est « acquise » après la dernière boîte. */
export function isMastered(d: Drill): boolean {
  return d.box >= DRILL_INTERVALS_DAYS.length;
}
