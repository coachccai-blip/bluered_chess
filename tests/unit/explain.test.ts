import { describe, expect, it } from 'vitest';
import { bestLineText, commentForMove, describeLiveMove, describePurpose, evalWords, explainBest, moveFeatures, spoken } from '../../src/analysis/explain';
import { replayRecords, START_FEN } from '../../src/chess/game';
import type { MoveEval } from '../../src/analysis/coach';

describe('caractéristiques d\'un coup', () => {
  it('détecte capture gagnante, échec, roque, développement', () => {
    const f = moveFeatures('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', 'd1d5')!;
    expect(f.captured).toBe('n');
    expect(f.captureGain).toBe(320);
    expect(f.check).toBe(false);
    expect(describePurpose(f)[0]).toBe('prend son cavalier en d5 gratuitement (3 points)');
    const castle = moveFeatures('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'e1g1')!;
    expect(castle.castle).toBe(true);
    expect(describePurpose(castle)).toContain("met ton roi à l'abri");
    const dev = moveFeatures(START_FEN, 'g1f3')!;
    expect(dev.develops).toBe(true);
    expect(describePurpose(dev)[0]).toBe('sort ton cavalier');
    expect(moveFeatures(START_FEN, 'e2e5')).toBeNull();
  });
  it('ne dit pas « pas protégé » quand la pièce attaquée est défendue', () => {
    // Cg5-e6 attaque la dame d8, défendue par la tour d7 : la dame est attaquée par une pièce de moindre valeur, pas « non protégée ».
    const f = moveFeatures('3qk3/2pr4/8/6N1/8/8/8/4K3 w - - 0 1', 'g5e6')!;
    const attackQueen = f.attacks.find((a) => a.square === 'd8')!;
    expect(attackQueen.reason).toBe('lower-value-attacker');
    const text = describePurpose(f).join(' ');
    expect(text).toContain('attaque sa dame d8 avec ton cavalier, une pièce qui vaut moins');
    expect(text).not.toContain("n'est pas protégé");
    // Même cavalier contre un fou défendu par un pion : pas une attaque à signaler (échange égal, pièce protégée).
    const g = moveFeatures('4k3/2p5/3b4/6N1/8/8/8/4K3 w - - 0 1', 'g5e4')!;
    expect(g.attacks.find((a) => a.square === 'd6')).toBeUndefined();
    // Fou vraiment non protégé : la formule reste correcte.
    const h = moveFeatures('4k3/8/3b4/6N1/8/8/8/4K3 w - - 0 1', 'g5e4')!;
    expect(describePurpose(h).join(' ')).toContain("attaque son fou d6, qui n'est pas protégé");
    // Défense par batterie (rayon X) : tour d4 attaquée par la dame d8, défendue par la tour d1 derrière la dame d2.
    const x = moveFeatures('3qk3/8/8/8/3R4/8/3Q4/3RK3 b - - 0 1', 'e8f8')!;
    expect(x.attacks.find((a) => a.square === 'd4')).toBeUndefined();
  });
  it('détecte une pièce sauvée et une pièce laissée en prise', () => {
    // Cavalier blanc d5 attaqué par le pion e6 ; Cd5-f4 le sauve, Ke1-e2 le laisse en prise.
    const fen = '4k3/8/4p3/3N4/8/8/8/4K3 w - - 0 1';
    expect(moveFeatures(fen, 'd5f4')!.escapes).toBe('n');
    expect(moveFeatures(fen, 'e1e2')!.leavesHanging.map((h) => h.square)).toEqual(['d5']);
  });
});

function mk(partial: Partial<MoveEval>): MoveEval {
  return { ply: 1, san: '', lan: '', color: 'w', fenBefore: START_FEN, fenAfter: START_FEN, evalBefore: 0, evalAfter: 0, bestMove: null, bestMoveLan: null, winProbLoss: 0, category: 'excellent', motifs: [], phase: 'opening', ...partial };
}

describe('explication du coup « Mieux »', () => {
  it('explique une capture gratuite ratée avec la réplique adverse', () => {
    const fen = '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1';
    const [rec] = replayRecords(fen, ['Kf1']);
    const m = mk({ ...rec, evalBefore: 300, evalAfter: 0, bestMove: 'Rxd5', bestMoveLan: 'd1d5', bestLine: ['Rxd5', 'Kd7'], threat: 'Nf4', threatLan: 'd5f4', winProbLoss: 25, category: 'blunder' });
    const text = explainBest(m)!;
    expect(text).toContain('Tour prend d5 prend son cavalier en d5 gratuitement (3 points).');
    expect(text).toContain("Avec Tour prend d5, tu es en train de gagner. Après Roi f1, la position est équilibrée.");
    expect(text).not.toMatch(/[+-]\d\.\d/); // pas de chiffres d'évaluation
    expect(text).not.toContain('Suite prévue');
    expect(bestLineText(m)).toBe('Suite possible : Rxd5 Kd7');
    const c = commentForMove(m, 'w');
    expect(c).toContain('Tu joues Roi f1');
    expect(c).toContain('mieux valait Tour prend d5');
  });
  it('après un coup « bon », nomme le meilleur coup et explique la différence avec douceur', () => {
    const fen = '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1';
    const [rec] = replayRecords(fen, ['Rd4']);
    const m = mk({ ...rec, evalBefore: 300, evalAfter: 250, bestMove: 'Rxd5', bestMoveLan: 'd1d5', winProbLoss: 3, category: 'good' });
    const c = commentForMove(m, 'w');
    expect(c).toContain('Bon coup.');
    expect(c).toContain('Le meilleur coup était Tour prend d5.');
    expect(c).toContain('Tour prend d5 prend son cavalier en d5 gratuitement');
    expect(c.toLowerCase()).toContain('ton coup reste bon, juste un peu moins précis.');
    expect(c).not.toContain('gâche');
    // Pour l'adversaire, pas d'explication.
    expect(commentForMove(m, 'b')).not.toContain('meilleur coup');
  });
  it('ne rien expliquer quand le coup joué est le meilleur', () => {
    expect(explainBest(mk({ lan: 'e2e4', bestMoveLan: 'e2e4', bestMove: 'e4' }))).toBeNull();
  });
  it('commentaire en direct et prononciation', () => {
    expect(spoken('Nf3')).toBe('Cavalier f3');
    expect(spoken('exd5')).toBe('e prend d5');
    expect(spoken('O-O')).toBe('petit roque');
    expect(spoken('Qxf7#')).toBe('Dame prend f7 échec et mat');
    expect(spoken('e8=Q+')).toBe('e8 promotion Dame échec');
    const [mate] = replayRecords('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['Ra8#']);
    expect(describeLiveMove(mate, 'w')).toBe('Tu joues Tour a8 échec et mat. Échec et mat, la partie est terminée.');
    const [rec] = replayRecords('4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1', ['Nd5']);
    expect(describeLiveMove(rec, 'w')).toContain('Attention : ton cavalier d5 peut être pris.');
    expect(evalWords(0)).toBe('la position est équilibrée');
    expect(evalWords(-9999)).toBe('tu vas te faire mater');
  });
});
