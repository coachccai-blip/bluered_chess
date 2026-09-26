import { describe, expect, it } from 'vitest';
import { winProbability, moveAccuracy } from '../../src/analysis/winprob';
import { classifyMove } from '../../src/analysis/classify';
import { detectMotifs } from '../../src/analysis/motifs';
import { buildMoveEval } from '../../src/analysis/analyzeGame';
import { selectKeyMoments, summarize, formatEval } from '../../src/analysis/coach';
import { replayRecords, START_FEN } from '../../src/chess/game';
import { fill } from '../../src/analysis/phrases';

describe('probabilité de gain', () => {
  it('est symétrique et bornée', () => {
    expect(winProbability(0)).toBeCloseTo(50);
    expect(winProbability(300) + winProbability(-300)).toBeCloseTo(100);
    expect(winProbability(5000)).toBeGreaterThan(99);
    expect(moveAccuracy(0)).toBeGreaterThan(99);
    expect(moveAccuracy(50)).toBeLessThan(15);
  });
});

describe('classification', () => {
  const base = { isBest: false, isOnlyMove: false, mateAvailableBefore: null, mateStillAvailableAfter: false };
  it('suit les seuils de perte de probabilité', () => {
    expect(classifyMove({ ...base, winProbLoss: 0, isBest: true })).toBe('excellent');
    expect(classifyMove({ ...base, winProbLoss: 3 })).toBe('good');
    expect(classifyMove({ ...base, winProbLoss: 7 })).toBe('inaccuracy');
    expect(classifyMove({ ...base, winProbLoss: 15 })).toBe('mistake');
    expect(classifyMove({ ...base, winProbLoss: 25 })).toBe('blunder');
  });
  it('mat raté', () => {
    expect(classifyMove({ ...base, winProbLoss: 1, mateAvailableBefore: 2, mateStillAvailableAfter: false })).toBe('mate_missed');
    expect(classifyMove({ ...base, winProbLoss: 0, mateAvailableBefore: 2, mateStillAvailableAfter: true })).toBe('excellent');
  });
});

describe('motifs', () => {
  it('pièce jouée dans une case rouge', () => {
    // Blancs jouent Cd5 alors que le pion e6 attaque d5 et rien ne défend.
    const fen = '4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1';
    const [rec] = replayRecords(fen, ['Nd5']);
    const hits = detectMotifs({ record: rec, bestMoveLan: 'c3e4', bestMoveSan: 'Ne4', significant: true, previousRecords: [], mateAvailableBefore: null, mateAgainstAfter: null });
    expect(hits.map((h) => h.motif)).toContain('moved_into_attack');
    const hit = hits.find((h) => h.motif === 'moved_into_attack')!;
    expect(hit.data.attacker).toBe('pion');
    expect(hit.data.attackerSquare).toBe('e6');
  });
  it('capture gratuite ratée', () => {
    // Le cavalier noir d5 est en prise de la tour d1 ; les Blancs jouent Kf1 au lieu de Txd5.
    const fen = '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1';
    const [rec] = replayRecords(fen, ['Kf1']);
    const hits = detectMotifs({ record: rec, bestMoveLan: 'd1d5', bestMoveSan: 'Rxd5', significant: true, previousRecords: [], mateAvailableBefore: null, mateAgainstAfter: null });
    expect(hits.map((h) => h.motif)).toContain('missed_free_capture');
  });
  it('fourchette subie', () => {
    // Cavalier blanc b5 attaque déjà la tour a7 ; les Noirs jouent Td6?? et offrent une fourchette a7 + d6.
    const fen = '3r4/r7/8/1N6/8/8/8/4K2k b - - 0 1';
    const [rec] = replayRecords(fen, ['Rd6']);
    const hits = detectMotifs({ record: rec, bestMoveLan: 'a7a1', bestMoveSan: 'Ra1+', significant: true, previousRecords: [], mateAvailableBefore: null, mateAgainstAfter: null });
    expect(hits.map((h) => h.motif)).toContain('fork_suffered');
  });
  it('mat raté et mat encaissé', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const [rec] = replayRecords(fen, ['Ra7']);
    const hits = detectMotifs({ record: rec, bestMoveLan: 'a1a8', bestMoveSan: 'Ra8#', significant: true, previousRecords: [], mateAvailableBefore: 1, mateAgainstAfter: null });
    expect(hits.map((h) => h.motif)).toContain('mate_missed');
    const fen2 = '6k1/5ppp/8/8/8/8/r4PPP/6K1 w - - 0 1';
    const [rec2] = replayRecords(fen2, ['Kh1']);
    const hits2 = detectMotifs({ record: rec2, bestMoveLan: 'h2h3', bestMoveSan: 'h3', significant: true, previousRecords: [], mateAvailableBefore: null, mateAgainstAfter: 1 });
    expect(hits2.map((h) => h.motif)).toContain('mate_allowed');
  });
  it('temps perdu en ouverture', () => {
    const records = replayRecords(START_FEN, ['Nf3', 'e5', 'Ng1']);
    const rec = records[2];
    const hits = detectMotifs({ record: rec, bestMoveLan: 'f3e5', bestMoveSan: 'Nxe5', significant: true, previousRecords: records.slice(0, 2), mateAvailableBefore: null, mateAgainstAfter: null });
    expect(hits.map((h) => h.motif)).toContain('tempo_loss');
  });
});

describe('coup qui donne mat', () => {
  it('est classé excellent, jamais « mat raté »', () => {
    const [rec] = replayRecords('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['Ra8#']);
    const m = buildMoveEval(rec, { cpWhite: 9999, mate: 1, bestLan: 'a1a8', pv: ['a1a8'] }, { cpWhite: 10000, mate: 0, bestLan: null, pv: [] }, []);
    expect(m.category).toBe('excellent');
    expect(m.motifs).toEqual([]);
  });
});

describe('coach', () => {
  it('construit une évaluation de coup et sélectionne des moments clés', () => {
    const records = replayRecords(START_FEN, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5', 'Qg5', 'Nxf7', 'Qxg2', 'Rf1', 'Qxe4+', 'Be2', 'Nf3#']);
    const evalsWhite = [20, 30, 30, 30, 30, 20, 100, -50, -50, -400, -400, -900, -900, -10000, -10000];
    const moves = records.map((r, i) =>
      buildMoveEval(r, { cpWhite: evalsWhite[i], mate: null, bestLan: i === 6 ? 'c3' : null, pv: [] }, { cpWhite: evalsWhite[i + 1], mate: null, bestLan: null, pv: [] }, records.slice(0, i)),
    );
    expect(moves).toHaveLength(14);
    const km = selectKeyMoments(moves, 'w');
    expect(km.length).toBeGreaterThanOrEqual(3);
    expect(km.length).toBeLessThanOrEqual(5);
    for (const k of km) {
      expect(k.color).toBe('w');
      expect(k.adviceText.length).toBeGreaterThan(10);
      expect(k.adviceText).not.toContain('{');
    }
    const s = summarize(moves, 'w', (l) => Math.max(0, 100 - 2 * l));
    expect(s.blunders).toBeGreaterThanOrEqual(1);
    expect(s.accuracy).toBeLessThan(100);
  });
  it('formate les évaluations', () => {
    expect(formatEval(123)).toBe('+1.2');
    expect(formatEval(-50)).toBe('-0.5');
    expect(formatEval(9998)).toBe('M2');
    expect(formatEval(-9997)).toBe('-M3');
    expect(fill('Ton {piece} {square}', { piece: 'fou', square: 'c4' })).toBe('Ton fou c4');
  });
});
