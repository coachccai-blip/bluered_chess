// État de la partie courante : une seule source de vérité (FEN + historique), le reste en dérive.
import { create } from 'zustand';
import { applyMove, gameStatusWithHistory, START_FEN, type GameStatus, type MoveInput, type MoveRecord } from '../chess/game';
import type { Color, Square } from '../chess/types';
import type { HeatmapMode } from '../board/ThreatOverlay';
import { TIME_CONTROLS, type TimeControl } from '../data/models';

export type GameMode = 'bot' | 'human' | 'exercise' | 'explore';

export interface GameState {
  startFen: string;
  fen: string;
  records: MoveRecord[];
  mode: GameMode;
  playerColor: Color; // camp de l'utilisateur (en mode bot)
  botElo: number;
  status: GameStatus;
  startedAt: number;
  heatmapMode: HeatmapMode;
  flipped: boolean;
  botThinking: boolean;
  /** Identifiant de la partie sauvegardée (après fin). */
  savedGameId: string | null;
  exerciseBestMove: string | null;
  /** Fiche de révision en cours (répétition espacée). */
  exerciseDrillId: string | null;
  /** Série de puzzles intégrés en cours (thème) et indice affiché. */
  exerciseTheme: string | null;
  exerciseHint: string | null;
  /** Objectif de la partie. */
  goal: { key: string; label: string } | null;
  lastMoveAt: number;
  /** Cadence et temps restant (ms) par camp ; null = illimité. */
  timeControl: TimeControl;
  clocks: { w: number; b: number } | null;
  /** Indices demandés pendant la partie. */
  hintsUsed: number;
  addHint: () => void;
  /** Décompte le temps du camp au trait ; déclare la perte au temps à zéro. */
  tick: (elapsedMs: number) => void;
  newGame: (opts: { mode: GameMode; playerColor?: Color; botElo?: number; startFen?: string; exerciseBestMove?: string | null; exerciseDrillId?: string | null; goal?: { key: string; label: string } | null; exerciseTheme?: string | null; exerciseHint?: string | null; timeControl?: TimeControl }) => void;
  playMove: (m: MoveInput | string) => MoveRecord | null;
  undo: (plies: number) => void;
  resign: () => void;
  agreeDraw: () => void;
  setHeatmapMode: (m: HeatmapMode) => void;
  setFlipped: (f: boolean) => void;
  setBotThinking: (b: boolean) => void;
  setSavedGameId: (id: string | null) => void;
  sans: () => string[];
  lastMove: () => { from: Square; to: Square } | null;
}

const STORAGE_KEY = 'bluered-current-game';
type Persisted = Pick<GameState, 'startFen' | 'fen' | 'records' | 'mode' | 'playerColor' | 'botElo' | 'status' | 'startedAt' | 'savedGameId' | 'exerciseBestMove' | 'flipped' | 'heatmapMode'> & Partial<Pick<GameState, 'exerciseDrillId' | 'goal' | 'lastMoveAt' | 'exerciseTheme' | 'exerciseHint' | 'timeControl' | 'clocks' | 'hintsUsed'>>;

/** Relit la partie en cours depuis localStorage (survit au rechargement et à la fermeture de l'app). */
export function loadPersistedGame(storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): Partial<Persisted> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Persisted;
    if (!data.fen || !Array.isArray(data.records)) return {};
    return data;
  } catch {
    return {};
  }
}

export function persistGame(state: GameState, storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  if (!storage) return;
  const data: Persisted = {
    startFen: state.startFen,
    fen: state.fen,
    records: state.records,
    mode: state.mode,
    playerColor: state.playerColor,
    botElo: state.botElo,
    status: state.status,
    startedAt: state.startedAt,
    savedGameId: state.savedGameId,
    exerciseBestMove: state.exerciseBestMove,
    flipped: state.flipped,
    heatmapMode: state.heatmapMode,
    exerciseDrillId: state.exerciseDrillId,
    exerciseTheme: state.exerciseTheme,
    exerciseHint: state.exerciseHint,
    timeControl: state.timeControl,
    clocks: state.clocks,
    hintsUsed: state.hintsUsed,
    goal: state.goal,
    lastMoveAt: state.lastMoveAt,
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota ou stockage indisponible */
  }
}

