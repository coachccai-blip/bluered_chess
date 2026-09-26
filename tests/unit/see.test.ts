import { describe, expect, it } from 'vitest';
import { computeAttacks } from '../../src/chess/attacks';
import { staticExchange } from '../../src/chess/see';

describe('échange statique', () => {
  it('capture gratuite = valeur de la victime', () => {
    const fen = '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1';
    expect(staticExchange(computeAttacks(fen).map, 'd5', 'w', 'n')).toBe(320);
  });
  it('tour contre cavalier défendu = perdant', () => {
    const fen = '4k3/4p3/3n4/8/8/8/8/3RK3 w - - 0 1';
    // Rxd6 exd6 : +320 -500 = -180
    expect(staticExchange(computeAttacks(fen).map, 'd6', 'w', 'n')).toBe(-180);
  });
  it('rien à capturer sans attaquant', () => {
    const fen = '4k3/8/8/3n4/8/8/8/4K3 w - - 0 1';
    expect(staticExchange(computeAttacks(fen).map, 'd5', 'w', 'n')).toBe(0);
  });
});
