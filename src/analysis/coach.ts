// Coach par règles : sélectionne les moments clés et instancie les phrases (section 7, étape 4).
import type { MoveCategory } from './classify';
import { CATEGORY_LABEL } from './classify';
import type { Motif, MotifHit } from './motifs';
import { GENERIC, PHRASES, fill, severityOf } from './phrases';
import type { Phase } from '../chess/game';

export interface MoveEval {
  ply: number;
  san: string;
  lan: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  /** Évaluation (cp, point de vue Blancs) avant et après le coup ; ±10000 pour les mats. */
  evalBefore: number;
  evalAfter: number;
  bestMove: string | null; // SAN
  bestMoveLan: string | null;
  /** Suite prévue par le moteur après le meilleur coup (SAN). */
  bestLine?: string[];
  /** Meilleure réplique adverse après le coup joué (SAN / LAN). */
  threat?: string | null;
  threatLan?: string | null;
  /** Pourquoi le coup « Mieux » est meilleur (texte français). */
  explanation?: string | null;
  winProbLoss: number;
  category: MoveCategory;
  motifs: MotifHit[];
  phase: Phase;
}

export interface KeyMoment {
  ply: number;
  san: string;
  category: MoveCategory;
  motif: Motif | null;
  adviceText: string;
  recommendedMove: string | null;
  fenBefore: string;
  fenAfter: string;
  playedLan: string;
  bestMoveLan: string | null;
  color: 'w' | 'b';
}

