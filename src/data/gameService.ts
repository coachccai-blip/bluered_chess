// Orchestration : enregistrer une partie, mettre à jour le profil, l'Elo et le plan.
import { db, loadProfile, saveProfile } from './db';
import { newId, type Analysis, type Drill, type Game, type GameGoal, type GameResult, type Profile, type TrainingPlan } from './models';
import { drillsFromAnalysis, nextReview } from '../progress/drills';
import { evaluateGoal } from '../progress/goals';
import { buildPgn, START_FEN } from '../chess/game';
import { recommendBot, updateElo, updateStreak } from '../progress/elo';
import { computeIndicators, resultScore } from '../progress/profile';
import { generatePlan, shouldRegeneratePlan } from '../progress/trainingPlan';
import type { GameAnalysis } from '../analysis/analyzeGame';
import type { MoveRecord } from '../chess/game';
import { useSettings } from '../store/settingsStore';

export interface FinishedGameInput {
  startFen: string;
  records: MoveRecord[];
  playerColor: 'w' | 'b';
  botElo: number;
  result: GameResult;
  endReason?: string;
  startedAt: number;
  mode: 'bot' | 'human' | 'exercise';
  goal?: GameGoal | null;
}

export async function saveFinishedGame(input: FinishedGameInput): Promise<Game> {
  const profile = await loadProfile(db);
  const sans = input.records.map((r) => r.san);
  const playerColor = input.playerColor === 'w' ? 'blue' : 'red';
  const botName = `Bot ${input.botElo}`;
  const headers = {
    Event: 'BlueRed Chess',
    Site: 'local',
    Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    White: input.mode === 'bot' ? (playerColor === 'blue' ? 'Moi (Bleu)' : botName) : 'Bleu',
    Black: input.mode === 'bot' ? (playerColor === 'red' ? 'Moi (Rouge)' : botName) : 'Rouge',
    Result: input.result,
  };
  const game: Game = {
    id: newId(),
    createdAt: Date.now(),
    playerColor,
    botElo: input.mode === 'bot' ? input.botElo : 0,
    result: input.result,
    endReason: input.endReason,
    pgn: buildPgn(input.startFen, sans, headers),
    startFen: input.startFen,
    sans,
    durationSec: Math.round((Date.now() - input.startedAt) / 1000),
    imported: input.mode !== 'bot',
    thinkTimes: input.records.map((r) => r.thinkMs ?? 0),
    goal: input.goal ?? undefined,
  };
  if (input.mode === 'bot' && input.result !== '*' && input.startFen === START_FEN) {
    const score = resultScore(game);
    const before = profile.estimatedElo;
    const after = updateElo(before, input.botElo, score);
    game.eloBefore = before;
    game.eloAfter = after;
    const streak = updateStreak(profile.streak, score);
    const updated: Profile = {
      ...profile,
      estimatedElo: after,
      eloHistory: [...profile.eloHistory, { date: game.createdAt, elo: after }],
      streak,
      recommendedBotElo: recommendBot(input.botElo, streak, after),
      updatedAt: Date.now(),
    };
    await saveProfile(updated, db);
  }
  await db.games.add(game);
  const settings = useSettings.getState();
  if (settings.loaded) await settings.update({ gamesSinceBackup: settings.settings.gamesSinceBackup + 1 });
  return game;
}

export async function importPgnGame(pgn: string, sans: string[], startFen: string, result: string | undefined, playerColor: 'blue' | 'red'): Promise<Game> {
  const game: Game = {
    id: newId(),
    createdAt: Date.now(),
    playerColor,
    botElo: 0,
    result: (['1-0', '0-1', '1/2-1/2'].includes(result ?? '') ? result : '*') as GameResult,
    pgn,
    startFen,
    sans,
    durationSec: 0,
    imported: true,
  };
  await db.games.add(game);
  return game;
}

/** Enregistre une analyse et met à jour profil + plan. */
export async function saveAnalysis(game: Game, analysis: GameAnalysis): Promise<Analysis> {
  const a: Analysis = {
    id: newId(),
    gameId: game.id,
    createdAt: Date.now(),
    engineDepth: analysis.engineDepth,
    accuracy: analysis.summary.accuracy,
    moves: analysis.moves,
    keyMoments: analysis.keyMoments,
    summary: analysis.summary,
  };
  await db.analyses.add(a);
  const patch: Partial<Game> = { analysisId: a.id };
  if (game.goal) patch.goal = evaluateGoal(game.goal, game, a);
  await db.games.update(game.id, patch);
  // Fiches de répétition espacée pour chaque erreur du joueur.
  const drills = drillsFromAnalysis(game, a);
  if (drills.length) await db.drills.bulkAdd(drills);
  await refreshProfileAndPlan();
  return a;
}

export async function analyzedPairs(): Promise<{ game: Game; analysis: Analysis }[]> {
  const games = await db.games.orderBy('createdAt').reverse().toArray();
  const analyses = await db.analyses.toArray();
  const byGame = new Map(analyses.map((a) => [a.gameId, a]));
  return games.filter((g) => byGame.has(g.id)).map((g) => ({ game: g, analysis: byGame.get(g.id)! }));
}

export async function refreshProfileAndPlan(): Promise<{ profile: Profile; plan: TrainingPlan | undefined }> {
  const pairs = await analyzedPairs();
  const profile = await loadProfile(db);
  const indicators = computeIndicators(pairs);
  const updated: Profile = {
    ...profile,
    previousIndicators: profile.gamesAnalyzed !== pairs.length ? profile.indicators : profile.previousIndicators,
    indicators,
    gamesAnalyzed: pairs.length,
    updatedAt: Date.now(),
  };
  await saveProfile(updated, db);
  let plan = (await db.plans.orderBy('generatedAt').reverse().first()) ?? undefined;
  if (shouldRegeneratePlan(plan, pairs.length) && pairs.length > 0) {
    plan = generatePlan(indicators, pairs, pairs.length);
    await db.plans.add(plan);
  }
  return { profile: updated, plan };
}

export async function deleteGame(id: string): Promise<void> {
  await db.transaction('rw', db.games, db.analyses, db.drills, async () => {
    await db.analyses.where('gameId').equals(id).delete();
    await db.drills.where('gameId').equals(id).delete();
    await db.games.delete(id);
  });
  await refreshProfileAndPlan();
}

/** Enregistre le résultat d'une révision et planifie la suivante. */
export async function recordDrillResult(id: string, ok: boolean): Promise<Drill | undefined> {
  const d = await db.drills.get(id);
  if (!d) return undefined;
  const { box, due } = nextReview(d.box, ok);
  const next: Drill = { ...d, box, due, attempts: d.attempts + 1, successes: d.successes + (ok ? 1 : 0) };
  await db.drills.put(next);
  return next;
}
