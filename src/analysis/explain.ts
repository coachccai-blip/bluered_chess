// Explications en français : pourquoi le coup « Mieux » est meilleur, et commentaires de chaque coup.
// Pur (sans React), fondé sur la carte d'attaques et la variante du moteur.
import { Chess } from 'chess.js';
import { computeAttacks, findForks, parseFenBoard } from '../chess/attacks';
import { staticExchange } from '../chess/see';
import { PIECE_VALUES, opposite, type Color, type PieceSymbol, type Square } from '../chess/types';
import { PIECE_NAME_FR } from './motifs';
import { CATEGORY_LABEL } from './classify';
import { formatEval, type MoveEval } from './coach';
import type { MoveRecord } from '../chess/game';

const CENTER: Square[] = ['d4', 'e4', 'd5', 'e5'];
const HOME: Record<Color, string> = { w: '1', b: '8' };

export interface MoveFeatures {
  san: string;
  piece: PieceSymbol;
  from: Square;
  to: Square;
  captured: PieceSymbol | null;
  /** Gain matériel net estimé (cp) si capture. */
  captureGain: number;
  check: boolean;
  mate: boolean;
  castle: boolean;
  promotion: PieceSymbol | null;
  /** La pièce jouée était en prise avant le coup. */
  escapes: PieceSymbol | null;
  /** Pièces alliées en prise avant et défendues (ou plus attaquées) après. */
  defends: { piece: PieceSymbol; square: Square }[];
  /** Pièces adverses nouvellement attaquées et non défendues (ou plus précieuses). */
  attacks: { piece: PieceSymbol; square: Square }[];
  fork: boolean;
  develops: boolean;
  centralizes: boolean;
  /** Pièces alliées laissées en prise après le coup. */
  leavesHanging: { piece: PieceSymbol; square: Square }[];
}

