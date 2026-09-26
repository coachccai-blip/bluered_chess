// Petit livre d'ouverture pondéré pour que les bots faibles ne jouent pas n'importe quoi au 1er coup.
// Chaque ligne : suite de SAN depuis la position initiale + poids.
export interface BookLine {
  sans: string[];
  weight: number;
  /** Elo minimal pour utiliser cette ligne (les lignes « théoriques » sont réservées aux bots plus forts). */
  minElo: number;
}

export const OPENING_BOOK: BookLine[] = [
  { sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6'], weight: 10, minElo: 800 },
  { sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'], weight: 8, minElo: 1100 },
  { sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'O-O', 'd6'], weight: 8, minElo: 800 },
  { sans: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3', 'Be7'], weight: 5, minElo: 900 },
  { sans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], weight: 6, minElo: 1200 },
  { sans: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5', 'g6', 'O-O', 'Bg7'], weight: 4, minElo: 1300 },
  { sans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7'], weight: 4, minElo: 1000 },
  { sans: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'], weight: 4, minElo: 1000 },
  { sans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O'], weight: 7, minElo: 1000 },
  { sans: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4'], weight: 4, minElo: 1200 },
  { sans: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O'], weight: 5, minElo: 1200 },
  { sans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'], weight: 5, minElo: 1300 },
  { sans: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'c5'], weight: 6, minElo: 800 },
  { sans: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'c5'], weight: 5, minElo: 800 },
  { sans: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5'], weight: 3, minElo: 900 },
  { sans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5', 'Be3', 'Qf6'], weight: 4, minElo: 1000 },
  { sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5'], weight: 3, minElo: 1300 },
  { sans: ['c4', 'e5', 'Nc3', 'Nf6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2'], weight: 3, minElo: 1300 },
  { sans: ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'e6', 'O-O', 'Be7'], weight: 3, minElo: 1200 },
  { sans: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6'], weight: 3, minElo: 900 },
  { sans: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6'], weight: 3, minElo: 800 },
  { sans: ['e4', 'e5', 'Bc4', 'Nf6', 'd3', 'c6', 'Nf3', 'd5'], weight: 3, minElo: 800 },
];

/**
 * Renvoie un coup du livre compatible avec l'historique (SAN depuis la position initiale), ou null.
 * `rng` dans [0,1) permet des tests déterministes.
 */
export function bookMove(history: string[], elo: number, rng: () => number = Math.random): string | null {
  const candidates = OPENING_BOOK.filter(
    (l) => l.minElo <= elo && l.sans.length > history.length && history.every((s, i) => l.sans[i] === s),
  );
  if (candidates.length === 0) return null;
  const total = candidates.reduce((a, l) => a + l.weight, 0);
  let r = rng() * total;
  for (const l of candidates) {
    r -= l.weight;
    if (r <= 0) return l.sans[history.length];
  }
  return candidates[candidates.length - 1].sans[history.length];
}
