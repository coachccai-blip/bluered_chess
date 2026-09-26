// Bibliothèque de phrases modèles en français (une par motif et par gravité), instanciées par le coach.
import type { MoveCategory } from './classify';
import type { Motif } from './motifs';

type Severity = 'mild' | 'serious' | 'critical';

export function severityOf(cat: MoveCategory): Severity {
  if (cat === 'blunder' || cat === 'mate_missed') return 'critical';
  if (cat === 'mistake') return 'serious';
  return 'mild';
}

/** {piece} {square} {attacker} {attackerSquare} {best} {played} {targets} {n} ... */
export const PHRASES: Record<Motif, Record<Severity, string[]>> = {
  hanging_piece: {
    mild: [
      'Après {played}, ton {piece} {square} reste attaqué par le {attacker} {attackerSquare} sans défense suffisante. {best} réglait le problème.',
      'Petite alerte : le {piece} {square} est en prise après {played}. Pense à vérifier tes pièces attaquées avant de jouer.',
    ],
    serious: [
      'Ton {piece} {square} était attaqué par le {attacker} {attackerSquare} et personne ne le défendait. {best} le sauvait.',
      'En jouant {played}, tu as laissé le {piece} {square} en prise. Regarde les cases rouges autour de tes pièces : {best} était nécessaire.',
    ],
    critical: [
      'Gaffe : le {piece} {square} est resté en prise du {attacker} {attackerSquare}. Avant chaque coup, cherche « qu\'est-ce qui est attaqué ? ». Ici {best} sauvait la pièce.',
      'Le {attacker} {attackerSquare} menace ton {piece} {square} depuis un moment et {played} ne s\'en occupe pas. {best} évitait de perdre du matériel.',
    ],
  },
  missed_free_capture: {
    mild: ['Le {piece} adverse en {square} était gratuit : {best} le prenait sans risque.'],
    serious: ['Tu pouvais capturer le {piece} en {square} avec {best} : il n\'était défendu par personne.'],
    critical: ['Le {piece} en {square} était en prise et tu ne l\'as pas capturé : {best} gagnait du matériel net. Avant de jouer, vérifie les pièces adverses non défendues.'],
  },
  fork_suffered: {
    mild: ['Après {played}, le {piece} {square} adverse attaque à la fois {targets}. Attention aux fourchettes.'],
    serious: ['{played} permet une fourchette : le {piece} {square} attaque {targets} en même temps.'],
    critical: ['Gaffe : après {played}, le {piece} {square} fourche {targets}. Tu vas perdre du matériel. Cherche toujours la case d\'où un cavalier ou une dame adverse peut toucher deux de tes pièces.'],
  },
  fork_missed: {
    mild: ['Tu avais une fourchette : {best} attaquait {targets} avec ton {piece}.'],
    serious: ['{best} créait une fourchette de {piece} sur {targets}. Tu l\'as manquée avec {played}.'],
    critical: ['Grosse occasion ratée : {best} fourchait {targets} avec le {piece}. Quand deux pièces adverses sont à distance de cavalier, cherche la fourchette.'],
  },
  pin_suffered: {
    mild: ['Après {played}, ton {piece} {square} est cloué par le {by} {bySquare} sur ton {behind}.'],
    serious: ['{played} laisse ton {piece} {square} cloué par le {by} {bySquare} : il ne peut plus bouger sans exposer le {behind}.'],
    critical: ['Le clouage du {piece} {square} par le {by} {bySquare} coûte cher : ton {behind} est derrière. Il fallait d\'abord sortir du clouage.'],
  },
  king_in_center: {
    mild: ['Ton roi est encore en {square} après le 15e coup : pense à roquer.'],
    serious: ['Ton roi reste au centre en {square}. Sans roque, les colonnes centrales ouvertes deviennent dangereuses.'],
    critical: ['Le roi en {square} au milieu de l\'échiquier est une cible. Roquer plus tôt aurait évité cette attaque.'],
  },
  moved_into_attack: {
    mild: ['{played} pose ton {piece} sur une case contrôlée par le {attacker} {attackerSquare}. Vérifie la couleur de la case avant d\'y aller.'],
    serious: ['Tu as joué dans une case rouge : le {piece} en {square} est attaqué par le {attacker} {attackerSquare} et pas assez défendu.'],
    critical: ['Gaffe : {played} place ton {piece} en {square}, attaquée par le {attacker} {attackerSquare}. La heatmap montrait cette case en rouge : ne joue jamais une pièce sur une case adverse sans compter les défenseurs.'],
  },
  losing_exchange: {
    mild: ['La capture {played} rend un peu de matériel : la reprise sur {square} te coûte environ {loss} point(s).'],
    serious: ['{played} lance un échange perdant : après les reprises sur {square}, tu perds environ {loss} point(s).'],
    critical: ['Échange très défavorable : {played} donne ton {piece} pour moins que sa valeur ({loss} point(s) perdus). Compte les attaquants et défenseurs avant de capturer.'],
  },
  mate_missed: {
    mild: ['Il y avait un mat en {n} : {best}.'],
    serious: ['Tu avais un mat en {n} avec {best}. Quand le roi adverse est coincé, cherche l\'échec décisif.'],
    critical: ['Mat en {n} raté ! {best} terminait la partie. Prends l\'habitude de regarder tous les échecs possibles.'],
  },
  mate_allowed: {
    mild: ['Après {played}, l\'adversaire a un mat en {n}.'],
    serious: ['{played} laisse un mat en {n} à l\'adversaire. Ton roi manquait de cases de fuite.'],
    critical: ['{played} permet un mat en {n}. Avant chaque coup, vérifie les échecs que l\'adversaire peut donner.'],
  },
  tempo_loss: {
    mild: ['{played} redéplace une pièce déjà développée : en ouverture, sors d\'abord les autres pièces.'],
    serious: ['Temps perdu : ton {piece} bouge une deuxième fois avant le 10e coup alors que d\'autres pièces attendent au fond.'],
    critical: ['{played} perd un temps précieux : ton {piece} avait déjà bougé et l\'adversaire prend l\'initiative.'],
  },
  turning_point: {
    mild: ['C\'est ici que la partie a basculé : {played} au lieu de {best}.'],
    serious: ['Le tournant de la partie : après {played}, l\'évaluation passe de {evalBefore} à {evalAfter}. {best} maintenait la position.'],
    critical: ['Moment décisif : {played} fait basculer l\'évaluation de {evalBefore} à {evalAfter}. Le moteur préférait {best}.'],
  },
};

/** Phrases génériques quand aucun motif n'est détecté. */
export const GENERIC: Record<Severity, string[]> = {
  mild: ['{played} est un peu imprécis : {best} était plus précis ({evalBefore} → {evalAfter}).'],
  serious: ['{played} est une erreur : {best} gardait l\'avantage. L\'évaluation passe de {evalBefore} à {evalAfter}.'],
  critical: ['{played} est une gaffe : {best} était nettement meilleur ({evalBefore} → {evalAfter}). Rejoue la position pour comprendre pourquoi.'],
};

export function fill(template: string, data: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (data[k] !== undefined ? String(data[k]) : ''));
}
