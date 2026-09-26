export type MoveCategory = 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'mate_missed';

export const CATEGORY_LABEL: Record<MoveCategory, string> = {
  excellent: 'Excellent',
  good: 'Bon',
  inaccuracy: 'Imprécision',
  mistake: 'Erreur',
  blunder: 'Gaffe',
  mate_missed: 'Mat raté',
};

export const CATEGORY_COLOR: Record<MoveCategory, string> = {
  excellent: '#2ecc71',
  good: '#a3e4b3',
  inaccuracy: '#f1c40f',
  mistake: '#e67e22',
  blunder: '#e74c3c',
  mate_missed: '#9b59b6',
};

export interface ClassifyInput {
  /** Perte de probabilité de gain (points de %) du point de vue du joueur. */
  winProbLoss: number;
  /** Le coup joué est-il le coup du moteur ? */
  isBest: boolean;
  /** Seul coup légal ? */
  isOnlyMove: boolean;
  /** Mat forcé disponible avant le coup (nombre de coups) ? */
  mateAvailableBefore: number | null;
  /** Mat forcé toujours disponible après le coup (pour le même camp) ? */
  mateStillAvailableAfter: boolean;
}

export function classifyMove(i: ClassifyInput): MoveCategory {
  if (i.mateAvailableBefore !== null && i.mateAvailableBefore > 0 && !i.mateStillAvailableAfter) return 'mate_missed';
  const loss = Math.max(0, i.winProbLoss);
  if (loss > 20) return 'blunder';
  if (loss > 10) return 'mistake';
  if (loss > 5) return 'inaccuracy';
  if (loss > 2) return 'good';
  return i.isBest || i.isOnlyMove || loss <= 2 ? 'excellent' : 'good';
}