/** Analyse « géométrique » d'un coup LAN depuis un FEN : ce qu'il gagne, ce qu'il menace, ce qu'il risque. */
export function moveFeatures(fen: string, lan: string): MoveFeatures | null {
  const c = new Chess(fen);
  let m;
  try {
    m = c.move({ from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan.length > 4 ? (lan[4] as 'q') : undefined });
  } catch {
    return null;
  }
  const me = m.color as Color;
  const opp = opposite(me);
  const fenAfter = c.fen();
  const before = computeAttacks(fen);
  const after = computeAttacks(fenAfter);
  const boardAfter = parseFenBoard(fenAfter);
  const from = m.from as Square;
  const to = m.to as Square;
  const piece = m.piece as PieceSymbol;

  const wasHanging = before.hanging.find((h) => h.square === from && h.color === me);
  const myHangingBefore = before.hanging.filter((h) => h.color === me && h.square !== from);
  const myHangingAfter = after.hanging.filter((h) => h.color === me);
  const defends = myHangingBefore.filter((h) => !myHangingAfter.some((a) => a.square === h.square)).map((h) => ({ piece: h.type, square: h.square }));
  const oppHangingBefore = new Set(before.hanging.filter((h) => h.color === opp).map((h) => h.square));
  const attacks = after.hanging
    .filter((h) => h.color === opp && !oppHangingBefore.has(h.square) && after.map[h.square][me].some((a) => a.from === to))
    .map((h) => ({ piece: h.type, square: h.square }));
  const forks = findForks(boardAfter, after.map, me).filter((f) => f.by.square === to);
  let captureGain = 0;
  if (m.captured) {
    const see = staticExchange(after.map, to, opp, m.promotion ? (m.promotion as PieceSymbol) : piece);
    captureGain = PIECE_VALUES[m.captured as PieceSymbol] - see;
  }
  const develops = (piece === 'n' || piece === 'b') && from[1] === HOME[me] && to[1] !== HOME[me];
  const centralizes = piece === 'p' && CENTER.includes(to);
  return {
    san: m.san,
    piece,
    from,
    to,
    captured: (m.captured as PieceSymbol) ?? null,
    captureGain,
    check: m.san.includes('+'),
    mate: m.san.includes('#'),
    castle: m.san.startsWith('O-O'),
    promotion: (m.promotion as PieceSymbol) ?? null,
    escapes: wasHanging ? piece : null,
    defends,
    attacks,
    fork: forks.length > 0,
    develops,
    centralizes,
    leavesHanging: myHangingAfter.filter((h) => h.square !== to || !m.captured).map((h) => ({ piece: h.type, square: h.square })),
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pn = (t: PieceSymbol) => PIECE_NAME_FR[t];
const art = (t: PieceSymbol) => (t === 'q' || t === 'r' ? 'la ' : 'le ');
const pts = (cp: number) => {
  const v = Math.round(cp / 100);
  return v >= 1 ? ` (environ ${v} point${v > 1 ? 's' : ''})` : '';
};

/** Ce que fait un coup, en une proposition (« gagne la dame en d8 »). */
export function describePurpose(f: MoveFeatures): string[] {
  const out: string[] = [];
  if (f.mate) out.push('donne échec et mat');
  if (f.captured) {
    if (f.captureGain > 50) out.push(`gagne ${art(f.captured)}${pn(f.captured)} en ${f.to}${pts(f.captureGain)}`);
    else if (f.captureGain >= -50) out.push(`échange ${art(f.captured)}${pn(f.captured)} en ${f.to}`);
  }
  if (f.promotion) out.push(`promeut en ${pn(f.promotion)}`);
  if (f.check && !f.mate) out.push('donne échec');
  if (f.castle) out.push('met le roi à l\'abri par le roque');
  if (f.escapes) out.push(`sauve ${art(f.escapes)}${pn(f.escapes)} qui était en prise`);
  for (const d of f.defends.slice(0, 2)) out.push(`défend ${art(d.piece)}${pn(d.piece)} ${d.square}`);
  if (f.fork) out.push('crée une fourchette');
  else for (const a of f.attacks.slice(0, 2)) out.push(`attaque ${art(a.piece)}${pn(a.piece)} ${a.square} sans défense`);
  if (out.length === 0) {
    if (f.develops) out.push(`développe ${art(f.piece)}${pn(f.piece)} vers ${f.to}`);
    if (f.centralizes) out.push('prend le centre');
  }
  return out;
}

function joinFr(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

/**
 * Pourquoi le coup « Mieux » est meilleur que le coup joué. Null si le coup joué est déjà le meilleur
 * ou si la différence est négligeable.
 */
export function explainBest(m: MoveEval): string | null {
  if (!m.bestMoveLan || !m.bestMove || m.bestMoveLan === m.lan) return null;
  if (m.winProbLoss < 2) return null;
  const sign = m.color === 'w' ? 1 : -1;
  const best = moveFeatures(m.fenBefore, m.bestMoveLan);
  const played = moveFeatures(m.fenBefore, m.lan);
  const parts: string[] = [];

  // 1. Ce que gagne le meilleur coup.
  const purpose = best ? describePurpose(best) : [];
  if (purpose.length) parts.push(`${m.bestMove} ${joinFr(purpose)}.`);

  // 2. Ce que le coup joué laisse à l'adversaire.
  const reply = m.threat && m.threatLan ? moveFeatures(m.fenAfter, m.threatLan) : null;
  if (reply) {
    const consequences: string[] = [];
    if (reply.mate) consequences.push('mate');
    else if (reply.captured && reply.captureGain > 50) consequences.push(`prend ${art(reply.captured)}${pn(reply.captured)} en ${reply.to}${pts(reply.captureGain)}`);
    if (reply.fork) consequences.push('fourche deux de tes pièces');
    else if (reply.attacks.length) consequences.push(`attaque ${art(reply.attacks[0].piece)}${pn(reply.attacks[0].piece)} ${reply.attacks[0].square}`);
    if (reply.check && !reply.mate) consequences.push('donne échec');
    if (consequences.length) parts.push(`Après ${m.san}, l'adversaire répond ${m.threat} et ${joinFr(consequences)}.`);
    else if (played && played.leavesHanging.length) {
      const h = played.leavesHanging[0];
      parts.push(`Après ${m.san}, ${art(h.piece)}${pn(h.piece)} ${h.square} reste en prise.`);
    }
  } else if (played && played.leavesHanging.length) {
    const h = played.leavesHanging[0];
    parts.push(`Après ${m.san}, ${art(h.piece)}${pn(h.piece)} ${h.square} reste en prise.`);
  }

  // 3. Suite prévue et évaluation.
  if (m.bestLine && m.bestLine.length > 1) parts.push(`Suite prévue : ${m.bestLine.slice(0, 5).join(' ')}.`);
  parts.push(`Évaluation : ${formatEval(m.evalBefore * sign)} avec ${m.bestMove}, ${formatEval(m.evalAfter * sign)} après ${m.san}.`);
  return parts.join(' ');
}

/** Commentaire complet d'un coup analysé (affiché sous l'échiquier et lu à voix haute). */
export function commentForMove(m: MoveEval, playerColor: Color): string {
  const mine = m.color === playerColor;
  const who = mine ? 'Tu joues' : 'L\'adversaire joue';
  const label = CATEGORY_LABEL[m.category].toLowerCase();
  const head = `${who} ${spoken(m.san)}.`;
  if (m.category === 'excellent' || m.category === 'good') {
    const f = moveFeatures(m.fenBefore, m.lan);
    const purpose = f ? describePurpose(f) : [];
    const tail = purpose.length ? ` ${cap(joinFr(purpose))}.` : '';
    return `${head} ${mine ? (m.category === 'excellent' ? 'Excellent coup.' : 'Bon coup.') : ''}${tail}`.trim();
  }
  const why = m.explanation ?? explainBest(m);
  return `${head} ${cap(label)}${m.bestMove ? `, mieux valait ${spoken(m.bestMove)}.` : '.'}${why ? ` ${why}` : ''}`;
}

/** SAN lisible par une voix (« Cavalier f3 », « petit roque », « prend »). */
export function spoken(san: string): string {
  if (san.startsWith('O-O-O')) return 'grand roque';
  if (san.startsWith('O-O')) return 'petit roque';
  const names: Record<string, string> = { K: 'Roi', Q: 'Dame', R: 'Tour', B: 'Fou', N: 'Cavalier' };
  let s = san.replace(/[+#]$/, '');
  const suffix = san.endsWith('#') ? ' échec et mat' : san.endsWith('+') ? ' échec' : '';
  let out = '';
  if (names[s[0]]) {
    out = names[s[0]] + ' ';
    s = s.slice(1);
  }
  s = s.replace('x', ' prend ').replace(/=([QRBN])/, (_, p: string) => ` promotion ${names[p]}`);
  return (out + s).replace(/\s+/g, ' ').trim() + suffix;
}

/** Commentaire en direct pendant la partie, sans moteur : faits visibles sur la carte d'attaques. */
export function describeLiveMove(rec: MoveRecord, playerColor: Color): string {
  const mine = rec.color === playerColor;
  const f = moveFeatures(rec.fenBefore, rec.lan);
  const who = mine ? 'Tu joues' : 'L\'adversaire joue';
  const parts = [`${who} ${spoken(rec.san)}.`];
  if (rec.mate) return `${parts[0]} Échec et mat, la partie est terminée.`;
  if (f) {
    const purpose = describePurpose(f).filter((p) => !p.startsWith('développe') && !p.startsWith('prend le centre'));
    if (purpose.length) parts.push(`${cap(joinFr(purpose))}.`);
    const risk = f.leavesHanging.filter((h) => h.square !== f.to || !f.captured);
    if (risk.length) {
      const h = risk[0];
      parts.push(mine ? `Attention : ${art(h.piece)}${pn(h.piece)} ${h.square} est en prise.` : `${cap(art(h.piece))}${pn(h.piece)} adverse en ${h.square} est en prise.`);
    }
  }
  return parts.join(' ');
}
