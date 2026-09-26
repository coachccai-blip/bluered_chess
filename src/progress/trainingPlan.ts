// Plan d'entraînement généré à partir des 2 indicateurs les plus faibles (section 8).
import type { Analysis, Exercise, Game, TrainingPlan } from '../data/models';
import { newId } from '../data/models';
import { INDICATORS, deviation, indicatorDef, type IndicatorKey } from './profile';

const ENDGAME_FENS = [
  { fen: '8/8/8/4k3/8/8/4K3/4R3 w - - 0 1', title: 'Tour + roi contre roi' },
  { fen: '8/8/8/3k4/8/8/3PK3/8 w - - 0 1', title: 'Pion passé et opposition' },
  { fen: '8/8/8/4k3/8/8/4K3/4Q3 w - - 0 1', title: 'Dame + roi contre roi' },
  { fen: '8/5k2/8/8/8/8/PP3PPP/6K1 w - - 0 1', title: 'Majorité de pions' },
];

/** Positions de gaffes issues des parties du joueur. */
export function mistakePositions(pairs: { game: Game; analysis: Analysis }[], motifs: string[] | null, limit = 6) {
  const out: { gameId: string; ply: number; fen: string; best: string | null; motif: string | null }[] = [];
  for (const { game, analysis } of pairs.slice().sort((a, b) => b.game.createdAt - a.game.createdAt)) {
    const color = game.playerColor === 'blue' ? 'w' : 'b';
    for (const m of analysis.moves) {
      if (m.color !== color) continue;
      if (!['blunder', 'mistake', 'mate_missed'].includes(m.category)) continue;
      const hit = m.motifs.find((h) => !motifs || motifs.includes(h.motif));
      if (motifs && !hit) continue;
      out.push({ gameId: game.id, ply: m.ply, fen: m.fenBefore, best: m.bestMove, motif: hit?.motif ?? null });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function generatePlan(
  indicators: Record<string, number>,
  pairs: { game: Game; analysis: Analysis }[],
  gamesCount: number,
): TrainingPlan {
  const ranked = INDICATORS.filter((d) => indicators[d.key] !== undefined)
    .map((d) => ({ d, dev: deviation(d, indicators[d.key]) }))
    .sort((a, b) => b.dev - a.dev);
  const targets = (ranked.length >= 2 ? ranked.slice(0, 2) : ranked).map((r) => r.d.key);
  if (targets.length === 0) targets.push('hanging', 'tactics');
  const exercises: Exercise[] = [];
  for (const t of targets) exercises.push(...exercisesFor(t as IndicatorKey, pairs));
  return {
    id: newId(),
    generatedAt: Date.now(),
    gamesCountAtGeneration: gamesCount,
    targets,
    exercises,
    progress: {},
    indicatorsAtGeneration: { ...indicators },
  };
}

function exercisesFor(key: IndicatorKey, pairs: { game: Game; analysis: Analysis }[]): Exercise[] {
  const def = indicatorDef(key);
  const list: Exercise[] = [];
  const replay = (motifs: string[] | null, title: string, goal: string) => {
    const positions = mistakePositions(pairs, motifs, 4);
    positions.forEach((p, i) =>
      list.push({
        id: newId(),
        kind: 'replay_mistake',
        title: `${title} ${i + 1}`,
        description: 'Reprends la position de ta gaffe, heatmap activée, et trouve le bon coup.',
        target: key,
        fen: p.fen,
        gameId: p.gameId,
        ply: p.ply,
        bestMove: p.best ?? undefined,
        goal,
        minutes: 5,
      }),
    );
  };
  switch (key) {
    case 'hanging':
    case 'redSquares':
      replay(['hanging_piece', 'moved_into_attack'], 'Rejoue tes erreurs', 'Résoudre les positions sans laisser de pièce en prise');
      list.push({ id: newId(), kind: 'find_hanging', title: 'Trouve la pièce pendante', description: 'Positions de tes parties avec une pièce en prise, chronomètre de 15 s.', target: key, goal: '8 positions sur 10 en moins de 15 s', minutes: 10 });
      list.push({ id: newId(), kind: 'count_attackers', title: 'Compte les attaquants', description: 'L\'app désigne une case ; donne le nombre d\'attaquants bleus et rouges.', target: key, goal: '90 % de bonnes réponses sur 2 semaines', minutes: 10 });
      break;
    case 'tactics':
      replay(['fork_missed', 'mate_missed', 'missed_free_capture'], 'Tactique ratée', 'Retrouver le coup gagnant');
      list.push({ id: newId(), kind: 'knight_squares', title: 'Cases du cavalier', description: 'Visualisation à l\'aveugle : clique les cases attaquées par un cavalier ou un fou.', target: key, goal: '95 % de précision', minutes: 10 });
      list.push({ id: newId(), kind: 'lichess_puzzles', title: 'Puzzles Lichess : fourchettes', description: 'Puzzles gratuits filtrés par thème (connexion requise).', target: key, url: 'https://lichess.org/training/fork', goal: '10 puzzles par jour', minutes: 10 });
      break;
    case 'kingSafety':
      replay(['king_in_center', 'mate_allowed'], 'Roi en danger', 'Mettre le roi à l\'abri à temps');
      list.push({ id: newId(), kind: 'lichess_puzzles', title: 'Puzzles Lichess : mat en 2', description: 'Repérer les mats pour mieux les éviter.', target: key, url: 'https://lichess.org/training/mateIn2', goal: '10 puzzles par jour', minutes: 10 });
      list.push({ id: newId(), kind: 'count_attackers', title: 'Compte les attaquants autour du roi', description: 'Combien de pièces adverses visent les cases autour de ton roi ?', target: key, goal: '90 % de bonnes réponses', minutes: 5 });
      break;
    case 'endgame':
      ENDGAME_FENS.slice(0, 3).forEach((e) =>
        list.push({ id: newId(), kind: 'basic_endgame', title: `Finale de base : ${e.title}`, description: 'Joue la finale contre le bot 1800 jusqu\'au gain.', target: key, fen: e.fen, goal: 'Gagner 3 fois de suite', minutes: 10 }),
      );
      break;
    case 'opening':
      list.push({ id: newId(), kind: 'clean_opening', title: 'Ouverture propre', description: 'Rejoue les 10 premiers coups de ta dernière partie et corrige les imprécisions.', target: key, goal: 'Précision > 90 % sur les 10 premiers coups', minutes: 10 });
      replay(['tempo_loss'], 'Temps perdu', 'Développer toutes les pièces avant de rejouer une pièce');
      list.push({ id: newId(), kind: 'lichess_puzzles', title: 'Puzzles Lichess : ouverture', description: 'Tactiques typiques des 10 premiers coups.', target: key, url: 'https://lichess.org/training/opening', goal: '10 puzzles par jour', minutes: 10 });
      break;
    case 'advantage':
      replay(null, 'Convertir l\'avantage', 'Garder l\'avantage jusqu\'au gain');
      list.push({ id: newId(), kind: 'basic_endgame', title: 'Finale gagnante : Dame + roi', description: 'Transforme un avantage matériel en mat.', target: key, fen: ENDGAME_FENS[2].fen, goal: 'Mater en moins de 20 coups', minutes: 10 });
      list.push({ id: newId(), kind: 'lichess_puzzles', title: 'Puzzles Lichess : avantage', description: 'Simplifier quand on a l\'avantage.', target: key, url: 'https://lichess.org/training/advantage', goal: '10 puzzles par jour', minutes: 10 });
      break;
  }
  return list.slice(0, 3 + Math.min(3, list.filter((e) => e.kind === 'replay_mistake').length)).map((e) => ({ ...e, description: `${e.description} (${def.label})` }));
}

/** Le plan doit-il être recalculé ? Toutes les 5 parties. */
export function shouldRegeneratePlan(plan: TrainingPlan | undefined, gamesCount: number): boolean {
  if (!plan) return gamesCount >= 1;
  return gamesCount - plan.gamesCountAtGeneration >= 5;
}
