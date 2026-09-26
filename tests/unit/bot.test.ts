import { describe, expect, it } from 'vitest';
import { chooseHybridMove, pickIndex, softmaxProbabilities, thinkingDelayMs } from '../../src/engine/bot';
import { BOT_PROFILES, profileFor } from '../../src/engine/botProfiles';
import { bookMove } from '../../src/engine/openingBook';
import { parseInfo, lineScore } from '../../src/engine/engineClient';
import { START_FEN } from '../../src/chess/game';

describe('profils de bots', () => {
  it('21 profils de 800 à 1800 par pas de 50', () => {
    expect(BOT_PROFILES).toHaveLength(21);
    expect(BOT_PROFILES.map((p) => p.elo)).toEqual(Array.from({ length: 21 }, (_, i) => 800 + 50 * i));
    expect(profileFor(1234).elo).toBe(1250);
    expect(profileFor(100).elo).toBe(800);
    expect(profileFor(5000).elo).toBe(1800);
  });
  it('les profils natifs sont à 1350 ou plus', () => {
    for (const p of BOT_PROFILES) expect(p.mode === 'native').toBe(p.elo >= 1350);
  });
});

describe('softmax', () => {
  it('température basse favorise le meilleur coup', () => {
    const p = softmaxProbabilities([100, 0, -100], 10);
    expect(p[0]).toBeGreaterThan(0.99);
  });
  it('température haute aplatit la distribution', () => {
    const p = softmaxProbabilities([100, 0, -100], 10000);
    expect(p[0] - p[2]).toBeLessThan(0.02);
  });
  it('pickIndex respecte la distribution', () => {
    expect(pickIndex([0.2, 0.3, 0.5], () => 0.1)).toBe(0);
    expect(pickIndex([0.2, 0.3, 0.5], () => 0.45)).toBe(1);
    expect(pickIndex([0.2, 0.3, 0.5], () => 0.99)).toBe(2);
  });
});

describe('parse UCI', () => {
  it('lit une ligne info', () => {
    const l = parseInfo('info depth 12 seldepth 18 multipv 2 score cp -35 nodes 1234 nps 100 pv e7e5 g1f3 b8c6');
    expect(l).toEqual({ multipv: 2, cp: -35, mate: undefined, depth: 12, pv: ['e7e5', 'g1f3', 'b8c6'] });
    expect(lineScore({ mate: 2 })).toBe(9998);
    expect(lineScore({ mate: -1 })).toBe(-9999);
  });
  it('ignore les bornes', () => {
    expect(parseInfo('info depth 5 score cp 10 lowerbound pv e2e4')).toBeNull();
  });
});

describe('livre d\'ouverture', () => {
  it('propose un premier coup et suit une ligne', () => {
    expect(bookMove([], 800, () => 0)).toBeTruthy();
    expect(bookMove(['e4', 'e5', 'Nf3'], 800, () => 0)).toBe('Nc6');
    expect(bookMove(['a4'], 800)).toBeNull();
  });
  it('réserve les lignes théoriques aux bots plus forts', () => {
    expect(bookMove(['e4', 'c5', 'Nf3', 'd6'], 800)).toBeNull();
    expect(bookMove(['e4', 'c5', 'Nf3', 'd6'], 1300)).toBe('d4');
  });
});

describe('choix hybride', () => {
  const lines = [
    { multipv: 1, cp: 50, depth: 4, pv: ['e2e4'] },
    { multipv: 2, cp: 30, depth: 4, pv: ['d2d4'] },
    { multipv: 3, cp: -400, depth: 4, pv: ['f2f3'] },
  ];
  it('un bot fort sans bruit joue le meilleur coup', () => {
    const profile = { ...profileFor(1300), blunderRate: 0, pieceValueNoise: 0, aggression: 0, temperature: 1 };
    const c = chooseHybridMove(START_FEN, lines, profile, () => 0.5);
    expect(c?.lan).toBe('e2e4');
    expect(c?.source).toBe('engine');
  });
  it('une gaffe choisit un coup hors liste', () => {
    const profile = { ...profileFor(800), blunderRate: 1 };
    const c = chooseHybridMove(START_FEN, lines, profile, () => 0.01);
    expect(c?.source).toBe('blunder');
    expect(['e2e4', 'd2d4', 'f2f3']).not.toContain(c?.lan);
  });
  it('un bot >= 1200 ne gaffe jamais un mat en 1 adverse', () => {
    // Blancs au trait ; g1h1 permet Ta1#, h2h3 non.
    const fen = '6k1/5ppp/8/8/8/8/r4PPP/6K1 w - - 0 1';
    const profile = { ...profileFor(1200), blunderRate: 1 };
    const only = [{ multipv: 1, cp: 0, depth: 4, pv: ['h2h3'] }, { multipv: 2, cp: 0, depth: 4, pv: ['g2g3'] }, { multipv: 3, cp: 0, depth: 4, pv: ['h2h4'] }, { multipv: 4, cp: 0, depth: 4, pv: ['g2g4'] }, { multipv: 5, cp: 0, depth: 4, pv: ['f2f3'] }, { multipv: 6, cp: 0, depth: 4, pv: ['f2f4'] }];
    for (let i = 0; i < 20; i++) {
      const c = chooseHybridMove(fen, only, profile, () => (i % 10) / 10);
      expect(c?.lan).not.toBe('g1h1');
    }
  });
  it('joue le mat en 1 quand il est listé', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const withMate = [{ multipv: 1, mate: 1, depth: 4, pv: ['a1a8'] }, { multipv: 2, cp: 200, depth: 4, pv: ['a1a7'] }];
    const profile = { ...profileFor(1000), blunderRate: 0 };
    expect(chooseHybridMove(fen, withMate, profile, () => 0.99)?.lan).toBe('a1a8');
  });
  it('délai de réflexion entre 0,5 et 2,5 s', () => {
    for (const p of BOT_PROFILES) {
      const d = thinkingDelayMs(p, () => 0.999);
      expect(d).toBeGreaterThanOrEqual(500);
      expect(d).toBeLessThanOrEqual(2500);
    }
  });
});
