// Lance une action d'un programme de faiblesse : exercice interne, puzzle, fiche, finale, partie avec objectif, lien.
import { db } from '../data/db';
import { useGame } from '../store/gameStore';
import { navigate } from '../app/router';
import { goalFor } from './goals';
import { dueDrills } from './drills';
import { PUZZLES, puzzlesByTheme, type PuzzleTheme } from './puzzles';
import type { GuideAction } from './weaknessGuide';
import { loadProfile } from '../data/db';

export function launchPuzzle(theme: PuzzleTheme, excludeId?: string): boolean {
  const list = puzzlesByTheme(theme).filter((p) => p.id !== excludeId);
  const pool = list.length ? list : PUZZLES.filter((p) => p.theme === theme);
  if (!pool.length) return false;
  const p = pool[Math.floor(Math.random() * pool.length)];
  const g = useGame.getState();
  g.newGame({ mode: 'exercise', playerColor: p.fen.split(' ')[1] === 'b' ? 'b' : 'w', botElo: 1200, startFen: p.fen, exerciseBestMove: p.solution, exerciseTheme: theme, exerciseHint: p.hint, exerciseDrillId: p.id });
  g.setHeatmapMode('A');
  return true;
}

/** Renvoie un message si l'action n'a pas pu être lancée (ex. aucune fiche disponible). */
export async function launchAction(a: GuideAction): Promise<string | null> {
  const g = useGame.getState();
  switch (a.kind) {
    case 'puzzles':
      launchPuzzle(a.theme);
      navigate('partie');
      return null;
    case 'drills': {
      const all = await db.drills.toArray();
      const matching = a.motifs.length ? all.filter((d) => d.motif && a.motifs.includes(d.motif)) : all;
      if (!matching.length) return 'Aucune position de ce type dans tes parties analysées pour l\'instant : joue et analyse une partie, ou lance les puzzles.';
      const due = dueDrills(matching);
      const d = (due.length ? due : matching)[0];
      g.newGame({ mode: 'exercise', playerColor: d.fen.split(' ')[1] === 'b' ? 'b' : 'w', botElo: 1200, startFen: d.fen, exerciseBestMove: d.bestMove, exerciseDrillId: d.id, exerciseHint: `Dans ta partie, tu avais joué ${d.playedSan}.` });
      g.setHeatmapMode('A');
      navigate('partie');
      return null;
    }
    case 'blindfold':
      navigate(`entrainement?ex=${a.which}`);
      return null;
    case 'endgame':
      g.newGame({ mode: 'bot', playerColor: 'w', botElo: a.botElo ?? 1800, startFen: a.fen, goal: { key: 'endgame', label: 'Gagner cette finale' } });
      navigate('partie');
      return null;
    case 'game': {
      const profile = await loadProfile(db);
      g.newGame({ mode: 'bot', playerColor: Math.random() < 0.5 ? 'w' : 'b', botElo: a.botElo ?? profile.recommendedBotElo, goal: goalFor(a.goal) ?? null });
      navigate('partie');
      return null;
    }
    case 'link':
      window.open(a.url, '_blank', 'noopener');
      return null;
  }
}
