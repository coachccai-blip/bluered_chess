// Explications en français : pourquoi le coup « Mieux » est meilleur, et commentaires de chaque coup.
// Pur (sans React), fondé sur la carte d'attaques et la variante du moteur.
import { Chess } from 'chess.js';
import { computeAttacks, findForks, parseFenBoard } from '../chess/attacks';
import type { HangingPiece } from '../chess/types';

type HangingReason = HangingPiece['reason'];

/**
 * Affine le diagnostic « en prise » en comptant les défenses par rayon X (batterie derrière une pièce alliée) :
 * une pièce dite « non protégée » mais défendue par une batterie n'est pas gratuite. Null si elle n'est finalement pas en prise.
 */
function refineHanging(h: HangingPiece, xray: ReturnType<typeof computeAttacks>): HangingReason | null {
  const defenders = xray.map[h.square][h.color].length;
  if (defenders === 0) return 'undefended';
  const value = PIECE_VALUES[h.type];
  const minAttacker = Math.min(...h.attackers.map((a) => PIECE_VALUES[a.piece]));
  // Cavalier contre fou (ou l'inverse) : pas une « pièce de moindre valeur », c'est un échange égal.
  if (value - minAttacker >= 100) return 'lower-value-attacker';
  if (h.attackers.length > defenders && minAttacker <= value + 50) return 'outnumbered';
  return null;
}
import { staticExchange } from '../chess/see';
import { PIECE_VALUES, opposite, type Color, type PieceSymbol, type Square } from '../chess/types';
import { PIECE_NAME_FR } from './motifs';
import { CATEGORY_LABEL } from './classify';
import type { MoveEval } from './coach';
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
  attacks: { piece: PieceSymbol; square: Square; reason: HangingReason }[];
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
  const afterXray = computeAttacks(fenAfter, { xray: true });
  const boardAfter = parseFenBoard(fenAfter);
  const from = m.from as Square;
  const to = m.to as Square;
  const piece = m.piece as PieceSymbol;

  const wasHanging = before.hanging.find((h) => h.square === from && h.color === me);
  const myHangingBefore = before.hanging.filter((h) => h.color === me && h.square !== from);
  const myHangingAfter = after.hanging.filter((h) => h.color === me && refineHanging(h, afterXray) !== null);
  const defends = myHangingBefore.filter((h) => !myHangingAfter.some((a) => a.square === h.square)).map((h) => ({ piece: h.type, square: h.square }));
  const oppHangingBefore = new Set(before.hanging.filter((h) => h.color === opp).map((h) => h.square));
  const attacks = after.hanging
    .filter((h) => h.color === opp && !oppHangingBefore.has(h.square) && after.map[h.square][me].some((a) => a.from === to))
    .map((h) => ({ piece: h.type, square: h.square, reason: refineHanging(h, afterXray) }))
    .filter((a): a is { piece: PieceSymbol; square: Square; reason: HangingReason } => a.reason !== null);
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
/** « ta dame », « ton cavalier » / « sa dame », « son cavalier ». */
const poss = (t: PieceSymbol, mine: boolean) => {
  const fem = t === 'q' || t === 'r';
  return `${mine ? (fem ? 'ta' : 'ton') : fem ? 'sa' : 'son'} ${pn(t)}`;
};
const points = (cp: number) => {
  const v = Math.round(cp / 100);
  if (v <= 0) return '';
  return v === 1 ? ' (1 point)' : ` (${v} points)`;
};

/**
 * Ce que fait un coup, en mots simples. `mine` : le coup est joué par le joueur (ses pièces = « ton/ta »,
 * celles de l'adversaire = « son/sa »).
 */