export function formatEval(cp: number): string {
  if (cp >= 9000) return `M${10000 - cp}`;
  if (cp <= -9000) return `-M${10000 + cp}`;
  const v = cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

/** Choix déterministe d'une phrase pour éviter les répétitions : index par ply. */
function pickPhrase(list: string[], ply: number): string {
  return list[ply % list.length];
}

export function adviceFor(m: MoveEval, playerColor: 'w' | 'b'): { text: string; motif: Motif | null } {
  const sev = severityOf(m.category);
  const sign = playerColor === 'w' ? 1 : -1;
  const data: Record<string, string | number> = {
    played: m.san,
    best: m.bestMove ?? '?',
    evalBefore: formatEval(m.evalBefore * sign),
    evalAfter: formatEval(m.evalAfter * sign),
  };
  const priority: Motif[] = [
    'mate_missed',
    'mate_allowed',
    'moved_into_attack',
    'hanging_piece',
    'missed_free_capture',
    'fork_suffered',
    'fork_missed',
    'losing_exchange',
    'pin_suffered',
    'king_in_center',
    'tempo_loss',
    'turning_point',
  ];
  const sorted = [...m.motifs].sort((a, b) => priority.indexOf(a.motif) - priority.indexOf(b.motif));
  const hit = sorted[0];
  if (hit) {
    return { text: fill(pickPhrase(PHRASES[hit.motif][sev], m.ply), { ...data, ...hit.data }), motif: hit.motif };
  }
  return { text: fill(pickPhrase(GENERIC[sev], m.ply), data), motif: null };
}

/** Sélectionne 3 à 5 moments clés : gaffes/erreurs du joueur + tournant de la partie. */
export function selectKeyMoments(moves: MoveEval[], playerColor: 'w' | 'b', max = 5): KeyMoment[] {
  const mine = moves.filter((m) => m.color === playerColor);
  const bad = mine
    .filter((m) => ['blunder', 'mistake', 'mate_missed'].includes(m.category))
    .sort((a, b) => b.winProbLoss - a.winProbLoss);
  const chosen: MoveEval[] = bad.slice(0, max);

  // Tournant : plus grand basculement d'évaluation (tous camps confondus, mais côté joueur de préférence).
  let turning: MoveEval | null = null;
  let biggest = 0;
  for (const m of mine) {
    const swing = Math.abs(m.evalAfter - m.evalBefore);
    if (swing > biggest && m.winProbLoss > 5) {
      biggest = swing;
      turning = m;
    }
  }
  if (turning && !chosen.includes(turning)) {
    if (chosen.length >= max) chosen.pop();
    chosen.push(turning);
  }
  // Compléter avec des imprécisions si moins de 3.
  if (chosen.length < 3) {
    for (const m of mine.filter((x) => x.category === 'inaccuracy').sort((a, b) => b.winProbLoss - a.winProbLoss)) {
      if (chosen.length >= 3) break;
      if (!chosen.includes(m)) chosen.push(m);
    }
  }
  chosen.sort((a, b) => a.ply - b.ply);
  return chosen.map((m) => {
    const withTurning = m === turning && m.motifs.length === 0 ? { ...m, motifs: [{ motif: 'turning_point' as Motif, data: {} }] } : m;
    const { text, motif } = adviceFor(withTurning, playerColor);
    return {
      ply: m.ply,
      san: m.san,
      category: m.category,
      motif,
      adviceText: text,
      recommendedMove: m.bestMove,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
      playedLan: m.lan,
      bestMoveLan: m.bestMoveLan,
      color: m.color,
    };
  });
}

export interface GameSummary {
  accuracy: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  weakestPhase: Phase | null;
  phaseAccuracy: Record<Phase, number | null>;
  strength: string;
  weakness: string;
  categoryCounts: Record<MoveCategory, number>;
}

export function summarize(moves: MoveEval[], playerColor: 'w' | 'b', accuracyOf: (loss: number) => number): GameSummary {
  const mine = moves.filter((m) => m.color === playerColor);
  const counts: Record<MoveCategory, number> = { excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, mate_missed: 0 };
  for (const m of mine) counts[m.category]++;
  const acc = (arr: MoveEval[]) => (arr.length ? arr.reduce((a, m) => a + accuracyOf(m.winProbLoss), 0) / arr.length : null);
  const phases: Phase[] = ['opening', 'middlegame', 'endgame'];
  const phaseAccuracy = { opening: null, middlegame: null, endgame: null } as Record<Phase, number | null>;
  for (const p of phases) phaseAccuracy[p] = acc(mine.filter((m) => m.phase === p));
  let weakestPhase: Phase | null = null;
  let low = Infinity;
  for (const p of phases) {
    const v = phaseAccuracy[p];
    if (v !== null && v < low && mine.filter((m) => m.phase === p).length >= 4) {
      low = v;
      weakestPhase = p;
    }
  }
  const motifCounts = new Map<Motif, number>();
  for (const m of mine) for (const h of m.motifs) motifCounts.set(h.motif, (motifCounts.get(h.motif) ?? 0) + 1);
  const topMotif = [...motifCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const excellentRate = mine.length ? counts.excellent / mine.length : 0;
  const strength =
    excellentRate > 0.6
      ? 'Beaucoup de coups précis : ton calcul est fiable.'
      : counts.blunder === 0
        ? 'Aucune gaffe grossière : bonne vigilance sur les pièces en prise.'
        : phaseAccuracy.opening !== null && phaseAccuracy.opening > 85
          ? 'Ouverture solide.'
          : 'Tu es resté combatif jusqu\'au bout.';
  const weakness = topMotif
    ? `Motif le plus fréquent : ${labelMotif(topMotif[0])} (${topMotif[1]}×).`
    : weakestPhase
      ? `Phase la plus faible : ${PHASE_LABEL[weakestPhase]}.`
      : 'Peu d\'erreurs marquantes dans cette partie.';
  return {
    accuracy: acc(mine) ?? 0,
    blunders: counts.blunder + counts.mate_missed,
    mistakes: counts.mistake,
    inaccuracies: counts.inaccuracy,
    weakestPhase,
    phaseAccuracy,
    strength,
    weakness,
    categoryCounts: counts,
  };
}

export const PHASE_LABEL: Record<Phase, string> = { opening: 'ouverture', middlegame: 'milieu de partie', endgame: 'finale' };

function labelMotif(m: Motif): string {
  // import tardif pour éviter la dépendance circulaire
  const labels: Record<Motif, string> = {
    hanging_piece: 'pièce en prise',
    missed_free_capture: 'capture gratuite ratée',
    fork_suffered: 'fourchette subie',
    fork_missed: 'fourchette ratée',
    pin_suffered: 'clouage subi',
    king_in_center: 'roi au centre',
    moved_into_attack: 'coup dans une case adverse',
    losing_exchange: 'échange perdant',
    mate_missed: 'mat raté',
    mate_allowed: 'mat encaissé',
    tempo_loss: 'temps perdu',
    turning_point: 'tournant',
  };
  return labels[m];
}

export { CATEGORY_LABEL };
