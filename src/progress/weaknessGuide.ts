// Programme d'entraînement spécifique à chaque faiblesse du radar : diagnostic, méthode, exercices, ressources.
import type { IndicatorKey } from './profile';
import { INDICATORS, isAlert } from './profile';

export type GuideAction =
  | { kind: 'drills'; motifs: string[]; label: string }
  | { kind: 'puzzles'; theme: 'mate1' | 'hanging' | 'fork'; label: string }
  | { kind: 'blindfold'; which: 'knight' | 'count' | 'hanging'; label: string }
  | { kind: 'endgame'; fen: string; label: string; botElo?: number }
  | { kind: 'game'; label: string; goal: IndicatorKey; botElo?: number }
  | { kind: 'link'; url: string; label: string };

export interface WeaknessGuide {
  key: IndicatorKey;
  title: string;
  why: string;
  /** Check-list à appliquer en partie. */
  method: string[];
  actions: GuideAction[];
  /** Routine conseillée. */
  routine: string;
}

export const WEAKNESS_GUIDES: Record<IndicatorKey, WeaknessGuide> = {
  hanging: {
    key: 'hanging',
    title: 'Pièces en prise',
    why: 'À ce niveau, la majorité des parties se perdent sur une pièce donnée gratuitement. C\'est la faiblesse la plus rentable à corriger.',
    method: [
      'Avant chaque coup, regarde la heatmap : chacune de mes pièces est-elle sur une case rouge ? Si oui, est-elle défendue ?',
      'Après avoir choisi mon coup, je vérifie la case d\'arrivée : combien d\'attaquants adverses, combien de défenseurs à moi ?',
      'Quand l\'adversaire joue, je me demande d\'abord : « qu\'est-ce que ce coup attaque ? »',
      'Je garde le filet anti-gaffe activé jusqu\'à ce que le compteur de gaffes évitées reste à zéro pendant trois parties.',
    ],
    actions: [
      { kind: 'drills', motifs: ['hanging_piece', 'moved_into_attack'], label: 'Rejouer mes pièces laissées en prise' },
      { kind: 'puzzles', theme: 'hanging', label: 'Puzzles : trouve la pièce gratuite' },
      { kind: 'blindfold', which: 'hanging', label: 'Trouve la pièce pendante (15 s)' },
      { kind: 'blindfold', which: 'count', label: 'Compte les attaquants' },
      { kind: 'game', label: 'Partie objectif : aucune pièce en prise', goal: 'hanging' },
      { kind: 'link', url: 'https://lichess.org/training/hangingPiece', label: 'Lichess : pièces en prise' },
    ],
    routine: '5 min de « pièce pendante » puis une partie avec l\'objectif, tous les jours pendant une semaine.',
  },
  tactics: {
    key: 'tactics',
    title: 'Tactiques ratées',
    why: 'Fourchettes, captures gratuites et mats manqués : ce sont des points offerts que tu ne prends pas. La reconnaissance des motifs vient avec la répétition.',
    method: [
      'À chaque coup, liste mes échecs possibles et mes captures possibles, même s\'ils semblent mauvais.',
      'Cherche les pièces adverses non défendues (triangles jaunes avec l\'option « pièces pendantes ») : deux pièces non défendues = fourchette possible.',
      'Quand le roi adverse a peu de cases, cherche le mat avant tout.',
    ],
    actions: [
      { kind: 'puzzles', theme: 'fork', label: 'Puzzles : fourchettes' },
      { kind: 'puzzles', theme: 'mate1', label: 'Puzzles : mat en 1' },
      { kind: 'drills', motifs: ['fork_missed', 'missed_free_capture', 'mate_missed'], label: 'Rejouer mes tactiques ratées' },
      { kind: 'blindfold', which: 'knight', label: 'Cases du cavalier (visualisation)' },
      { kind: 'link', url: 'https://lichess.org/training/fork', label: 'Lichess : fourchettes' },
      { kind: 'link', url: 'https://lichess.org/training/mateIn1', label: 'Lichess : mat en 1' },
    ],
    routine: '10 puzzles par jour (fourchettes puis mats), puis « Devine le coup » sur ta dernière partie.',
  },
  kingSafety: {
    key: 'kingSafety',
    title: 'Sécurité du roi',
    why: 'Un roi resté au centre ou une défense négligée transforme une bonne position en mat rapide.',
    method: [
      'Roque avant le 10e coup, sauf raison précise.',
      'Ne bouge pas les pions devant ton roi roqué sans nécessité.',
      'À chaque coup adverse, regarde s\'il crée une menace de mat : combien de pièces adverses visent les cases autour de mon roi ?',
      'Garde une pièce de défense près du roi (souvent le cavalier en f3/f6).',
    ],
    actions: [
      { kind: 'drills', motifs: ['king_in_center', 'mate_allowed'], label: 'Rejouer mes rois en danger' },
      { kind: 'puzzles', theme: 'mate1', label: 'Puzzles : reconnaître les mats' },
      { kind: 'blindfold', which: 'count', label: 'Compte les attaquants autour du roi' },
      { kind: 'game', label: 'Partie objectif : roque avant le 12e coup', goal: 'kingSafety' },
      { kind: 'link', url: 'https://lichess.org/training/mateIn2', label: 'Lichess : mat en 2' },
    ],
    routine: 'Une partie par jour avec l\'objectif « roque avant le 12e coup », et 5 puzzles de mat.',
  },
  endgame: {
    key: 'endgame',
    title: 'Finales',
    why: 'Les finales se gagnent avec quelques techniques précises (opposition, pion passé, roi actif). Sans elles, l\'avantage s\'évapore.',
    method: [
      'En finale, active ton roi : il devient une pièce d\'attaque.',
      'Crée un pion passé et pousse-le avec le soutien du roi.',
      'Avec une tour : coupe le roi adverse, place la tour derrière le pion passé.',
      'Compte les coups : ma course de pions est-elle plus rapide que la sienne ?',
    ],
    actions: [
      { kind: 'endgame', fen: '8/8/8/3k4/8/8/3PK3/8 w - - 0 1', label: 'Roi + pion contre roi (opposition)' },
      { kind: 'endgame', fen: '8/8/8/4k3/8/8/4K3/4R3 w - - 0 1', label: 'Tour + roi contre roi' },
      { kind: 'endgame', fen: '8/8/8/4k3/8/8/4K3/4Q3 w - - 0 1', label: 'Dame + roi contre roi' },
      { kind: 'endgame', fen: '8/5k2/8/8/8/8/PP3PPP/6K1 w - - 0 1', label: 'Majorité de pions' },
      { kind: 'drills', motifs: [], label: 'Rejouer mes erreurs de finale' },
      { kind: 'link', url: 'https://lichess.org/training/endgame', label: 'Lichess : finales' },
    ],
    routine: 'Gagne chaque finale de base trois fois de suite contre le bot 1800 avant de passer à la suivante.',
  },
  opening: {
    key: 'opening',
    title: 'Ouverture',
    why: 'Des imprécisions dans les 10 premiers coups te font partir avec un handicap. Il ne s\'agit pas d\'apprendre des variantes mais d\'appliquer des principes.',
    method: [
      'Un pion au centre (e4 ou d4), puis les cavaliers, puis les fous : chaque pièce mineure une seule fois.',
      'Roque tôt, relie les tours.',
      'Ne sors pas la dame avant les pièces mineures ; ne rejoue pas une pièce déjà développée avant le 10e coup.',
      'Après chaque coup adverse en ouverture : « menace-t-il quelque chose ? » sinon je continue mon développement.',
    ],
    actions: [
      { kind: 'game', label: 'Partie objectif : ouverture sans imprécision', goal: 'opening' },
      { kind: 'drills', motifs: ['tempo_loss'], label: 'Rejouer mes temps perdus' },
      { kind: 'link', url: 'https://lichess.org/training/opening', label: 'Lichess : tactiques d\'ouverture' },
    ],
    routine: 'Joue toujours la même ouverture pendant deux semaines (une avec e4, une réponse contre e4 et contre d4) : le débrief affiche son nom et tes imprécisions.',
  },
  redSquares: {
    key: 'redSquares',
    title: 'Cases rouges',
    why: 'Tu poses des pièces sur des cases contrôlées par l\'adversaire sans les défendre : la heatmap te le montre avant de jouer.',
    method: [
      'Avant de poser une pièce, regarde la couleur de la case d\'arrivée : rouge sans défense = interdit.',
      'Mode « X » (prévisualiser) : survole ta case d\'arrivée pour voir ce que l\'adversaire attaquera après.',
      'Compte : attaquants rouges contre défenseurs bleus ; si les rouges sont plus nombreux, ne pose pas la pièce.',
    ],
    actions: [
      { kind: 'drills', motifs: ['moved_into_attack'], label: 'Rejouer mes coups dans les cases rouges' },
      { kind: 'blindfold', which: 'count', label: 'Compte les attaquants' },
      { kind: 'puzzles', theme: 'hanging', label: 'Puzzles : pièces gratuites' },
      { kind: 'game', label: 'Partie objectif : jamais dans une case rouge', goal: 'redSquares' },
    ],
    routine: 'Joue trois parties en mode heatmap « Rouge seul » : ne vois que les cases interdites.',
  },
  advantage: {
    key: 'advantage',
    title: 'Gestion de l\'avantage',
    why: 'Tu obtiens des positions gagnantes mais tu les laisses filer : quand on a l\'avantage, la priorité change.',
    method: [
      'Avec une pièce de plus, échange les pièces (pas les pions) : la finale se gagne toute seule.',
      'Ne cherche pas le coup brillant : cherche le coup sûr qui garde tout défendu.',
      'Avant chaque coup en position gagnante : « que peut-il me faire de pire ? »',
      'Convertis avec méthode : roi à l\'abri, pièces défendues, puis avance.',
    ],
    actions: [
      { kind: 'endgame', fen: 'r3k3/pppp1ppp/8/8/8/8/PPPP1PPP/R3K2R w KQq - 0 1', label: 'Convertir une tour de plus', botElo: 1800 },
      { kind: 'endgame', fen: '4k3/pppp1ppp/8/8/8/8/PPPP1PPP/3QK3 w - - 0 1', label: 'Convertir une dame de plus', botElo: 1800 },
      { kind: 'drills', motifs: [], label: 'Rejouer mes avantages gâchés' },
      { kind: 'game', label: 'Partie objectif : garder l\'avantage jusqu\'au bout', goal: 'advantage' },
      { kind: 'link', url: 'https://lichess.org/training/advantage', label: 'Lichess : avantage' },
    ],
    routine: 'Après chaque victoire manquée, rejoue la position d\'avantage contre le bot jusqu\'à la gagner.',
  },
};

