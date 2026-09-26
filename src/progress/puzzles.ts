// Puzzles intégrés (hors ligne), classés par thème. Solutions vérifiées par les tests unitaires.
export type PuzzleTheme = 'mate1' | 'hanging' | 'fork';

export interface Puzzle {
  id: string;
  theme: PuzzleTheme;
  fen: string;
  /** Solution en SAN. Pour les mats, tout coup qui mate est accepté. */
  solution: string;
  hint: string;
}

export const PUZZLES: Puzzle[] = [
  { id: 'm1', theme: 'mate1', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', solution: 'Ra8#', hint: 'Le roi noir est enfermé par ses propres pions : la dernière rangée est faible.' },
  { id: 'm2', theme: 'mate1', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', solution: 'Qxf7#', hint: 'Deux pièces visent f7, défendu seulement par le roi.' },
  { id: 'm3', theme: 'mate1', fen: '6k1/pp3ppp/8/8/8/8/PP3PPP/3R2K1 w - - 0 1', solution: 'Rd8#', hint: 'Encore la dernière rangée : la tour arrive avec échec.' },
  { id: 'm4', theme: 'mate1', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', solution: 'Nf7#', hint: 'Mat étouffé : le roi est bloqué par sa tour et ses pions.' },
  { id: 'h1', theme: 'hanging', fen: '4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', solution: 'Rxd5', hint: 'Une pièce noire est attaquée et personne ne la défend.' },
  { id: 'h2', theme: 'hanging', fen: '4k3/pp3ppp/8/3q4/8/8/PP3PPP/3R2K1 w - - 0 1', solution: 'Rxd5', hint: 'La dame est sur la colonne de ta tour, sans protection.' },
  { id: 'h3', theme: 'hanging', fen: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', solution: 'Nxh4', hint: 'La dame noire est sortie trop tôt, sur une case attaquée.' },
  { id: 'h4', theme: 'hanging', fen: '4k3/8/8/2b5/8/8/8/2R1K3 w - - 0 1', solution: 'Rxc5', hint: 'Regarde la colonne c.' },
  { id: 'f1', theme: 'fork', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', solution: 'Nc7+', hint: 'Le cavalier peut donner échec et attaquer la tour en même temps.' },
  { id: 'f2', theme: 'fork', fen: '4k3/8/8/2n1b3/8/8/3P4/4K3 w - - 0 1', solution: 'd4', hint: 'Un simple pion peut attaquer deux pièces à la fois.' },
  { id: 'f3', theme: 'fork', fen: '6k1/3q4/8/8/4N3/8/8/4K3 w - - 0 1', solution: 'Nf6+', hint: 'Cherche la case d\'où le cavalier touche le roi et la dame.' },
];

export function puzzlesByTheme(theme: PuzzleTheme): Puzzle[] {
  return PUZZLES.filter((p) => p.theme === theme);
}
