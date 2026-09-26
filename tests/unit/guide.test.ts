import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES, puzzlesByTheme } from '../../src/progress/puzzles';
import { computeAttacks, findForks, parseFenBoard } from '../../src/chess/attacks';
import { WEAKNESS_GUIDES, diagnosis, rankWeaknesses } from '../../src/progress/weaknessGuide';
import { INDICATORS } from '../../src/progress/profile';
import type { Square } from '../../src/chess/types';

describe('puzzles intégrés', () => {
  it('chaque solution est légale et correspond à son thème', () => {
    for (const p of PUZZLES) {
      const c = new Chess(p.fen);
      const before = computeAttacks(p.fen);
      const m = c.move(p.solution);
      expect(m, `${p.id} : coup illégal`).toBeTruthy();
      if (p.theme === 'mate1') expect(c.isCheckmate(), `${p.id} : pas mat`).toBe(true);
      if (p.theme === 'hanging') {
        expect(m.captured, `${p.id} : pas une capture`).toBeTruthy();
        expect(before.hanging.some((h) => h.square === m.to && h.color !== m.color), `${p.id} : la pièce n'était pas en prise`).toBe(true);
      }
      if (p.theme === 'fork') {
        const fen = c.fen();
        const forks = findForks(parseFenBoard(fen), computeAttacks(fen).map, m.color).filter((f) => f.by.square === (m.to as Square));
        expect(forks.length, `${p.id} : pas de fourchette après le coup`).toBeGreaterThan(0);
      }
    }
    expect(puzzlesByTheme('mate1').length).toBeGreaterThanOrEqual(3);
  });
});

describe('programmes par faiblesse', () => {
  it('chaque indicateur a un programme complet', () => {
    for (const d of INDICATORS) {
      const g = WEAKNESS_GUIDES[d.key];
      expect(g.method.length).toBeGreaterThanOrEqual(3);
      expect(g.actions.length).toBeGreaterThanOrEqual(3);
      expect(g.routine.length).toBeGreaterThan(10);
    }
  });
  it('classe les faiblesses de la plus marquée à la moins marquée', () => {
    const ranked = rankWeaknesses({ hanging: 8, tactics: 1, endgame: 60, opening: 95 });
    expect(ranked[0].key).toBe('hanging');
    expect(ranked[0].alert).toBe(true);
    expect(ranked[1].key).toBe('endgame');
    expect(ranked.at(-1)!.value).toBeUndefined();
    expect(diagnosis(ranked[0])).toContain('8 /100 coups, au-dessus du seuil de 3');
    expect(diagnosis(ranked.at(-1)!)).toContain('Pas encore assez');
  });
});