export function describePurpose(f: MoveFeatures, mine = true): string[] {
  const out: string[] = [];
  if (f.mate) out.push('fait échec et mat');
  if (f.captured) {
    if (f.captureGain > 50) out.push(`prend ${poss(f.captured, !mine)} en ${f.to} gratuitement${points(f.captureGain)}`);
    else if (f.captureGain >= -50) out.push(`échange ${poss(f.captured, !mine)} en ${f.to}`);
  }
  if (f.promotion) out.push(`fait ${f.promotion === 'q' ? 'une dame' : 'un ' + pn(f.promotion)}`);
  if (f.check && !f.mate) out.push('fait échec');
  if (f.castle) out.push(`met ${mine ? 'ton' : 'son'} roi à l'abri`);
  if (f.escapes) out.push(`sauve ${poss(f.escapes, mine)} qui allait être pris${f.escapes === 'q' || f.escapes === 'r' ? 'e' : ''}`);
  for (const d of f.defends.slice(0, 2)) out.push(`protège ${poss(d.piece, mine)} ${d.square}`);
  if (f.fork) out.push('attaque deux pièces en même temps');
  else
    for (const a of f.attacks.slice(0, 2)) {
      const fem = a.piece === 'q' || a.piece === 'r' ? 'e' : '';
      if (a.reason === 'undefended') out.push(`attaque ${poss(a.piece, !mine)} ${a.square}, qui n'est pas protégé${fem}`);
      else if (a.reason === 'lower-value-attacker') out.push(`attaque ${poss(a.piece, !mine)} ${a.square} avec ${poss(f.promotion ?? f.piece, mine)}, une pièce qui vaut moins`);
      else out.push(`attaque ${poss(a.piece, !mine)} ${a.square}, qui n'est pas assez défendu${fem}`);
    }
  if (out.length === 0) {
    if (f.develops) out.push(`sort ${poss(f.piece, mine)}`);
    if (f.centralizes) out.push('prend le centre');
  }
  return out;
}

function joinFr(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

/** Évaluation en mots simples, du point de vue du joueur. */
export function evalWords(cpForPlayer: number): string {
  if (cpForPlayer >= 9000) return 'tu vas mater';
  if (cpForPlayer <= -9000) return 'tu vas te faire mater';
  if (cpForPlayer >= 300) return 'tu es en train de gagner';
  if (cpForPlayer >= 100) return 'tu es mieux';
  if (cpForPlayer > -100) return 'la position est équilibrée';
  if (cpForPlayer > -300) return 'tu es moins bien';
  return 'tu es en train de perdre';
}

/**
 * Pourquoi le coup « Mieux » est meilleur, en mots simples. Null si le coup joué est déjà le meilleur
 * ou si la différence est négligeable. `mine` : le coup a été joué par le joueur.
 */
export function explainBest(m: MoveEval, mine = true): string | null {
  if (!m.bestMoveLan || !m.bestMove || m.bestMoveLan === m.lan) return null;
  if (m.winProbLoss < 2) return null;
  const sign = m.color === 'w' ? 1 : -1;
  const best = moveFeatures(m.fenBefore, m.bestMoveLan);
  const played = moveFeatures(m.fenBefore, m.lan);
  const who = mine ? 'tu' : 'il';
  const parts: string[] = [];

  // 1. Ce que gagne le meilleur coup.
  const purpose = best ? describePurpose(best, mine) : [];
  if (purpose.length) parts.push(`${spoken(m.bestMove)} ${joinFr(purpose)}.`);

  // 2. Ce que le coup joué laisse à l'adversaire.
  const reply = m.threat && m.threatLan ? moveFeatures(m.fenAfter, m.threatLan) : null;
  const other = mine ? "l'adversaire" : 'tu';
  if (reply) {
    const consequences: string[] = [];
    if (reply.mate) consequences.push("c'est mat");
    else if (reply.captured && reply.captureGain > 50) consequences.push(`${mine ? 'il' : 'tu'} prend${mine ? '' : 's'} ${poss(reply.captured, mine)} en ${reply.to} gratuitement`);
    if (reply.fork) consequences.push(`${mine ? 'il' : 'tu'} attaque${mine ? '' : 's'} deux pièces à la fois`);
    else if (reply.attacks.length) consequences.push(`${mine ? 'il' : 'tu'} attaque${mine ? '' : 's'} ${poss(reply.attacks[0].piece, mine)} ${reply.attacks[0].square}`);
    if (reply.check && !reply.mate) consequences.push(`${mine ? 'il' : 'tu'} fait${mine ? '' : 's'} échec`);
    if (consequences.length) parts.push(`Après ${spoken(m.san)}, ${other} peu${mine ? 't' : 'x'} jouer ${spoken(m.threat!)} : ${joinFr(consequences)}.`);
    else if (played && played.leavesHanging.length) {
      const h = played.leavesHanging[0];
      parts.push(`Après ${spoken(m.san)}, ${poss(h.piece, mine)} ${h.square} peut être pris${h.piece === 'q' || h.piece === 'r' ? 'e' : ''} gratuitement.`);
    }
  } else if (played && played.leavesHanging.length) {
    const h = played.leavesHanging[0];
    parts.push(`Après ${spoken(m.san)}, ${poss(h.piece, mine)} ${h.square} peut être pris${h.piece === 'q' || h.piece === 'r' ? 'e' : ''} gratuitement.`);
  }

  // 3. Bilan en mots simples (pas de chiffres).
  if (mine) {
    const a = evalWords(m.evalBefore * sign);
    const b = evalWords(m.evalAfter * sign);
    if (m.category === 'good' || m.category === 'excellent') {
      parts.push(a === b ? `Avec ${spoken(m.bestMove)}, ${a}. Ton coup reste bon, juste un peu moins précis.` : `Avec ${spoken(m.bestMove)}, ${a}. Après ${spoken(m.san)}, ${b} : ton coup reste bon, juste un peu moins précis.`);
    } else {
      parts.push(a === b ? `Avec ${spoken(m.bestMove)}, ${a} ; ton coup gâche une partie de l'avantage.` : `Avec ${spoken(m.bestMove)}, ${a}. Après ${spoken(m.san)}, ${b}.`);
    }
  }
  void who;
  return parts.join(' ');
}

/** Suite prévue par le moteur, pour les curieux (affichée, pas lue). */
export function bestLineText(m: MoveEval): string | null {
  if (!m.bestLine || m.bestLine.length < 2) return null;
  return `Suite possible : ${m.bestLine.slice(0, 5).join(' ')}`;
}

/** Commentaire complet d'un coup analysé (affiché sous l'échiquier et lu à voix haute). */
export function commentForMove(m: MoveEval, playerColor: Color): string {
  const mine = m.color === playerColor;
  const who = mine ? 'Tu joues' : "L'adversaire joue";
  const label = CATEGORY_LABEL[m.category].toLowerCase();
  const head = `${who} ${spoken(m.san)}.`;
  if (m.category === 'excellent' || m.category === 'good') {
    const f = moveFeatures(m.fenBefore, m.lan);
    const purpose = f ? describePurpose(f, mine) : [];
    const tail = purpose.length ? ` ${cap(joinFr(purpose))}.` : '';
    const base = `${head} ${mine ? (m.category === 'excellent' ? 'Excellent coup.' : 'Bon coup.') : ''}${tail}`.trim();
    // Coup « bon » : on nomme quand même le meilleur coup et on explique pourquoi il était un peu plus fort.
    if (m.category === 'good' && mine) {
      const why = explainBest(m, true);
      if (why && m.bestMove) return `${base} Le meilleur coup était ${spoken(m.bestMove)}. ${why}`;
    }
    return base;
  }
  const why = explainBest(m, mine);
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
    const purpose = describePurpose(f, mine).filter((p) => !p.startsWith('sort ') && !p.startsWith('prend le centre'));
    if (purpose.length) parts.push(`${cap(joinFr(purpose))}.`);
    const risk = f.leavesHanging.filter((h) => h.square !== f.to || !f.captured);
    if (risk.length) {
      const h = risk[0];
      parts.push(mine ? `Attention : ${poss(h.piece, true)} ${h.square} peut être pris${h.piece === 'q' || h.piece === 'r' ? 'e' : ''}.` : `${cap(poss(h.piece, false))} ${h.square} peut être pris${h.piece === 'q' || h.piece === 'r' ? 'e' : ''} : regarde bien.`);
    }
  }
  return parts.join(' ');
}

