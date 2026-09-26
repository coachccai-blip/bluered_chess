// Modèle de données local (section 10).
import type { KeyMoment, MoveEval, GameSummary } from '../analysis/coach';

export type PlayerColor = 'blue' | 'red';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface Game {
  id: string;
  createdAt: number;
  playerColor: PlayerColor;
  botElo: number;
  result: GameResult;
  /** Raison de fin (mat, abandon...). */
  endReason?: string;
  pgn: string;
  startFen: string;
  sans: string[];
  durationSec: number;
  analysisId?: string;
  /** Partie importée (PGN externe) : pas de bot. */
  imported?: boolean;
  eloBefore?: number;
  eloAfter?: number;
}

export interface Analysis {
  id: string;
  gameId: string;
  createdAt: number;
  engineDepth: number;
  accuracy: number;
  moves: MoveEval[];
  keyMoments: KeyMoment[];
  summary: GameSummary;
}

export interface EloPoint {
  date: number;
  elo: number;
}

export interface Profile {
  id: 'me';
  estimatedElo: number;
  eloHistory: EloPoint[];
  indicators: Record<string, number>;
  previousIndicators?: Record<string, number>;
  gamesAnalyzed: number;
  updatedAt: number;
  /** Séries de victoires/défaites consécutives pour recommander le bot suivant. */
  streak: { wins: number; losses: number };
  recommendedBotElo: number;
  onboardingDone: boolean;
  blindfoldScores?: { date: number; score: number }[];
}

export interface Exercise {
  id: string;
  kind: 'replay_mistake' | 'find_hanging' | 'knight_squares' | 'count_attackers' | 'basic_endgame' | 'clean_opening' | 'lichess_puzzles';
  title: string;
  description: string;
  target: string; // indicateur visé
  fen?: string;
  gameId?: string;
  ply?: number;
  bestMove?: string;
  url?: string;
  goal: string;
  minutes: number;
}

export interface TrainingPlan {
  id: string;
  generatedAt: number;
  gamesCountAtGeneration: number;
  targets: string[];
  exercises: Exercise[];
  progress: Record<string, number>;
  indicatorsAtGeneration: Record<string, number>;
}

export interface Settings {
  id: 'settings';
  theme: 'bluered' | 'colorblind';
  hatching: boolean;
  heatmapIntensity: number; // 0.5..1.5
  showCounts: boolean;
  showHanging: boolean;
  showLoose: boolean;
  sounds: boolean;
  animations: boolean;
  allowUndo: boolean;
  showEvalBar: boolean;
  analysisDepth: number;
  defaultHeatmapMode: 'A' | 'B' | 'R' | 'C' | 'P' | 'H' | 'X';
  ignorePinned: boolean;
  xray: boolean;
  lastBackupAt: number;
  gamesSinceBackup: number;
  apiKey?: string; // chiffrée localement
  apiProvider?: 'anthropic' | 'openai';
  apiModel?: string;
  apiBaseUrl?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  theme: 'bluered',
  hatching: false,
  heatmapIntensity: 1,
  showCounts: true,
  showHanging: true,
  showLoose: false,
  sounds: true,
  animations: true,
  allowUndo: true,
  showEvalBar: false,
  analysisDepth: typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent) ? 12 : 16,
  defaultHeatmapMode: 'A',
  ignorePinned: false,
  xray: false,
  lastBackupAt: 0,
  gamesSinceBackup: 0,
};

export const DEFAULT_PROFILE: Profile = {
  id: 'me',
  estimatedElo: 1000,
  eloHistory: [],
  indicators: {},
  gamesAnalyzed: 0,
  updatedAt: 0,
  streak: { wins: 0, losses: 0 },
  recommendedBotElo: 1000,
  onboardingDone: false,
};

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
