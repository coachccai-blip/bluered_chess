// Filet anti-gaffe : détection sans moteur des coups qui laissent une pièce en prise ou permettent un mat en 1.
import { allowsMateInOne } from '../chess/game';
import { PIECE_VALUES, type PieceSymbol } from '../chess/types';
import { moveFeatures } from './explain';
import { PIECE_NAME_FR } from './motifs';

export type RiskLevel = 'off' | 'blunders' | 'all';

export interface MoveRisk {
  /** Gravité : mat en 1 permis, pièce lourde ou mineure en prise, pion en prise. */
  severity: 'mate' | 'piece' | 'pawn';
  reasons: string[];
}

/**
 * Évalue le risque d'un coup avant de le jouer. `level` « blunders » ignore les pions en prise ;
 * « all » signale aussi les pions. Renvoie null si rien d'inquiétant.
 */
export function assessMoveRisk(fen: string, lan: string, level: RiskLevel = 'blunders'): MoveRisk | null {
  if (level === 'off') return null;
  const f = moveFeatures(fen, lan);
  if (!f) return null;
  if (f.mate) return null;
  const reasons: string[] = [];
  let severity: MoveRisk['severity'] | null = null;
  if (allowsMateInOne(fen, lan)) {
    severity = 'mate';
    reasons.push("après ce coup, l'adversaire peut faire échec et mat en un coup");
  }
  // Pièces laissées en prise (hors la pièce jouée si elle vient de capturer autant ou plus).
  const hanging = f.leavesHanging.filter((h) => h.square !== f.to || !f.captured || PIECE_VALUES[h.piece] > PIECE_VALUES[f.captured]);
  const worst = hanging.slice().sort((a, b) => PIECE_VALUES[b.piece] - PIECE_VALUES[a.piece])[0];
  if (worst) {
    const isPawn = worst.piece === 'p';
    if (!isPawn || level === 'all') {
      const fem = worst.piece === 'q' || worst.piece === 'r';
      reasons.push(`${fem ? 'ta' : 'ton'} ${PIECE_NAME_FR[worst.piece as PieceSymbol]} en ${worst.square} peut être pris${fem ? 'e' : ''} gratuitement`);
      if (!severity) severity = isPawn ? 'pawn' : 'piece';
    }
  }
  if (f.captured && f.captureGain < -150 && !reasons.length) {
    reasons.push(`cette capture perd du matériel : après les reprises, tu perds environ ${Math.round(-f.captureGain / 100)} point${-f.captureGain >= 200 ? 's' : ''}`);
    severity = severity ?? 'piece';
  }
  if (!severity || reasons.length === 0) return null;
  return { severity, reasons };
}
