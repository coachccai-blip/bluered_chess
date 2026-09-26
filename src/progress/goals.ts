// Objectif de partie tiré du plan d'entraînement, vérifié automatiquement sur l'analyse.
import type { Analysis, Game, GameGoal } from '../data/models';
import type { IndicatorKey } from './profile';

const GOALS: Record<IndicatorKey, { label: string; check: (mine: Analysis['moves']) => { achieved: boolean; detail: string } }> = {
  hanging: {
    label: 'Ne laisse aucune pièce en prise',
    check: (mine) => {
      const n = mine.filter((m) => m.motifs.some((h) => h.motif === 'hanging_piece' || h.motif === 'moved_into_attack')).length;
      return { achieved: n === 0, detail: n === 0 ? 'Aucune pièce laissée en prise.' : `${n} coup${n > 1 ? 's' : ''} avec une pièce en prise.` };
    },
  },
  tactics: {
    label: 'Ne rate aucune capture gratuite ni fourchette',
    check: (mine) => {
      const n = mine.filter((m) => m.motifs.some((h) => ['missed_free_capture', 'fork_missed', 'mate_missed'].includes(h.motif))).length;
      return { achieved: n === 0, detail: n === 0 ? 'Aucune tactique ratée.' : `${n} tactique${n > 1 ? 's' : ''} ratée${n > 1 ? 's' : ''}.` };
    },
  },
  kingSafety: {
    label: 'Roque avant le 12e coup',
    check: (mine) => {
      const castled = mine.some((m) => m.san.startsWith('O-O') && Math.ceil(m.ply / 2) <= 12);
      const short = mine.length < 20;
      return { achieved: castled || short, detail: castled ? 'Roque effectué à temps.' : short ? 'Partie trop courte pour juger.' : 'Pas de roque avant le 12e coup.' };
    },
  },
  endgame: {
    label: 'Aucune gaffe en finale',
    check: (mine) => {
      const n = mine.filter((m) => m.phase === 'endgame' && (m.category === 'blunder' || m.category === 'mistake')).length;
      return { achieved: n === 0, detail: n === 0 ? 'Finale propre.' : `${n} erreur${n > 1 ? 's' : ''} en finale.` };
    },
  },
  opening: {
    label: 'Aucune imprécision dans les 10 premiers coups',
    check: (mine) => {
      const n = mine.filter((m) => m.ply <= 20 && m.category !== 'excellent' && m.category !== 'good').length;
      return { achieved: n === 0, detail: n === 0 ? 'Ouverture précise.' : `${n} imprécision${n > 1 ? 's' : ''} en ouverture.` };
    },
  },
  redSquares: {
    label: 'Ne joue jamais dans une case rouge non défendue',
    check: (mine) => {
      const n = mine.filter((m) => m.motifs.some((h) => h.motif === 'moved_into_attack')).length;
      return { achieved: n === 0, detail: n === 0 ? 'Aucun coup dans une case adverse.' : `${n} coup${n > 1 ? 's' : ''} dans une case adverse.` };
    },
  },
  advantage: {
    label: "Garde l'avantage jusqu'au bout",
    check: (mine) => {
      const sign = mine[0]?.color === 'w' ? 1 : -1;
      let hadAdvantage = false;
      let lost = false;
      for (const m of mine) {
        if (m.evalBefore * sign >= 300) hadAdvantage = true;
        if (hadAdvantage && m.evalAfter * sign < 100) lost = true;
      }
      return { achieved: !lost, detail: !hadAdvantage ? "Pas d'avantage net à gérer." : lost ? 'Avantage gâché en cours de partie.' : 'Avantage conservé.' };
    },
  },
};

export function goalFor(target: string | undefined): GameGoal | undefined {
  const key = (target ?? 'hanging') as IndicatorKey;
  const g = GOALS[key] ?? GOALS.hanging;
  return { key, label: g.label };
}

export function evaluateGoal(goal: GameGoal, game: Game, analysis: Analysis): GameGoal {
  const color = game.playerColor === 'blue' ? 'w' : 'b';
  const mine = analysis.moves.filter((m) => m.color === color);
  const g = GOALS[goal.key as IndicatorKey] ?? GOALS.hanging;
  const r = g.check(mine);
  return { ...goal, achieved: r.achieved, detail: r.detail };
}

/** Résumé des temps de réflexion : erreurs jouées trop vite (< 3 s). */
export function fastMistakes(analysis: Analysis, thinkTimes: number[] | undefined, color: 'w' | 'b', thresholdMs = 3000): { fast: number; total: number } {
  if (!thinkTimes) return { fast: 0, total: 0 };
  let fast = 0;
  let total = 0;
  for (const m of analysis.moves) {
    if (m.color !== color) continue;
    if (!['inaccuracy', 'mistake', 'blunder', 'mate_missed'].includes(m.category)) continue;
    total++;
    const t = thinkTimes[m.ply - 1];
    if (t !== undefined && t < thresholdMs) fast++;
  }
  return { fast, total };
}