export interface WeaknessSummary {
  key: IndicatorKey;
  label: string;
  value: number | undefined;
  unit: string;
  threshold: number;
  alert: boolean;
  /** Écart normalisé au seuil (plus grand = plus faible). */
  severity: number;
  guide: WeaknessGuide;
}

/** Faiblesses triées de la plus marquée à la moins marquée (indicateurs sans donnée en dernier). */
export function rankWeaknesses(indicators: Record<string, number>): WeaknessSummary[] {
  return INDICATORS.map((d) => {
    const value = indicators[d.key];
    const severity = value === undefined ? -Infinity : d.higherIsWorse ? (value - d.threshold) / Math.max(1, d.threshold) : (d.threshold - value) / Math.max(1, d.threshold);
    return { key: d.key, label: d.label, value, unit: d.unit, threshold: d.threshold, alert: isAlert(d, value), severity, guide: WEAKNESS_GUIDES[d.key] };
  }).sort((a, b) => b.severity - a.severity);
}

/** Phrase de diagnostic chiffré pour un indicateur. */
export function diagnosis(w: WeaknessSummary): string {
  if (w.value === undefined) return 'Pas encore assez de parties analysées pour mesurer cet axe.';
  const def = INDICATORS.find((d) => d.key === w.key)!;
  const rel = def.higherIsWorse ? (w.alert ? 'au-dessus' : 'sous') : w.alert ? 'sous' : 'au-dessus';
  return `${w.value} ${w.unit}, ${rel} du seuil de ${w.threshold} ${w.unit}${w.alert ? ' : point à travailler en priorité.' : ' : dans la bonne zone, continue.'}`;
}
