// Détection de motifs tactiques sur la carte d'attaques (section 7, étape 3).
import { Chess } from 'chess.js';
import { computeAttacks, findForks, findPins, parseFenBoard } from '../chess/attacks';
import { staticExchange } from '../chess/see';
import { PIECE_VALUES, opposite, type Color, type PieceSymbol, type Square } from '../chess/types';
import { kingSquare, mateInOne, type MoveRecord } from '../chess/game';

export type Motif =
  | 'hanging_piece' // pièce laissée en prise
  | 'missed_free_capture'
  | 'fork_suffered'
  | 'fork_missed'
  | 'pin_suffered'
  | 'king_in_center'
  | 'moved_into_attack' // joué dans une case rouge
  | 'losing_exchange'
  | 'mate_missed'
  | 'mate_allowed'
  | 'tempo_loss'
  | 'turning_point';

export const MOTIF_LABEL: Record<Motif, string> = {
  hanging_piece: 'Pièce en prise',
  missed_free_capture: 'Capture gratuite ratée',
  fork_suffered: 'Fourchette subie',
  fork_missed: 'Fourchette ratée',
  pin_suffered: 'Clouage subi',
  king_in_center: 'Roi au centre',
  moved_into_attack: 'Coup dans une case adverse',
  losing_exchange: 'Échange perdant',
  mate_missed: 'Mat raté',
  mate_allowed: 'Mat encaissé',
  tempo_loss: 'Temps perdu',
  turning_point: 'Tournant de la partie',
};

export interface MotifHit {
  motif: Motif;
  /** Données pour instancier la phrase du coach. */
  data: Record<string, string | number>;
}

export const PIECE_NAME_FR: Record<PieceSymbol, string> = {
  p: 'pion',
  n: 'cavalier',
  b: 'fou',
  r: 'tour',
  q: 'dame',
  k: 'roi',
};

export const PIECE_NAME_FR_CAP: Record<PieceSymbol, string> = {
  p: 'Pion',
  n: 'Cavalier',
  b: 'Fou',
  r: 'Tour',
  q: 'Dame',
  k: 'Roi',
};

export interface MotifContext {
  record: MoveRecord;
  bestMoveLan: string | null;
  bestMoveSan: string | null;
  /** Le coup joué a-t-il coûté cher (>= erreur) ? */
  significant: boolean;
  /** Plies précédents (pour temps perdu). */
  previousRecords: MoveRecord[];
  mateAvailableBefore: number | null;
  mateAgainstAfter: number | null;
}

function pieceOn(fen: string, sq: Square) {
  const b = parseFenBoard(fen);
  const f = sq.charCodeAt(0) - 97;
  const r = parseInt(sq[1], 10) - 1;
  return b[r][f];
}

function lanTo(lan: string): Square {
  return lan.slice(2, 4) as Square;
}

