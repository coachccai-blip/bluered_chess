import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { computeAttacks, findForks, findPins, isAbsolutelyPinned, parseFenBoard, attackedSquaresOf } from '../../src/chess/attacks';
import { ALL_SQUARES, type Color } from '../../src/chess/types';
import { TEST_FENS } from './fens';

describe('carte d\'attaques maison vs chess.js attackers()', () => {
  for (const fen of TEST_FENS) {
    it(`concorde case par case pour ${fen}`, () => {
      const c = new Chess(fen);
      const { map } = computeAttacks(fen);
      for (const sq of ALL_SQUARES) {
        for (const color of ['w', 'b'] as Color[]) {
          const expected = [...c.attackers(sq, color)].sort();
          const actual = map[sq][color].map((a) => a.from).sort();
          expect(actual, `${sq} ${color}`).toEqual(expected);
        }
      }
    });
  }
});

describe('cas limites', () => {
  it('un pion en bord d\'échiquier n\'attaque qu\'une case', () => {
    const board = parseFenBoard('8/8/8/8/8/8/P7/8 w - - 0 1');
    const p = board[1][0]!;
    expect(attackedSquaresOf(board, p)).toEqual(['b3']);
  });
  it('les pions n\'attaquent jamais la case devant eux', () => {
    const { map } = computeAttacks('8/8/8/8/8/8/4P3/8 w - - 0 1');
    expect(map.e3.w).toHaveLength(0);
    expect(map.d3.w).toHaveLength(1);
    expect(map.f3.w).toHaveLength(1);
  });
  it('une pièce clouée attaque quand même par défaut, mais pas en mode réaliste', () => {
    // Fou blanc e2 cloué par la tour noire e8 sur le roi e1.
    const fen = '4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1';
    expect(computeAttacks(fen).map.d3.w.map((a) => a.from)).toContain('e2');
    expect(computeAttacks(fen, { ignorePinned: true }).map.d3.w).toHaveLength(0);
    expect(isAbsolutelyPinned(parseFenBoard(fen), parseFenBoard(fen)[1][4]!)).toBe(true);
  });
  it('la défense d\'une pièce alliée compte comme contrôle', () => {
    const { map } = computeAttacks('8/8/8/8/8/8/3PP3/8 w - - 0 1');
    // Le pion d2 « défend » e3 ; le pion e2 « attaque » d3 et f3.
    expect(map.e3.w.map((a) => a.from)).toEqual(['d2']);
  });
  it('rayons X : tour derrière tour compte en option', () => {
    const fen = '8/8/8/8/8/8/8/RR5k w - - 0 1';
    expect(computeAttacks(fen).map.h1.w).toHaveLength(1);
    expect(computeAttacks(fen, { xray: true }).map.h1.w).toHaveLength(2);
  });
  it('détecte une pièce en prise non défendue', () => {
    const { hanging } = computeAttacks('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1');
    expect(hanging.map((h) => h.square)).toEqual(['d5']);
    expect(hanging[0].reason).toBe('undefended');
  });
  it('détecte une pièce attaquée par une pièce de moindre valeur', () => {
    const { hanging } = computeAttacks('4k3/8/4p3/3q4/4P3/8/8/4K3 b - - 0 1');
    const q = hanging.find((h) => h.square === 'd5');
    expect(q?.reason).toBe('lower-value-attacker');
  });
  it('liste les pièces pendantes (non défendues, non attaquées)', () => {
    const { loose } = computeAttacks('4k3/8/8/8/8/8/8/N3K3 w - - 0 1');
    expect(loose.map((p) => p.square)).toEqual(['a1']);
  });
  it('les cases contestées sont attaquées par les deux camps', () => {
    const { contested } = computeAttacks('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(contested).toEqual([]);
    const r = computeAttacks('4k3/8/8/8/3r4/8/8/3RK3 w - - 0 1');
    expect(r.contested).toContain('d2');
  });
});

describe('motifs géométriques', () => {
  it('trouve un clouage absolu', () => {
    const board = parseFenBoard('4k3/8/8/8/8/8/4n3/4K2R b - - 0 1');
    const pins = findPins(board, 'b');
    // Tour h1... non alignée. Testons une vraie ligne : fou blanc b5, cavalier noir c6, roi noir d7.
    expect(pins).toEqual([]);
    const board2 = parseFenBoard('8/3k4/2n5/1B6/8/8/8/4K3 b - - 0 1');
    const pins2 = findPins(board2, 'b');
    expect(pins2).toHaveLength(1);
    expect(pins2[0].pinned.square).toBe('c6');
    expect(pins2[0].absolute).toBe(true);
  });
  it('trouve une fourchette de cavalier', () => {
    const fen = 'r3k3/8/8/8/3N4/8/8/4K3 w - - 0 1';
    // Le cavalier d4 n'attaque ni a8 ni e8. Plaçons-le en c7 : fourchette roi e8 + tour a8.
    const fen2 = 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1';
    const b1 = parseFenBoard(fen);
    expect(findForks(b1, computeAttacks(fen).map, 'w')).toHaveLength(0);
    const b2 = parseFenBoard(fen2);
    const forks = findForks(b2, computeAttacks(fen2).map, 'w');
    expect(forks).toHaveLength(1);
    expect(forks[0].targets.map((t) => t.square).sort()).toEqual(['a8', 'e8']);
  });
});
