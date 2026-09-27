import { describe, expect, it } from 'vitest';
import { applyResult, ensureRatings, ratingFor, withStartingLevel } from '../../src/progress/ratings';
import { DEFAULT_PROFILE } from '../../src/data/models';
import { explorationComment, neutral, positionWords } from '../../src/analysis/explain';
import { useGame } from '../../src/store/gameStore';

describe('Elo par cadence', () => {
  it('migre un ancien profil et garde un classement par cadence', () => {
    const old = { ...DEFAULT_PROFILE, estimatedElo: 1200, eloHistory: [{ date: 1, elo: 1200 }], recommendedBotElo: 1250, streak: { wins: 1, losses: 0 } };
    const p = ensureRatings(old);
    expect(p.ratings!.unlimited.elo).toBe(1200);
    expect(p.ratings!.unlimited.history).toHaveLength(1);
    expect(p.ratings!.blitz.elo).toBe(1200);
    expect(p.ratings!.blitz.history).toHaveLength(0);
    expect(ratingFor(p, 'rapid').recommendedBotElo).toBe(1250);
    const start = withStartingLevel(DEFAULT_PROFILE, 800);
    expect(ratingFor(start, 'blitz').recommendedBotElo).toBe(800);
    expect(start.estimatedElo).toBe(800);
  });
  it('une victoire en blitz ne change que le classement blitz', () => {
    const p = ensureRatings({ ...DEFAULT_PROFILE, estimatedElo: 1000, recommendedBotElo: 1000 });
    const r = applyResult(p, 'blitz', 1000, 1, 5);
    expect(r.before).toBe(1000);
    expect(r.after).toBe(1016);
    expect(r.profile.ratings!.blitz.elo).toBe(1016);
    expect(r.profile.ratings!.unlimited.elo).toBe(1000);
    expect(r.profile.estimatedElo).toBe(1000);
    const r2 = applyResult(r.profile, 'unlimited', 1000, 0, 6);
    expect(r2.profile.estimatedElo).toBe(984);
    expect(r2.profile.eloHistory).toEqual([{ date: 6, elo: 984 }]);
  });
});

describe('pendules', () => {
  it('décompte le camp au trait et déclare la perte au temps', () => {
    useGame.getState().newGame({ mode: 'human', timeControl: 'blitz' });
    expect(useGame.getState().clocks).toEqual({ w: 300000, b: 300000 });
    useGame.getState().tick(1000); // aucun coup joué : pas de décompte
    expect(useGame.getState().clocks!.w).toBe(300000);
    useGame.getState().playMove('e4');
    useGame.getState().tick(1500); // trait aux Noirs
    expect(useGame.getState().clocks!.b).toBe(298500);
    expect(useGame.getState().clocks!.w).toBe(300000);
    useGame.getState().tick(10_000_000);
    expect(useGame.getState().status).toMatchObject({ over: true, result: '1-0', reason: 'timeout' });
    useGame.getState().newGame({ mode: 'human' });
    expect(useGame.getState().clocks).toBeNull();
  });
});

describe('exploration', () => {
  it('commente la position et le meilleur coup en termes neutres', () => {
    expect(positionWords(0)).toBe('La position est équilibrée');
    expect(positionWords(-400)).toBe('Le Rouge est en train de gagner');
    expect(neutral('sauve ton cavalier et protège ta tour')).toBe('sauve le cavalier et protège la tour');
    const c = explorationComment(20, 'Nf3', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'g1f3');
    expect(c).toBe('Trait au Bleu. La position est équilibrée. Meilleur coup : Cavalier f3 : sort le cavalier.');
  });
});