export const useGame = create<GameState>((set, get) => ({
  startFen: START_FEN,
  fen: START_FEN,
  records: [],
  mode: 'bot',
  playerColor: 'w',
  botElo: 1000,
  status: { over: false },
  startedAt: Date.now(),
  heatmapMode: 'A',
  flipped: false,
  botThinking: false,
  savedGameId: null,
  exerciseBestMove: null,
  exerciseDrillId: null,
  exerciseTheme: null,
  exerciseHint: null,
  goal: null,
  lastMoveAt: Date.now(),
  timeControl: 'unlimited',
  clocks: null,
  hintsUsed: 0,
  ...loadPersistedGame(),
  newGame: ({ mode, playerColor = 'w', botElo = 1000, startFen = START_FEN, exerciseBestMove = null, exerciseDrillId = null, goal = null, exerciseTheme = null, exerciseHint = null, timeControl = 'unlimited' }) =>
    set({
      startFen,
      fen: startFen,
      records: [],
      mode,
      playerColor,
      botElo,
      status: { over: false },
      startedAt: Date.now(),
      flipped: playerColor === 'b',
      botThinking: false,
      savedGameId: null,
      exerciseBestMove,
      exerciseDrillId,
      exerciseTheme,
      exerciseHint,
      goal,
      lastMoveAt: Date.now(),
      hintsUsed: 0,
      timeControl,
      clocks: TIME_CONTROLS[timeControl].seconds ? { w: TIME_CONTROLS[timeControl].seconds! * 1000, b: TIME_CONTROLS[timeControl].seconds! * 1000 } : null,
    }),
  playMove: (m) => {
    const s = get();
    if (s.status.over) return null;
    const res = applyMove(s.fen, m, s.records.length + 1);
    if (!res) return null;
    const now = Date.now();
    res.record.thinkMs = Math.max(0, now - s.lastMoveAt);
    const records = [...s.records, res.record];
    const status = gameStatusWithHistory(s.startFen, records.map((r) => r.san));
    set({ fen: res.fen, records, status, lastMoveAt: now });
    return res.record;
  },
  undo: (plies) => {
    const s = get();
    const records = s.records.slice(0, Math.max(0, s.records.length - plies));
    const fen = records.length ? records[records.length - 1].fenAfter : s.startFen;
    set({ records, fen, status: { over: false }, botThinking: false, lastMoveAt: Date.now() });
  },
  addHint: () => set((s) => ({ hintsUsed: s.hintsUsed + 1 })),
  tick: (elapsedMs) => {
    const s = get();
    if (!s.clocks || s.status.over || s.records.length === 0) return;
    const side = s.fen.split(' ')[1] === 'b' ? 'b' : 'w';
    const left = Math.max(0, s.clocks[side] - elapsedMs);
    const clocks = { ...s.clocks, [side]: left };
    if (left <= 0) {
      set({ clocks, status: { over: true, result: side === 'w' ? '0-1' : '1-0', reason: 'timeout' } });
    } else {
      set({ clocks });
    }
  },
  resign: () => {
    const s = get();
    if (s.status.over) return;
    const loser = s.mode === 'bot' || s.mode === 'exercise' ? s.playerColor : s.fen.split(' ')[1];
    set({ status: { over: true, result: loser === 'w' ? '0-1' : '1-0', reason: 'resign' } });
  },
  agreeDraw: () => set({ status: { over: true, result: '1/2-1/2', reason: 'draw-agreed' } }),
  setHeatmapMode: (heatmapMode) => set({ heatmapMode }),
  setFlipped: (flipped) => set({ flipped }),
  setBotThinking: (botThinking) => set({ botThinking }),
  setSavedGameId: (savedGameId) => set({ savedGameId }),
  sans: () => get().records.map((r) => r.san),
  lastMove: () => {
    const r = get().records;
    return r.length ? { from: r[r.length - 1].from, to: r[r.length - 1].to } : null;
  },
}));

useGame.subscribe((state) => persistGame(state));