/** Évaluation en mots, point de vue neutre Bleu/Rouge (mode exploration). */
export function positionWords(cpWhite: number): string {
  if (cpWhite >= 9000) return 'Le Bleu va mater';
  if (cpWhite <= -9000) return 'Le Rouge va mater';
  if (cpWhite >= 300) return 'Le Bleu est en train de gagner';
  if (cpWhite >= 100) return 'Le Bleu est mieux';
  if (cpWhite > -100) return 'La position est équilibrée';
  if (cpWhite > -300) return 'Le Rouge est mieux';
  return 'Le Rouge est en train de gagner';
}

/** Rend un texte neutre (sans « ton/ta » ni « son/sa ») pour le mode exploration. */
export function neutral(text: string): string {
  return text.replace(/\b(ton|son) /g, 'le ').replace(/\b(ta|sa) /g, 'la ').replace(/\bmet le roi/g, 'met le roi');
}

/** Commentaire d'une position pour l'exploration : bilan + meilleur coup expliqué. */
export function explorationComment(cpWhite: number, bestSan: string | null, fen: string, bestLan: string | null): string {
  const turn = fen.split(' ')[1] === 'w' ? 'Bleu' : 'Rouge';
  const parts = [`Trait au ${turn}. ${positionWords(cpWhite)}.`];
  if (bestSan && bestLan) {
    const f = moveFeatures(fen, bestLan);
    const purpose = f ? describePurpose(f, true).map(neutral) : [];
    parts.push(`Meilleur coup : ${spoken(bestSan)}${purpose.length ? ` : ${purpose.join(', ')}` : ''}.`);
  }
  return parts.join(' ');
}
