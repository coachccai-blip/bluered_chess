// Indice progressif pendant la partie : pièce à jouer, coup, puis explication complète de « pourquoi c'est le meilleur ».
import { Chess } from 'chess.js';
import type { EngineLine } from '../engine/engineClient';
import { lineScore } from '../engine/engineClient';
import { pvToSan } from '../chess/game';
import { PIECE_VALUES, type Square } from '../chess/types';
import { describePurpose, evalWords, moveFeatures, spoken } from './explain';
import { PIECE_NAME_FR } from './motifs';

export interface HintAlternative {
  san: string;
  /** Écart en centipions par rapport au meilleur coup (positif = moins bon). */
  gap: number;
  reason: string;
}

export interface Hint {
  bestSan: string;
  bestLan: string;
  /** Case de la pièce à jouer (niveau 1). */
  pieceSquare: Square;
  pieceName: string;
  /** Menace adverse parée, si l'adversaire avait le trait (ou null). */
  threat: string | null;
  alternatives: HintAlternative[];
  line: string[];
  /** Explication complète (niveau 3), lisible à voix haute. */
  explanation: string;
  /** Bilan après le meilleur coup, du point de vue du joueur. */
  outcome: string;
}

/** FEN où l'adversaire aurait le trait (coup nul), ou null si impossible (échec en cours). */
export function nullMoveFen(fen: string): string | null {
  const c = new Chess(fen);
  if (c.inCheck()) return null;
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    new Chess(parts.join(' '));
    return parts.join(' ');
  } catch {
    return null;
  }
}

function gapWords(gap: number): string {
  if (gap >= 300) return 'nettement moins bon';
  if (gap >= 100) return 'moins bon';
  return 'un peu moins bon';
}

/**
 * Construit l'indice à partir des lignes MultiPV (meilleur en tête) et, si disponible, de la meilleure
 * réponse adverse dans la position avec coup nul (« que menace-t-il ? »).
 */
export function buildHint(fen: string, lines: EngineLine[], threatLines: EngineLine[] | null, mine: boolean): Hint | null {
  const sorted = [...lines].sort((a, b) => a.multipv - b.multipv);
  const best = sorted[0];
  if (!best || best.pv.length === 0) return null;
  const bestLan = best.pv[0];
  const line = pvToSan(fen, best.pv.slice(0, 5));
  const bestSan = line[0];
  if (!bestSan) return null;
  const stm = fen.split(' ')[1] === 'w' ? 1 : -1;
  const bestScore = lineScore(best);
  const f = moveFeatures(fen, bestLan);
  const pieceSquare = bestLan.slice(0, 2) as Square;
  const pieceName = f ? PIECE_NAME_FR[f.piece] : 'pièce';

  // 1. Ce que fait le coup.
  const parts: string[] = [];
  const purpose = f ? describePurpose(f, mine) : [];
  parts.push(purpose.length ? `${spoken(bestSan)} ${purpose.join(', ')}.` : `${spoken(bestSan)} est le coup le plus solide ici.`);

  // 2. Menace adverse parée.
  let threat: string | null = null;
  const t = threatLines?.slice().sort((a, b) => a.multipv - b.multipv)[0];
  if (t && t.pv.length) {
    const nf = nullMoveFen(fen);
    const tf = nf ? moveFeatures(nf, t.pv[0]) : null;
    const tSan = nf ? pvToSan(nf, [t.pv[0]])[0] : null;
    if (tf && tSan) {
      const gain = tf.mate ? 10000 : tf.captured && tf.captureGain > 50 ? tf.captureGain : tf.fork ? 250 : 0;
      if (gain >= 150 || tf.mate) {
        const what = tf.mate ? "c'est mat" : tf.captured && tf.captureGain > 50 ? `il prend ${mine ? 'ton' : 'son'} ${PIECE_NAME_FR[tf.captured]} en ${tf.to} gratuitement` : 'il attaque deux pièces à la fois';
        threat = `Si tu ne fais rien, l'adversaire joue ${spoken(tSan)} : ${what}.`;
        // Le meilleur coup pare-t-il cette menace ? (la case visée n'est plus en prise après le coup)
        const after = new Chess(fen);
        try {
          after.move({ from: bestLan.slice(0, 2), to: bestLan.slice(2, 4), promotion: bestLan.length > 4 ? (bestLan[4] as 'q') : undefined });
          const stillThere = tf.captured ? after.get(tf.to as Square) : null;
          const fAfter = stillThere ? moveFeatures(after.fen(), `${t.pv[0].slice(0, 4)}`) : null;
          if (tf.mate || !stillThere || !fAfter || fAfter.captureGain <= 50) threat += ` ${spoken(bestSan)} règle ce problème.`;
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (threat) parts.push(threat);

  // 3. Pourquoi les autres candidats sont moins bons.
  const alternatives: HintAlternative[] = [];
  for (const l of sorted.slice(1, 3)) {
    const lan = l.pv[0];
    if (!lan) continue;
    const san = pvToSan(fen, [lan])[0];
    if (!san) continue;
    const gap = bestScore - lineScore(l);
    if (gap < 30) continue; // quasi équivalent : pas la peine
    const c = new Chess(fen);
    let reason = '';
    try {
      c.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan.length > 4 ? (lan[4] as 'q') : undefined });
      const replyLan = l.pv[1];
      const reply = replyLan ? moveFeatures(c.fen(), replyLan) : null;
      const replySan = replyLan ? pvToSan(c.fen(), [replyLan])[0] : null;
      if (reply && replySan) {
        const cons: string[] = [];
        if (reply.mate) cons.push("c'est mat");
        else if (reply.captured && reply.captureGain > 50) cons.push(`il prend ${mine ? 'ton' : 'son'} ${PIECE_NAME_FR[reply.captured]} en ${reply.to}`);
        if (reply.fork) cons.push('il attaque deux pièces à la fois');
        else if (reply.attacks.length) cons.push(`il attaque ${mine ? 'ton' : 'son'} ${PIECE_NAME_FR[reply.attacks[0].piece]} ${reply.attacks[0].square}`);
        if (reply.check && !reply.mate) cons.push('il fait échec');
        reason = cons.length ? `l'adversaire répond ${spoken(replySan)} et ${cons.join(', ')}` : `l'adversaire répond ${spoken(replySan)} et garde l'initiative`;
      } else {
        reason = "il ne règle pas le problème principal";
      }
    } catch {
      continue;
    }
    alternatives.push({ san, gap, reason });
  }
  if (alternatives.length) {
    parts.push(alternatives.map((a) => `${spoken(a.san)} est ${gapWords(a.gap)} : ${a.reason}.`).join(' '));
  }

  // 4. Bilan.
  const outcome = evalWords(bestScore * (mine ? 1 : -1) * (stm === 1 ? 1 : 1));
  parts.push(`Après ${spoken(bestSan)}, ${outcome}.`);

  const hint: Hint = {
    bestSan,
    bestLan,
    pieceSquare,
    pieceName,
    threat,
    alternatives,
    line,
    explanation: parts.join(' '),
    outcome,
  };
  return hint;
}

/** Valeur d'une pièce pour trier les indices (utilisé par les tests). */
export const pieceValue = (t: keyof typeof PIECE_VALUES) => PIECE_VALUES[t];
