import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { OPENINGS, openingAnnouncement, openingForFen, openingForGame, openingLabel } from '../../src/chess/openings';

describe('base d\'ouvertures', () => {
  it('toutes les lignes sont des suites de coups légales', () => {
    for (const o of OPENINGS) {
      const c = new Chess();
      for (const san of o.moves.split(' ')) expect(() => c.move(san), `${o.name} : ${o.moves}`).not.toThrow();
    }
  });
  it('reconnaît une ouverture et sa variante, y compris par transposition', () => {
    const najdorf = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    const m = openingForGame(najdorf)!;
    expect(m.name).toBe('Défense sicilienne');
    expect(m.variation).toBe('variante Najdorf');
    expect(m.atPly).toBe(10);
    // Transposition : Londres par d4, Cf6, Ff4, d5 aboutit à la même position que d4 d5 Ff4 Cf6.
    const c = new Chess();
    for (const s of ['d4', 'Nf6', 'Bf4', 'd5', 'e3']) c.move(s);
    expect(openingForFen(c.fen())?.name).toBe('Système de Londres');
    expect(openingLabel(m)).toBe('Défense sicilienne, variante Najdorf');
  });
  it('annonce seulement quand le nom change', () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];
    expect(openingAnnouncement(sans, 1)?.name).toBe('Ouverture du pion roi');
    expect(openingAnnouncement(sans, 2)).toBeNull(); // même nom qu'au coup 1
    expect(openingAnnouncement(sans, 5)?.name).toBe('Partie espagnole (Ruy Lopez)');
    expect(openingAnnouncement(sans, 6)).toBeNull(); // a6 seul ne change rien
    expect(openingAnnouncement(sans, 7)?.variation).toBe('variante Morphy');
    expect(openingAnnouncement(sans, 10)?.variation).toBe('variante fermée');
    expect(openingForGame(['a4', 'h5'])).toBeNull();
  });
});