/** Détecte les motifs pour un coup donné. */
export function detectMotifs(ctx: MotifContext): MotifHit[] {
  const hits: MotifHit[] = [];
  const { record: rec, bestMoveSan } = ctx;
  const bestMoveLan = ctx.bestMoveLan && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(ctx.bestMoveLan) ? ctx.bestMoveLan : null;
  const me: Color = rec.color;
  const opp = opposite(me);
  const before = computeAttacks(rec.fenBefore);
  const after = computeAttacks(rec.fenAfter);
  const boardAfter = parseFenBoard(rec.fenAfter);
  const boardBefore = parseFenBoard(rec.fenBefore);

  // Mat raté / mat encaissé
  if (ctx.mateAvailableBefore !== null && ctx.mateAvailableBefore > 0 && bestMoveSan && !rec.mate) {
    const stillMate = ctx.mateAgainstAfter !== null && ctx.mateAgainstAfter < 0;
    if (!stillMate) hits.push({ motif: 'mate_missed', data: { n: ctx.mateAvailableBefore, best: bestMoveSan } });
  }
  if (ctx.mateAgainstAfter !== null && ctx.mateAgainstAfter > 0 && ctx.mateAgainstAfter <= 3) {
    const wasMated = mateInOne(rec.fenAfter);
    hits.push({ motif: 'mate_allowed', data: { n: ctx.mateAgainstAfter, threat: wasMated ?? '' } });
  }

  // Pièce en prise laissée après le coup (hors la pièce jouée dans une case attaquée, traitée à part)
  const myHanging = after.hanging.filter((h) => h.color === me);
  const movedInto = myHanging.find((h) => h.square === rec.to);
  if (movedInto && rec.piece !== 'k') {
    const attackers = movedInto.attackers;
    const cheapest = attackers.reduce((a, b) => (PIECE_VALUES[a.piece] < PIECE_VALUES[b.piece] ? a : b));
    // Capture d'échange : si la pièce a capturé au moins autant, ce n'est pas une gaffe.
    const capturedValue = rec.captured ? PIECE_VALUES[rec.captured] : 0;
    const see = staticExchange(after.map, rec.to, opp, rec.piece);
    if (capturedValue - see < 0 || (!rec.captured && ctx.significant)) {
      hits.push({
        motif: 'moved_into_attack',
        data: {
          piece: PIECE_NAME_FR[rec.piece],
          square: rec.to,
          attacker: PIECE_NAME_FR[cheapest.piece],
          attackerSquare: cheapest.from,
          defended: movedInto.defenders.length,
        },
      });
    }
  }
  const leftHanging = myHanging
    .filter((h) => h.square !== rec.to)
    .filter((h) => !before.hanging.some((b) => b.square === h.square && b.color === me) || ctx.significant)
    .sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]);
  if (leftHanging.length > 0 && ctx.significant) {
    const h = leftHanging[0];
    const cheapest = h.attackers.reduce((a, b) => (PIECE_VALUES[a.piece] < PIECE_VALUES[b.piece] ? a : b));
    hits.push({
      motif: 'hanging_piece',
      data: {
        piece: PIECE_NAME_FR[h.type],
        square: h.square,
        attacker: PIECE_NAME_FR[cheapest.piece],
        attackerSquare: cheapest.from,
        best: bestMoveSan ?? '',
      },
    });
  }

  // Capture gratuite ratée : une pièce adverse était en prise avant, le meilleur coup la capture, pas le coup joué.
  if (bestMoveLan && ctx.significant) {
    const target = lanTo(bestMoveLan);
    const victim = pieceOn(rec.fenBefore, target);
    const wasHanging = before.hanging.find((h) => h.square === target && h.color === opp);
    if (victim && victim.color === opp && wasHanging && rec.to !== target) {
      hits.push({
        motif: 'missed_free_capture',
        data: { piece: PIECE_NAME_FR[victim.type], square: target, best: bestMoveSan ?? '' },
      });
    }
  }

  // Fourchette subie : après mon coup, une pièce adverse fourche mes pièces (et ce n'était pas déjà le cas).
  if (ctx.significant) {
    const forksAfter = findForks(boardAfter, after.map, opp);
    const forksBefore = findForks(boardBefore, before.map, opp);
    const newFork = forksAfter.find((f) => !forksBefore.some((g) => g.by.square === f.by.square));
    if (newFork) {
      hits.push({
        motif: 'fork_suffered',
        data: {
          piece: PIECE_NAME_FR[newFork.by.type],
          square: newFork.by.square,
          targets: newFork.targets.map((t) => `${PIECE_NAME_FR[t.type]} ${t.square}`).join(' et '),
        },
      });
    }
    // Fourchette ratée : le meilleur coup crée une fourchette.
    if (bestMoveLan) {
      const c = new Chess(rec.fenBefore);
      try {
        c.move({ from: bestMoveLan.slice(0, 2), to: bestMoveLan.slice(2, 4), promotion: bestMoveLan.length > 4 ? (bestMoveLan[4] as 'q') : undefined });
        const fenBest = c.fen();
        const bAfterBest = parseFenBoard(fenBest);
        const forksBest = findForks(bAfterBest, computeAttacks(fenBest).map, me).filter((f) => f.by.square === lanTo(bestMoveLan));
        if (forksBest.length > 0 && !hits.some((h) => h.motif === 'missed_free_capture')) {
          const f = forksBest[0];
          hits.push({
            motif: 'fork_missed',
            data: {
              best: bestMoveSan ?? '',
              piece: PIECE_NAME_FR[f.by.type],
              targets: f.targets.map((t) => `${PIECE_NAME_FR[t.type]} ${t.square}`).join(' et '),
            },
          });
        }
      } catch {
        /* coup moteur invalide : ignorer */
      }
    }
    // Clouage subi (nouveau après mon coup).
    const pinsAfter = findPins(boardAfter, me);
    const pinsBefore = findPins(boardBefore, me);
    const newPin = pinsAfter.find((p) => !pinsBefore.some((q) => q.pinned.square === p.pinned.square));
    if (newPin) {
      hits.push({
        motif: 'pin_suffered',
        data: {
          piece: PIECE_NAME_FR[newPin.pinned.type],
          square: newPin.pinned.square,
          by: PIECE_NAME_FR[newPin.by.type],
          bySquare: newPin.by.square,
          behind: PIECE_NAME_FR[newPin.to.type],
        },
      });
    }
  }

  // Échange perdant : capture dont le SEE est négatif.
  if (rec.captured && ctx.significant) {
    const see = staticExchange(after.map, rec.to, opp, rec.piece);
    const net = PIECE_VALUES[rec.captured] - see;
    if (net < -100) {
      hits.push({ motif: 'losing_exchange', data: { piece: PIECE_NAME_FR[rec.piece], square: rec.to, loss: Math.round(-net / 100) } });
    }
  }

  // Roi au centre après le coup 15 (colonnes d/e, rangée initiale), quand le coup est coûteux.
  const moveNumber = Math.ceil(rec.ply / 2);
  if (moveNumber > 15 && ctx.significant) {
    const k = kingSquare(rec.fenAfter, me);
    const homeRank = me === 'w' ? '1' : '8';
    if (k && (k[0] === 'd' || k[0] === 'e') && k[1] === homeRank) {
      hits.push({ motif: 'king_in_center', data: { square: k } });
    }
  }

  // Temps perdu : avant le coup 10, redéplacer une pièce déjà développée (hors capture / échec / pion).
  if (moveNumber <= 10 && rec.piece !== 'p' && rec.piece !== 'k' && !rec.captured && !rec.check && ctx.significant) {
    const movedBefore = ctx.previousRecords.some((p) => p.color === me && p.to === rec.from && p.piece === rec.piece);
    if (movedBefore) hits.push({ motif: 'tempo_loss', data: { piece: PIECE_NAME_FR[rec.piece], square: rec.to } });
  }

  return hits;
}
