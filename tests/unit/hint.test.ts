import { describe, expect, it } from 'vitest';
import { buildHint, nullMoveFen } from '../../src/analysis/hint';

describe('indice progressif', () => {
  it('construit un coup nul sauf en cas d\'échec', () => {
    expect(nullMoveFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
    expect(nullMoveFen('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1')).toBeNull(); // roi noir en échec
  });
  it('explique le meilleur coup : but, menace parée, alternatives, bilan', () => {
    // Cavalier blanc d5 attaqué par le pion e6 ; Cf4 le sauve. Alternative Ke2 laisse le cavalier.
    const fen = '4k3/8/4p3/3N4/8/8/8/4K3 w - - 0 1';
    const lines = [
      { multipv: 1, cp: 320, depth: 12, pv: ['d5f4', 'e8e7'] },
      { multipv: 2, cp: 0, depth: 12, pv: ['e1e2', 'e6d5'] },
      { multipv: 3, cp: -10, depth: 12, pv: ['e1d2', 'e6d5'] },
    ];
    const threat = [{ multipv: 1, cp: 300, depth: 8, pv: ['e6d5'] }];
    const h = buildHint(fen, lines, threat, true)!;
    expect(h.bestSan).toBe('Nf4');
    expect(h.pieceSquare).toBe('d5');
    expect(h.pieceName).toBe('cavalier');
    expect(h.explanation).toContain('Cavalier f4 sauve ton cavalier qui allait être pris');
    expect(h.threat).toContain("Si tu ne fais rien, l'adversaire joue e prend d5 : il prend ton cavalier en d5 gratuitement");
    expect(h.threat).toContain('Cavalier f4 règle ce problème');
    expect(h.alternatives).toHaveLength(2);
    expect(h.alternatives[0].san).toBe('Ke2');
    expect(h.explanation).toContain('Roi e2 est nettement moins bon');
    expect(h.explanation).toContain('il prend ton cavalier en d5');
    expect(h.explanation).toContain('Après Cavalier f4, tu es en train de gagner.');
    expect(h.line).toEqual(['Nf4', 'Ke7']);
  });
  it('ignore les alternatives équivalentes et renvoie null sans ligne', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const h = buildHint(fen, [{ multipv: 1, cp: 30, depth: 12, pv: ['e2e4'] }, { multipv: 2, cp: 25, depth: 12, pv: ['d2d4'] }], null, true)!;
    expect(h.alternatives).toHaveLength(0);
    expect(h.explanation).toContain('e4 prend le centre');
    expect(buildHint(fen, [], null, true)).toBeNull();
  });
});
