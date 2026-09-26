import { describe, expect, it } from 'vitest';
import { expectedScore, performanceRating, recommendBot, updateElo, updateStreak } from '../../src/progress/elo';
import { computeIndicators, isAlert, radarScore, INDICATORS, resultScore } from '../../src/progress/profile';
import { generatePlan, shouldRegeneratePlan } from '../../src/progress/trainingPlan';
import { blindfoldScore, countAttackersQuestion, knightSquaresQuestion } from '../../src/progress/exercises';
import type { Analysis, Game } from '../../src/data/models';
import type { MoveEval } from '../../src/analysis/coach';

describe('Elo maison', () => {
  it('formule classique K=32', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(updateElo(1000, 1000, 1)).toBe(1016);
    expect(updateElo(1000, 1000, 0)).toBe(984);
    expect(updateElo(1000, 1200, 1)).toBeGreaterThan(1016);
    expect(performanceRating(1500, 0.5)).toBe(1500);
    expect(performanceRating(1500, 0.76)).toBeGreaterThan(1690);
  });
  it('recommande +50 après deux victoires, -50 après deux défaites', () => {
    expect(recommendBot(1000, { wins: 2, losses: 0 }, 1000)).toBe(1050);
    expect(recommendBot(1000, { wins: 0, losses: 2 }, 1000)).toBe(950);
    expect(recommendBot(1000, { wins: 1, losses: 0 }, 1000)).toBe(1000);
    expect(recommendBot(1800, { wins: 5, losses: 0 }, 1800)).toBe(1800);
    expect(updateStreak({ wins: 1, losses: 0 }, 1)).toEqual({ wins: 2, losses: 0 });
    expect(updateStreak({ wins: 1, losses: 0 }, 0.5)).toEqual({ wins: 0, losses: 0 });
  });
});

function mkMove(partial: Partial<MoveEval>): MoveEval {
  return {
    ply: 1,
    san: 'e4',
    lan: 'e2e4',
    color: 'w',
    fenBefore: '',
    fenAfter: '',
    evalBefore: 0,
    evalAfter: 0,
    bestMove: null,
    bestMoveLan: null,
    winProbLoss: 0,
    category: 'excellent',
    motifs: [],
    phase: 'opening',
    ...partial,
  };
}

function mkPair(id: string, moves: MoveEval[], result: Game['result'] = '1-0'): { game: Game; analysis: Analysis } {
  const game: Game = { id, createdAt: Date.now(), playerColor: 'blue', botElo: 1000, result, pgn: '', startFen: '', sans: moves.map((m) => m.san), durationSec: 60 };
  const analysis: Analysis = {
    id: `a-${id}`,
    gameId: id,
    createdAt: Date.now(),
    engineDepth: 12,
    accuracy: 80,
    moves,
    keyMoments: [],
    summary: { accuracy: 80, blunders: 0, mistakes: 0, inaccuracies: 0, weakestPhase: null, phaseAccuracy: { opening: null, middlegame: null, endgame: null }, strength: '', weakness: '', categoryCounts: { excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, mate_missed: 0 } },
  };
  return { game, analysis };
}

describe('profil de faiblesses', () => {
  it('calcule les indicateurs pour 100 coups', () => {
    const moves: MoveEval[] = [];
    for (let i = 1; i <= 40; i++) {
      const mine = i % 2 === 1;
      moves.push(
        mkMove({
          ply: i,
          color: mine ? 'w' : 'b',
          phase: i > 30 ? 'endgame' : i > 20 ? 'middlegame' : 'opening',
          winProbLoss: mine && i === 5 ? 30 : 1,
          category: mine && i === 5 ? 'blunder' : 'excellent',
          motifs: mine && i === 5 ? [{ motif: 'hanging_piece', data: {} }] : [],
        }),
      );
    }
    const ind = computeIndicators([mkPair('g1', moves)]);
    expect(ind.hanging).toBe(5); // 1 gaffe pour 20 coups joués = 5 / 100
    expect(ind.opening).toBeLessThan(100);
    expect(ind.endgame).toBeGreaterThan(90);
    expect(isAlert(INDICATORS[0], ind.hanging)).toBe(true);
    expect(radarScore(INDICATORS[0], 0)).toBe(100);
    expect(resultScore({ result: '0-1', playerColor: 'red' })).toBe(1);
  });
  it('génère un plan sur les 2 indicateurs les plus faibles', () => {
    const plan = generatePlan({ hanging: 8, tactics: 1, endgame: 60, opening: 95 }, [], 5);
    expect(plan.targets).toEqual(['hanging', 'endgame']);
    expect(plan.exercises.length).toBeGreaterThanOrEqual(4);
    expect(plan.exercises.every((e) => e.minutes > 0)).toBe(true);
    expect(shouldRegeneratePlan(undefined, 1)).toBe(true);
    expect(shouldRegeneratePlan(plan, 7)).toBe(false);
    expect(shouldRegeneratePlan(plan, 10)).toBe(true);
  });
});

describe('exercices internes', () => {
  it('questions de visualisation et de comptage', () => {
    const q = knightSquaresQuestion(() => 0.3);
    expect(q.answer.length).toBeGreaterThan(0);
    const c = countAttackersQuestion(() => 0.3);
    expect(c.blue + c.red).toBeGreaterThanOrEqual(2);
    expect(blindfoldScore(['a1', 'b2'], ['a1', 'b2'])).toBe(100);
    expect(blindfoldScore(['a1'], ['a1', 'b2'])).toBe(50);
    expect(blindfoldScore([], ['a1'])).toBe(0);
  });
});
