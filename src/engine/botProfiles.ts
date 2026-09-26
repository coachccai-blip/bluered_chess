// 21 profils de bots de 800 à 1800 Elo (section 6 du brief). Recalibrer avec scripts/calibrate.ts.
export type BotMode = 'hybrid' | 'native';

export interface BotProfile {
  elo: number;
  depth: number;
  multiPv: number;
  /** Température du softmax en centipions (hybride uniquement). */
  temperature: number;
  /** Probabilité de jouer un coup légal aléatoire hors MultiPV. */
  blunderRate: number;
  mode: BotMode;
  /** Bonus (cp) accordé aux captures et échecs pour simuler un style agressif. */
  aggression: number;
  /** Bruit ajouté à l'évaluation (cp) pour simuler des échanges mal comptés. */
  pieceValueNoise: number;
  /** Température doublée en finale. */
  endgameWeakness: boolean;
  /** Nombre de coups d'ouverture pris dans le livre. */
  bookPlies: [number, number];
  name: string;
  style: string;
}

const base = (
  elo: number,
  depth: number,
  multiPv: number,
  temperature: number,
  blunderRate: number,
  mode: BotMode,
  name: string,
  style: string,
): BotProfile => ({
  elo,
  depth,
  multiPv,
  temperature,
  blunderRate,
  mode,
  aggression: elo < 1100 ? 40 : elo < 1400 ? 20 : 0,
  pieceValueNoise: elo < 1000 ? 60 : elo < 1200 ? 35 : elo < 1350 ? 15 : 0,
  endgameWeakness: elo < 1100,
  bookPlies: elo < 1000 ? [2, 4] : elo < 1300 ? [4, 8] : [6, 12],
  name,
  style,
});

export const BOT_PROFILES: BotProfile[] = [
  base(800, 1, 8, 220, 0.12, 'hybrid', 'Léo', 'Débutant enthousiaste : laisse souvent des pièces en prise.'),
  base(850, 1, 8, 200, 0.11, 'hybrid', 'Mia', 'Joue vite, oublie de défendre.'),
  base(900, 2, 8, 180, 0.1, 'hybrid', 'Noah', 'Aime attaquer le roi sans préparation.'),
  base(950, 2, 8, 160, 0.09, 'hybrid', 'Zoé', 'Échange volontiers, même à perte.'),
  base(1000, 2, 8, 140, 0.08, 'hybrid', 'Adam', 'Solide en ouverture, fragile en finale.'),
  base(1050, 3, 6, 120, 0.07, 'hybrid', 'Inès', 'Repère les captures, rate les fourchettes.'),
  base(1100, 3, 6, 105, 0.06, 'hybrid', 'Yanis', 'Développe bien, calcule peu.'),
  base(1150, 3, 6, 90, 0.05, 'hybrid', 'Lina', 'Bonne défense, attaque hésitante.'),
  base(1200, 4, 6, 80, 0.04, 'hybrid', 'Hugo', 'Voit les tactiques en 1 coup.'),
  base(1250, 4, 5, 70, 0.03, 'hybrid', 'Chloé', 'Joueuse de club débutante.'),
  base(1300, 5, 5, 60, 0.02, 'hybrid', 'Sacha', 'Rarement de gaffe grossière.'),
  base(1350, 6, 1, 0, 0, 'native', 'Emma', 'Force native Stockfish 1350.'),
  base(1400, 7, 1, 0, 0, 'native', 'Nolan', 'Calcule 2 coups à l\'avance.'),
  base(1450, 8, 1, 0, 0, 'native', 'Jade', 'Bonne technique de finale.'),
  base(1500, 8, 1, 0, 0, 'native', 'Rayan', 'Joueur de club confirmé.'),
  base(1550, 9, 1, 0, 0, 'native', 'Léna', 'Punit les pièces mal placées.'),
  base(1600, 9, 1, 0, 0, 'native', 'Malo', 'Solide, peu de risques.'),
  base(1650, 10, 1, 0, 0, 'native', 'Alice', 'Pression positionnelle.'),
  base(1700, 10, 1, 0, 0, 'native', 'Ethan', 'Attaque précise sur le roi.'),
  base(1750, 11, 1, 0, 0, 'native', 'Nour', 'Presque sans faute tactique.'),
  base(1800, 12, 1, 0, 0, 'native', 'Gabriel', 'Le plus fort : un vrai test.'),
];

export const MIN_BOT_ELO = 800;
export const MAX_BOT_ELO = 1800;
export const BOT_STEP = 50;

export function profileFor(elo: number): BotProfile {
  const clamped = Math.min(MAX_BOT_ELO, Math.max(MIN_BOT_ELO, Math.round(elo / BOT_STEP) * BOT_STEP));
  return BOT_PROFILES.find((p) => p.elo === clamped) ?? BOT_PROFILES[0];
}
