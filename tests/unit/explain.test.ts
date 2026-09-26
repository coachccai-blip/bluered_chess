import { describe, expect, it } from 'vitest';
import { commentForMove, describeLiveMove, describePurpose, explainBest, moveFeatures, spoken } from '../../src/analysis/explain';
import { replayRecords, START_FEN } from '../../src/chess/game';
import type { MoveEval } from '../../src/analysis/coach';

describe('caractéristiques d\'un coup', () => {
  it('détecte capture gagnante, échec, roque, développement', () => {
    const f = moveFeatures('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', 'd1d5')!;
    expect(f.captured).toBe('n');
    expect(f.captureGain).toBe(320);
    expect(f.check).toBe(false);
    expect(describePurpose(f)[0]).toContain('gagne le cavalier en d5');
    const castle = moveFeatures('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'e1g1')!;
    expect(castle.castle).toBe(true);
    expect(describePurpose(castle)).toContain("met le roi à l'abri par le roque");
    const dev = moveFeatures(START_FEN, 'g1f3')!;
    expect(dev.develops).toBe(true);
    expect(describePurpose(dev)[0]).toContain('développe le cavalier vers f3');
    expect(moveFeatures(START_FEN, 'e2e5')).toBeNull();
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
    expect(text).toContain('Rxd5 gagne le cavalier en d5');
    expect(text).toContain('Suite prévue : Rxd5 Kd7');
    expect(text).toContain('Évaluation : +3.0 avec Rxd5, 0.0 après Kf1');
    const c = commentForMove(m, 'w');
    expect(c).toContain('Tu joues Roi f1');
    expect(c).toContain('mieux valait Tour prend d5');
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
    expect(describeLiveMove(rec, 'w')).toContain('Attention : le cavalier d5 est en prise');
  });
});
