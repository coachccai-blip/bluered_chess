import { describe, expect, it } from 'vitest';
import { assessMoveRisk } from '../../src/analysis/risk';
import { DRILL_INTERVALS_DAYS, drillsFromAnalysis, dueDrills, isMastered, nextReview } from '../../src/progress/drills';
import { evaluateGoal, fastMistakes, goalFor } from '../../src/progress/goals';
import type { Analysis, Game } from '../../src/data/models';
import type { MoveEval } from '../../src/analysis/coach';

describe('filet anti-gaffe', () => {
  it('signale une pièce laissée en prise et un mat en 1 permis', () => {
    // Cd5 dans le pion e6.
    const r = assessMoveRisk('4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1', 'c3d5');
    expect(r?.severity).toBe('piece');
    expect(r?.reasons[0]).toContain('ton cavalier en d5');
    // Kh1 permet Ta1#.
    const m = assessMoveRisk('6k1/5ppp/8/8/8/8/r4PPP/6K1 w - - 0 1', 'g1h1');
    expect(m?.severity).toBe('mate');
    // Coup sûr.
    expect(assessMoveRisk('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')).toBeNull();
    expect(assessMoveRisk('4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1', 'c3d5', 'off')).toBeNull();
  });
  it('un pion en prise n\'alerte qu\'au niveau « tout »', () => {
    // e4 sous le contrôle du pion d5 noir sans défense blanche... : d2-d4 face au pion e5 est défendu ; utilisons a2-a4 face à un fou b3? Simplifions : pion blanc joué en b5 attaqué par le pion a6.
    const fen = '4k3/8/p7/8/8/8/1P6/4K3 w - - 0 1';
    expect(assessMoveRisk(fen, 'b2b4', 'blunders')).toBeNull();
    expect(assessMoveRisk('4k3/8/p7/8/1P6/8/8/4K3 b - - 0 1', 'a6a5', 'all')?.severity).toBe('pawn');
  });
});

function mk(partial: Partial<MoveEval>): MoveEval {
  return { ply: 1, san: 'e4', lan: 'e2e4', color: 'w', fenBefore: 'f', fenAfter: 'f', evalBefore: 0, evalAfter: 0, bestMove: 'd4', bestMoveLan: 'd2d4', winProbLoss: 0, category: 'excellent', motifs: [], phase: 'opening', ...partial };
}
const game: Game = { id: 'g', createdAt: 1, playerColor: 'blue', botElo: 1000, result: '0-1', pgn: '', startFen: '', sans: [], durationSec: 1, thinkTimes: [1000, 5000, 2000, 5000] };
const analysis: Analysis = {
  id: 'a', gameId: 'g', createdAt: 1, engineDepth: 10, accuracy: 70, keyMoments: [],
  moves: [mk({ ply: 1, category: 'blunder', motifs: [{ motif: 'hanging_piece', data: {} }] }), mk({ ply: 2, color: 'b' }), mk({ ply: 3, category: 'mistake' }), mk({ ply: 4, color: 'b' })],
  summary: { accuracy: 70, blunders: 1, mistakes: 1, inaccuracies: 0, weakestPhase: null, phaseAccuracy: { opening: null, middlegame: null, endgame: null }, strength: '', weakness: '', categoryCounts: { excellent: 0, good: 0, inaccuracy: 0, mistake: 1, blunder: 1, mate_missed: 0 } },
};

describe('répétition espacée', () => {
  it('planifie 1, 3, 7, 14, 30 jours et repart à zéro après un échec', () => {
    const now = 0;
    const day = 86400000;
    let s = nextReview(0, true, now);
    expect(s).toEqual({ box: 1, due: day });
    s = nextReview(s.box, true, now);
    expect(s.due).toBe(3 * day);
    s = nextReview(4, true, now);
    expect(s).toEqual({ box: 5, due: 30 * day });
    expect(nextReview(3, false, now)).toEqual({ box: 0, due: day });
    expect(DRILL_INTERVALS_DAYS).toHaveLength(5);
  });
  it('crée une fiche par erreur du joueur et liste celles à réviser', () => {
    const drills = drillsFromAnalysis(game, analysis, 100);
    expect(drills).toHaveLength(2);
    expect(drills[0].bestMove).toBe('d4');
    expect(drills[0].motif).toBe('hanging_piece');
    expect(dueDrills(drills, 100)).toHaveLength(2);
    expect(dueDrills(drills, 50)).toHaveLength(0);
    expect(isMastered({ ...drills[0], box: 5 })).toBe(true);
  });
});

describe('objectif de partie et temps de réflexion', () => {
  it('évalue l\'objectif sur l\'analyse', () => {
    const goal = goalFor('hanging')!;
    expect(goal.label).toContain('pièce en prise');
    const r = evaluateGoal(goal, game, analysis);
    expect(r.achieved).toBe(false);
    expect(evaluateGoal(goalFor('opening')!, game, { ...analysis, moves: [mk({ ply: 1 })] }).achieved).toBe(true);
    expect(goalFor('inconnu')?.key).toBe('inconnu');
  });
  it('compte les erreurs jouées trop vite', () => {
    expect(fastMistakes(analysis, game.thinkTimes, 'w')).toEqual({ fast: 2, total: 2 });
    expect(fastMistakes(analysis, undefined, 'w')).toEqual({ fast: 0, total: 0 });
  });
});
