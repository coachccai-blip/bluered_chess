// Profil de faiblesses agrégé sur les 20 dernières parties analysées (section 8).
import type { Analysis, Game } from '../data/models';

export type IndicatorKey =
  | 'hanging'
  | 'tactics'
  | 'kingSafety'
  | 'endgame'
  | 'opening'
  | 'redSquares'
  | 'advantage';

export interface IndicatorDef {
  key: IndicatorKey;
  label: string;
  unit: string;
  /** Seuil d'alerte. `higherIsWorse` indique le sens. */
  threshold: number;
  higherIsWorse: boolean;
  description: string;
  lichessTheme?: string;
}

export const INDICATORS: IndicatorDef[] = [
  { key: 'hanging', label: 'Pièces pendantes', unit: '/100 coups', threshold: 3, higherIsWorse: true, description: 'Gaffes « pièce en prise » pour 100 coups joués.', lichessTheme: 'hangingPiece' },
  { key: 'tactics', label: 'Tactiques ratées', unit: '/100 coups', threshold: 4, higherIsWorse: true, description: 'Fourchettes, mats et captures gratuites ratés pour 100 coups.', lichessTheme: 'fork' },
  { key: 'kingSafety', label: 'Sécurité du roi', unit: '% parties', threshold: 20, higherIsWorse: true, description: 'Roi au centre après le coup 15, ou mat subi en moins de 25 coups.', lichessTheme: 'kingsideAttack' },
  { key: 'endgame', label: 'Finales', unit: '% précision', threshold: 75, higherIsWorse: false, description: 'Précision moyenne après la disparition des dames.', lichessTheme: 'endgame' },
  { key: 'opening', label: 'Ouverture', unit: '% précision', threshold: 85, higherIsWorse: false, description: 'Précision sur les 10 premiers coups.', lichessTheme: 'opening' },
  { key: 'redSquares', label: 'Cases rouges', unit: '/100 coups', threshold: 5, higherIsWorse: true, description: 'Coups vers une case contrôlée par l\'adversaire sans défense.', lichessTheme: 'hangingPiece' },
  { key: 'advantage', label: 'Gestion de l\'avantage', unit: '% parties', threshold: 25, higherIsWorse: true, description: 'Parties perdues ou nulles avec +3 ou plus.', lichessTheme: 'advantage' },
];

export function indicatorDef(key: string): IndicatorDef {
  return INDICATORS.find((i) => i.key === key) ?? INDICATORS[0];
}

/** Écart normalisé au seuil : > 0 = alerte, plus grand = plus faible. */
export function deviation(def: IndicatorDef, value: number): number {
  if (def.higherIsWorse) return (value - def.threshold) / Math.max(1, def.threshold);
  return (def.threshold - value) / Math.max(1, def.threshold);
}

export function isAlert(def: IndicatorDef, value: number | undefined): boolean {
  if (value === undefined) return false;
  return def.higherIsWorse ? value > def.threshold : value < def.threshold;
}

/** Score radar 0..100 (100 = parfait). */
export function radarScore(def: IndicatorDef, value: number | undefined): number {
  if (value === undefined) return 50;
  if (def.higherIsWorse) return Math.max(0, Math.min(100, 100 - (value / (def.threshold * 2)) * 100));
  return Math.max(0, Math.min(100, value));
}

export function computeIndicators(pairs: { game: Game; analysis: Analysis }[]): Record<IndicatorKey, number> {
  const recent = pairs.slice().sort((a, b) => b.game.createdAt - a.game.createdAt).slice(0, 20);
  let myMoves = 0;
  let hangingCount = 0;
  let tacticsCount = 0;
  let redSquares = 0;
  let kingSafetyGames = 0;
  let advantageGames = 0;
  let advantageBad = 0;
  const endgameAcc: number[] = [];
  const openingAcc: number[] = [];

  for (const { game, analysis } of recent) {
    const color = game.playerColor === 'blue' ? 'w' : 'b';
    const mine = analysis.moves.filter((m) => m.color === color);
    myMoves += mine.length;
    let kingIssue = false;
    let maxAdvantage = -Infinity;
    const sign = color === 'w' ? 1 : -1;
    for (const m of mine) {
      for (const h of m.motifs) {
        if (h.motif === 'hanging_piece' && ['blunder', 'mistake'].includes(m.category)) hangingCount++;
        if (['fork_missed', 'mate_missed', 'missed_free_capture'].includes(h.motif)) tacticsCount++;
        if (h.motif === 'moved_into_attack' && Number(h.data.defended ?? 0) === 0) redSquares++;
        if (h.motif === 'king_in_center') kingIssue = true;
      }
      maxAdvantage = Math.max(maxAdvantage, m.evalBefore * sign);
      if (m.phase === 'endgame') endgameAcc.push(accuracyFromLoss(m.winProbLoss));
      if (m.ply <= 20) openingAcc.push(accuracyFromLoss(m.winProbLoss));
    }
    const lostFast = game.result !== '*' && game.result !== '1/2-1/2' && resultScore(game) === 0 && game.endReason === 'checkmate' && game.sans.length < 50;
    if (kingIssue || lostFast) kingSafetyGames++;
    if (maxAdvantage >= 300) {
      advantageGames++;
      if (resultScore(game) !== 1) advantageBad++;
    }
  }
  const per100 = (n: number) => (myMoves ? (n / myMoves) * 100 : 0);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
  const out: Record<IndicatorKey, number> = {
    hanging: round1(per100(hangingCount)),
    tactics: round1(per100(tacticsCount)),
    kingSafety: recent.length ? round1((kingSafetyGames / recent.length) * 100) : 0,
    endgame: round1(avg(endgameAcc)),
    opening: round1(avg(openingAcc)),
    redSquares: round1(per100(redSquares)),
    advantage: advantageGames ? round1((advantageBad / advantageGames) * 100) : 0,
  };
  for (const k of Object.keys(out) as IndicatorKey[]) if (Number.isNaN(out[k])) delete (out as Partial<Record<IndicatorKey, number>>)[k];
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function accuracyFromLoss(loss: number): number {
  const acc = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

/** Score du joueur : 1 / 0,5 / 0. */
export function resultScore(game: Pick<Game, 'result' | 'playerColor'>): 0 | 0.5 | 1 {
  if (game.result === '1/2-1/2') return 0.5;
  if (game.result === '*') return 0.5;
  const won = (game.result === '1-0' && game.playerColor === 'blue') || (game.result === '0-1' && game.playerColor === 'red');
  return won ? 1 : 0;
}
