import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, type Arrow } from '../board/Board';
import { HeatmapToolbar } from '../ui/HeatmapToolbar';
import { MoveList } from '../ui/MoveList';
import { BotSelector } from '../ui/BotSelector';
import { useGame } from '../store/gameStore';
import { useSettings } from '../store/settingsStore';
import { useEngine } from '../engine/useEngine';
import { botMove, thinkingDelayMs } from '../engine/bot';
import { profileFor } from '../engine/botProfiles';
import { lineScore } from '../engine/engineClient';
import { START_FEN, turnOf, lanToSan, type MoveRecord } from '../chess/game';
import type { Color, Square } from '../chess/types';
import { saveFinishedGame } from '../data/gameService';
import { db, loadProfile } from '../data/db';
import { resultScore } from '../progress/profile';
import { navigate } from '../app/router';
import { sounds } from '../ui/sounds';
import { colorLabel } from '../board/theme';
import { Modal } from '../ui/Modal';
import { Material } from '../ui/Material';
import { Toast } from '../ui/Toast';
import { EvalBarVertical } from '../ui/EvalBarVertical';
import { assessMoveRisk, type MoveRisk } from '../analysis/risk';
import { recordDrillResult } from '../data/gameService';
import { goalFor } from '../progress/goals';
import { launchPuzzle } from '../progress/launchAction';
import type { PuzzleTheme } from '../progress/puzzles';
import { TIME_CONTROLS, TIME_CONTROL_KEYS, type TimeControl } from '../data/models';
import { ratingFor } from '../progress/ratings';
import { explorationComment } from '../analysis/explain';
import { buildHint, nullMoveFen, type Hint } from '../analysis/hint';
import { pvToSan } from '../chess/game';
import type { Profile } from '../data/models';
import { IconList, IconKnight } from '../ui/icons';
import { describeLiveMove, spoken, explainBest } from '../analysis/explain';
import { openingAnnouncement, openingForGame, openingLabel } from '../chess/openings';
import { speak, stopSpeaking, useSpeechStatus } from '../ui/speech';
import { buildMoveEval } from '../analysis/analyzeGame';
import { CATEGORY_LABEL } from '../analysis/classify';

interface PendingSetup {
  mode: 'bot' | 'human' | 'explore';
  color: 'w' | 'b' | 'random';
  botElo: number;
  timeControl: TimeControl;
  startFen: string;
}

export function Play() {
  const g = useGame();
  const { settings, palette } = useSettings();
  const { engine, error: engineError, retry: retryEngine } = useEngine();
  const vsBot = g.mode === 'bot' || g.mode === 'exercise';
  const [setupOpen, setSetupOpen] = useState(g.records.length === 0 && g.mode === 'bot' && !g.exerciseBestMove);
  const [setup, setSetup] = useState<PendingSetup>({ mode: 'bot', color: 'w', botElo: g.botElo, timeControl: g.timeControl ?? 'unlimited', startFen: '' });
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const recommended = profileState ? ratingFor(profileState, setup.timeControl).recommendedBotElo : undefined;
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [evalPending, setEvalPending] = useState(false);
  const [drawMsg, setDrawMsg] = useState<string | null>(null);
  const [exerciseFeedback, setExerciseFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** Coup dangereux en attente de confirmation (filet anti-gaffe). */
  const [pendingMove, setPendingMove] = useState<{ move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }; risk: MoveRisk } | null>(null);
  const [avoided, setAvoided] = useState(0);
  const [planTarget, setPlanTarget] = useState<string | undefined>();
  const [drawMode, setDrawMode] = useState(false);
  const [comment, setComment] = useState<string | null>(null);
  const speechStatus = useSpeechStatus();
  const commentJob = useRef(0);
  /** Position consultée (null = direct). */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [botRecords, setBotRecords] = useState<Record<number, { wins: number; losses: number; draws: number }>>({});
  const botJob = useRef(0);

  useEffect(() => {
    void loadProfile(db).then((p) => {
      setProfileState(p);
      // Par défaut : le bot recommandé pour la cadence choisie.
      setSetup((s) => ({ ...s, botElo: g.records.length === 0 ? ratingFor(p, s.timeControl).recommendedBotElo : s.botElo }));
    });
    void db.plans.orderBy('generatedAt').reverse().first().then((plan) => setPlanTarget(plan?.targets[0]));
    // Bilan contre chaque bot.
    void db.games.toArray().then((games) => {
      const rec: Record<number, { wins: number; losses: number; draws: number }> = {};
      for (const game of games) {
        if (!game.botElo) continue;
        const r = (rec[game.botElo] ??= { wins: 0, losses: 0, draws: 0 });
        const sc = resultScore(game);
        if (sc === 1) r.wins++;
        else if (sc === 0) r.losses++;
        else r.draws++;
      }
      setBotRecords(rec);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retour au direct dès qu'un coup est joué ; flèches ← → pour consulter les positions précédentes.
  useEffect(() => {
    setViewPly(null);
    setHint(null);
  }, [g.records.length]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = g.records.length;
      if (n === 0) return;
      if (e.key === 'ArrowLeft') setViewPly((v) => Math.max(0, (v ?? n) - 1));
      if (e.key === 'ArrowRight') setViewPly((v) => (v === null || v + 1 >= n ? null : v + 1));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [g.records.length]);

  useEffect(() => () => stopSpeaking(), []);

  const turn = turnOf(g.fen);
  const botColor: Color | null = vsBot ? (g.playerColor === 'w' ? 'b' : 'w') : null;
  const isExplore = g.mode === 'explore';
  const movable: Color[] = g.status.over || viewPly !== null ? [] : g.mode === 'human' || isExplore ? ['w', 'b'] : [g.playerColor];
  const viewedFen = viewPly === null ? g.fen : viewPly === 0 ? g.startFen : g.records[viewPly - 1].fenAfter;
  const viewedLastMove = viewPly === null ? g.lastMove() : viewPly === 0 ? null : { from: g.records[viewPly - 1].from, to: g.records[viewPly - 1].to };

  // Boucle du bot.
  useEffect(() => {
    if (!engine || !vsBot || g.status.over || turn !== botColor || g.botThinking || viewPly !== null) return;
    const job = ++botJob.current;
    g.setBotThinking(true);
    const profile = profileFor(g.botElo);
    const history = g.startFen === START_FEN ? g.sans() : null;
    const started = Date.now();
    void (async () => {
      try {
        const choice = await botMove(engine, g.fen, history, profile);
        const wait = Math.max(0, thinkingDelayMs(profile) - (Date.now() - started));
        await new Promise((r) => setTimeout(r, wait));
        if (job !== botJob.current) return;
        if (choice) {
          const rec = useGame.getState().playMove({ from: choice.lan.slice(0, 2) as Square, to: choice.lan.slice(2, 4) as Square, promotion: (choice.lan[4] as 'q') || undefined });
          if (rec && settings.sounds) (rec.captured ? sounds.capture : rec.check ? sounds.check : sounds.move)();
          if (rec) void commentLastMove(rec);
        }
      } finally {
        if (job === botJob.current) useGame.getState().setBotThinking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, g.fen, g.mode, g.status.over, turn, botColor, g.botThinking, viewPly]);

  // Barre d'évaluation (et, en exploration, meilleur coup expliqué).
  const [suggestion, setSuggestion] = useState<{ san: string; lan: string; line: string[]; text: string } | null>(null);
  /** Indice progressif : niveau 0 = aucun, 1 = pièce, 2 = coup, 3 = explication. */
  const [hint, setHint] = useState<{ level: number; data: Hint | null; fen: string; loading: boolean } | null>(null);
  const [showBest, setShowBest] = useState(true);
  useEffect(() => {
    const explore = g.mode === 'explore';
    if (!engine || (!settings.showEvalBar && !explore) || g.mode === 'exercise') {
      setEvalCp(null);
      setSuggestion(null);
      return;
    }
    if (g.status.over) {
      if (g.status.reason === 'checkmate') setEvalCp(g.status.result === '1-0' ? 10000 : -10000);
      setSuggestion(null);
      return;
    }
    let alive = true;
    setEvalPending(true);
    engine
      .analyze(g.fen, { depth: explore ? 12 : 10 })
      .then((r) => {
        if (!alive) return;
        const l = r.lines[0];
        const cp = l ? lineScore(l) * (turn === 'w' ? 1 : -1) : 0;
        if (l) setEvalCp(cp);
        if (explore) {
          const lan = r.bestMove ?? l?.pv[0] ?? null;
          const line = lan ? pvToSan(g.fen, l?.pv.slice(0, 5) ?? [lan]) : [];
          const san = line[0] ?? null;
          const text = explorationComment(cp, san, g.fen, lan);
          setSuggestion(lan && san ? { san, lan, line, text } : null);
          setComment(text);
          const st = useSettings.getState().settings;
          if (st.voiceEnabled && st.liveComments !== 'off') void speak(text, { voiceName: st.voiceName, rate: st.voiceRate });
        }
      })
      .catch(() => {})
      .finally(() => alive && setEvalPending(false));
    return () => {
      alive = false;
    };
  }, [engine, g.fen, settings.showEvalBar, g.mode, turn, g.status]);

  // Pendules : décompte du camp au trait.
  useEffect(() => {
    if (!g.clocks || g.status.over || viewPly !== null) return;
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      useGame.getState().tick(now - last);
      last = now;
    }, 250);
    return () => window.clearInterval(id);
  }, [g.clocks !== null, g.status.over, g.records.length, viewPly]);

  // Fin de partie : sauvegarde unique.
  useEffect(() => {
    if (!g.status.over || g.savedGameId || g.mode === 'exercise' || g.mode === 'explore' || saving) return;
    if (g.records.length === 0) return;
    setSaving(true);
    if (settings.sounds) sounds.end();
    const st = g.status;
    void saveFinishedGame({
      startFen: g.startFen,
      records: g.records,
      playerColor: g.playerColor,
      botElo: g.botElo,
      result: st.result,
      endReason: st.reason,
      startedAt: g.startedAt,
      mode: g.mode,
      goal: g.goal,
      timeControl: g.timeControl,
      hints: g.hintsUsed,
    })
      .then((game) => {
        g.setSavedGameId(game.id);
        setToast('Partie enregistrée dans l\'historique');
      })
      .finally(() => setSaving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.status.over, g.savedGameId]);

  /** Commente le dernier coup (descriptif immédiat, puis avis du moteur si activé) et le lit à voix haute. */
  const commentLastMove = useCallback(
    async (rec: MoveRecord) => {
      const st = useSettings.getState().settings;
      if (st.liveComments === 'off' || useGame.getState().mode === 'explore') return;
      const job = ++commentJob.current;
      const pc = useGame.getState().playerColor;
      let text = describeLiveMove(rec, pc);
      const gs = useGame.getState();
      if (gs.startFen === START_FEN) {
        const sans = gs.records.map((r) => r.san);
        const ann = openingAnnouncement(sans, sans.length);
        if (ann) text = `Ouverture : ${openingLabel(ann)}. ${text}`;
      }
      setComment(text);
      const say = (t: string): Promise<void> => (st.voiceEnabled ? speak(t, { voiceName: st.voiceName, rate: st.voiceRate }) : Promise.resolve());
      // On lit tout de suite la description ; l'avis du moteur sera lu à la suite, sans couper la phrase.
      const firstSpeech = say(text);
      if (st.liveComments !== 'full' || !engine || rec.color !== pc) return;
      // Avis du moteur sur mon coup : deux évaluations rapides (avant / après).
      try {
        const [before, after] = await Promise.all([
          engine.analyze(rec.fenBefore, { depth: 10 }),
          engine.analyze(rec.fenAfter, { depth: 10 }),
        ]);
        if (job !== commentJob.current) return;
        const toPos = (fen: string, r: typeof before) => {
          const l = r.lines[0];
          const stm = fen.split(' ')[1] === 'w' ? 1 : -1;
          const cp = l ? lineScore(l) * stm : 0;
          return { cpWhite: cp, mate: l?.mate ?? null, bestLan: r.bestMove ?? l?.pv[0] ?? null, pv: l?.pv ?? [] };
        };
        const ev = buildMoveEval(rec, toPos(rec.fenBefore, before), toPos(rec.fenAfter, after), useGame.getState().records.slice(0, -1));
        const why = explainBest(ev, true);
        const verdict =
          ev.category === 'excellent'
            ? 'Excellent coup.'
            : ev.category === 'good'
              ? `Bon coup.${why && ev.bestMove ? ` Le meilleur coup était ${spoken(ev.bestMove)}.` : ''}`
              : `${CATEGORY_LABEL[ev.category]}${ev.bestMove ? `, mieux valait ${spoken(ev.bestMove)}.` : '.'}`;
        const verdictText = `${verdict}${why ? ` ${why}` : ''}`;
        text = `${text} ${verdictText}`;
        setComment(text);
        await firstSpeech;
        if (job !== commentJob.current) return;
        void say(verdictText);
      } catch {
        /* moteur indisponible : la description a déjà été lue */
      }
    },
    [engine],
  );

  const askHint = async () => {
    if (!engine) return;
    const fen = g.fen;
    // Même position : on monte d'un niveau.
    if (hint && hint.fen === fen && hint.data) {
      const level = Math.min(3, hint.level + 1);
      setHint({ ...hint, level });
      if (level === 3 && settings.voiceEnabled) void speak(hint.data.explanation, { voiceName: settings.voiceName, rate: settings.voiceRate });
      return;
    }
    setHint({ level: 1, data: null, fen, loading: true });
    g.addHint();
    try {
      const nf = nullMoveFen(fen);
      const [main, threat] = await Promise.all([
        engine.analyze(fen, { depth: 12, multiPv: 3 }),
        nf ? engine.analyze(nf, { depth: 8, multiPv: 1 }).catch(() => null) : Promise.resolve(null),
      ]);
      if (useGame.getState().fen !== fen) return;
      const data = buildHint(fen, main.lines, threat?.lines ?? null, true);
      setHint({ level: 1, data, fen, loading: false });
      if (data && settings.voiceEnabled) void speak(`Indice : regarde ${data.pieceName === 'dame' || data.pieceName === 'tour' ? 'ta' : 'ton'} ${data.pieceName} en ${data.pieceSquare}.`, { voiceName: settings.voiceName, rate: settings.voiceRate });
    } catch {
      setHint(null);
    }
  };

  const applyMoveNow = useCallback(
    (m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
      const fenBefore = useGame.getState().fen;
      const rec = useGame.getState().playMove(m);
      if (!rec) return;
      if (settings.sounds) (rec.captured ? sounds.capture : rec.check ? sounds.check : sounds.move)();
      void commentLastMove(rec);
      const gs = useGame.getState();
      if (gs.mode === 'exercise' && gs.exerciseBestMove && gs.records.length === 1) {
        const best = gs.exerciseBestMove;
        const ok = rec.san === best || rec.lan === best || lanToSan(fenBefore, best) === rec.san || (best.endsWith('#') && rec.mate);
        setExerciseFeedback(ok ? { ok: true, text: `Bien joué : ${rec.san} était le bon coup.` } : { ok: false, text: `${rec.san} n'est pas le meilleur coup. Le moteur préférait ${best}. Annule et réessaie, ou continue la partie.` });
        // Répétition espacée : on enregistre le premier essai seulement.
        if (gs.exerciseDrillId && !gs.exerciseTheme) void recordDrillResult(gs.exerciseDrillId, ok).then(() => setToast(ok ? 'Fiche validée : prochaine révision plus tard' : 'Fiche à revoir demain'));
      }
    },
    [settings.sounds, commentLastMove],
  );

  const onMove = useCallback(
    (m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
      const gs = useGame.getState();
      const level = useSettings.getState().settings.blunderCheck;
      // Filet anti-gaffe : seulement pour le joueur (pas en mode exercice, où l'erreur fait partie de l'apprentissage).
      if (level !== 'off' && gs.mode !== 'exercise' && gs.mode !== 'explore' && (gs.mode === 'human' || turnOf(gs.fen) === gs.playerColor)) {
        const risk = assessMoveRisk(gs.fen, `${m.from}${m.to}${m.promotion ?? ''}`, level);
        if (risk) {
          setPendingMove({ move: m, risk });
          return;
        }
      }
      applyMoveNow(m);
    },
    [applyMoveNow],
  );

  const startGame = async () => {
    const color: Color = setup.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
    botJob.current++;
    const goal = setup.mode === 'bot' ? goalFor(planTarget) ?? null : null;
    let startFen: string | undefined;
    if (setup.mode === 'explore' && setup.startFen.trim()) {
      try {
        const { Chess } = await import('chess.js');
        startFen = new Chess(setup.startFen.trim()).fen();
      } catch {
        setToast('Position FEN invalide : départ depuis la position initiale.');
      }
    }
    g.newGame({ mode: setup.mode, playerColor: color, botElo: setup.botElo, goal, timeControl: setup.mode === 'bot' || setup.mode === 'human' ? setup.timeControl : 'unlimited', startFen });
    g.setHeatmapMode(settings.defaultHeatmapMode);
    stopSpeaking();
    setComment(goal ? `Objectif de cette partie : ${goal.label.toLowerCase()}.` : null);
    setPendingMove(null);
    setAvoided(0);
    setSetupOpen(false);
    setExerciseFeedback(null);
    setDrawMsg(null);
  };

  const undo = () => {
    botJob.current++;
    const plies = vsBot ? (turn === g.playerColor ? 2 : 1) : 1;
    g.undo(plies);
    setExerciseFeedback(null);
  };

  const offerDraw = async () => {
    if (g.mode !== 'bot' || !engine) {
      g.agreeDraw();
      return;
    }
    if (g.records.length < 20) {
      setDrawMsg('Le bot refuse : la partie vient de commencer.');
      return;
    }
    const r = await engine.analyze(g.fen, { depth: 8 });
    const cp = r.lines[0] ? lineScore(r.lines[0]) * (turn === botColor ? 1 : -1) : 0;
    if (cp < 60) {
      g.agreeDraw();
    } else setDrawMsg('Le bot refuse la nulle : il pense avoir l\'avantage.');
  };

  const arrows: Arrow[] = useMemo(() => {
    const out: Arrow[] = [];
    if (isExplore && showBest && suggestion && viewPly === null) out.push({ from: suggestion.lan.slice(0, 2) as Square, to: suggestion.lan.slice(2, 4) as Square, color: '#2ecc71' });
    if (hint && hint.data && hint.level >= 2 && hint.fen === g.fen && viewPly === null) out.push({ from: hint.data.bestLan.slice(0, 2) as Square, to: hint.data.bestLan.slice(2, 4) as Square, color: '#f5c542' });
    return out;
  }, [isExplore, showBest, suggestion, viewPly, hint, g.fen]);
  const hintMarked: Square[] | undefined = hint && hint.data && hint.level >= 1 && hint.fen === g.fen && viewPly === null ? [hint.data.pieceSquare] : undefined;
  const attackOptions = useMemo(() => ({ ignorePinned: settings.ignorePinned, xray: settings.xray }), [settings.ignorePinned, settings.xray]);
  const playerLabel = colorLabel(g.playerColor, palette);
  const opening = useMemo(() => (g.startFen === START_FEN ? openingForGame(g.records.map((r) => r.san)) : null), [g.records, g.startFen]);
  const botProfile = profileFor(g.botElo);

  const statusText = (() => {
    if (!g.status.over) {
      if (vsBot && turn === botColor) return `${botProfile.name} réfléchit…`;
      return `Trait au ${colorLabel(turn, palette)}`;
    }
    const s = g.status;
    const reason: Record<string, string> = { checkmate: 'Échec et mat', stalemate: 'Pat', repetition: 'Nulle par répétition', 'fifty-moves': 'Nulle (50 coups)', insufficient: 'Matériel insuffisant', resign: 'Abandon', 'draw-agreed': 'Nulle acceptée', timeout: 'Temps écoulé' };
    const who = s.result === '1-0' ? `${colorLabel('w', palette)} gagne` : s.result === '0-1' ? `${colorLabel('b', palette)} gagne` : 'Partie nulle';
    return `${reason[s.reason]} · ${who}`;
  })();

  return (
    <div className="play-layout">
      <div>
        <PlayerBar color={g.flipped ? g.playerColor : (botColor ?? 'b')} name={g.flipped ? (vsBot ? `Moi (${playerLabel})` : colorLabel('w', palette)) : vsBot ? `${botProfile.name} (${g.botElo})` : `${colorLabel('b', palette)}${isExplore ? ' (moi)' : ''}`} palette={palette} active={turn === (g.flipped ? g.playerColor : (botColor ?? 'b')) && !g.status.over} thinking={!g.flipped && g.botThinking} fen={viewedFen} clockMs={g.clocks ? g.clocks[g.flipped ? g.playerColor : (botColor ?? 'b')] : null} />
        <div className="board-row">
          {settings.showEvalBar && g.mode !== 'exercise' && <EvalBarVertical cp={evalCp} flipped={g.flipped} palette={palette} pending={evalPending} />}
          <Board
            fen={viewedFen}
            flipped={g.flipped}
            movable={movable}
            onMove={onMove}
            lastMove={viewedLastMove}
            arrows={arrows}
            heatmapMode={g.heatmapMode}
            palette={palette}
            intensity={settings.heatmapIntensity}
            showCounts={settings.showCounts}
            showHanging={settings.showHanging}
            showLoose={settings.showLoose}
            hatching={settings.hatching}
            attackOptions={attackOptions}
            animations={settings.animations}
            drawMode={drawMode}
            onDrawModeChange={setDrawMode}
            marked={hintMarked}
          />
        </div>
        <PlayerBar color={g.flipped ? (botColor ?? 'b') : g.playerColor} name={g.flipped ? (vsBot ? `${botProfile.name} (${g.botElo})` : colorLabel('b', palette)) : vsBot ? `Moi (${playerLabel})` : `${colorLabel('w', palette)}${isExplore ? ' (moi)' : ''}`} palette={palette} active={turn === (g.flipped ? (botColor ?? 'b') : g.playerColor) && !g.status.over} thinking={g.flipped && g.botThinking} fen={viewedFen} clockMs={g.clocks ? g.clocks[g.flipped ? (botColor ?? 'b') : g.playerColor] : null} />
        {g.records.length > 0 && (
          <div className="review-bar" data-testid="review-bar">
            <button type="button" className="btn btn-sm" onClick={() => setViewPly(0)} title="Début">⏮</button>
            <button type="button" className="btn btn-sm" onClick={() => setViewPly((v) => Math.max(0, (v ?? g.records.length) - 1))} title="Coup précédent">◀</button>
            <span className="muted small">{viewPly === null ? 'direct' : `coup ${viewPly}/${g.records.length}`}</span>
            <button type="button" className="btn btn-sm" onClick={() => setViewPly((v) => (v === null || v + 1 >= g.records.length ? null : v + 1))} title="Coup suivant">▶</button>
            {viewPly !== null && (
              <button type="button" className="btn btn-sm btn-primary" data-testid="back-live" onClick={() => setViewPly(null)}>
                Retour au direct
              </button>
            )}
          </div>
        )}
        <HeatmapToolbar mode={g.heatmapMode} onChange={g.setHeatmapMode} drawMode={drawMode} onDrawModeChange={setDrawMode} />
      </div>
      <aside className="side-panel">
        <div className="card">
          <div className="row spread">
            <span className="pill-status" data-testid="status">
              {vsBot && turn === botColor && !g.status.over && <span className="pulse" />}
              {statusText}
            </span>
          </div>
          {engineError && (
            <p className="small" style={{ color: 'var(--red-2)' }}>
              Moteur indisponible : {engineError}{' '}
              <button type="button" className="btn btn-sm" data-testid="engine-retry" onClick={retryEngine}>
                Réessayer
              </button>
            </p>
          )}
          {!engine && !engineError && vsBot && <p className="muted small">Chargement du moteur…</p>}
          {exerciseFeedback && (
            <p data-testid="exercise-feedback" style={{ color: exerciseFeedback.ok ? '#2ecc71' : 'var(--accent)' }}>
              {exerciseFeedback.text}
            </p>
          )}
          {drawMsg && <p className="muted small">{drawMsg}</p>}
          {!isExplore && !g.status.over && viewPly === null && (turn === g.playerColor || g.mode === 'human') && (
            <div style={{ marginTop: '.5rem' }} data-testid="hint-box">
              <button type="button" className="btn btn-sm" data-testid="hint" disabled={!engine || (hint?.loading ?? false) || (hint?.level ?? 0) >= 3} onClick={() => void askHint()} title="Indice progressif : la pièce, puis le coup, puis l'explication">
                💡 {hint?.loading ? 'Le coach réfléchit…' : !hint || hint.fen !== g.fen ? 'Indice' : hint.level === 1 ? 'Indice : montrer le coup' : hint.level === 2 ? 'Indice : pourquoi ?' : 'Indice complet'}
              </button>
              {hint && hint.data && hint.fen === g.fen && (
                <div className="small" style={{ marginTop: '.4rem' }} data-testid="hint-text">
                  {hint.level >= 1 && <p style={{ margin: 0 }}><span className="tag tag-accent">Indice 1</span> Regarde {hint.data.pieceName === 'dame' || hint.data.pieceName === 'tour' ? 'ta' : 'ton'} {hint.data.pieceName} en <strong>{hint.data.pieceSquare}</strong>.</p>}
                  {hint.level >= 2 && <p style={{ margin: '.3rem 0 0' }}><span className="tag tag-accent">Indice 2</span> Le meilleur coup est <strong>{hint.data.bestSan}</strong> (flèche jaune).</p>}
                  {hint.level >= 3 && (
                    <div style={{ marginTop: '.4rem', padding: '.6rem .75rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-3)', borderLeft: '3px solid var(--accent)' }}>
                      <strong>Pourquoi {hint.data.bestSan} est le meilleur :</strong> {hint.data.explanation}
                      {hint.data.line.length > 1 && <div className="muted" style={{ marginTop: '.3rem' }}>Suite possible : {hint.data.line.join(' ')}</div>}
                    </div>
                  )}
                </div>
              )}
              {hint && !hint.loading && !hint.data && hint.fen === g.fen && <p className="muted small" style={{ margin: '.3rem 0 0' }}>Pas d'indice disponible ici.</p>}
            </div>
          )}
          <div className="btn-row" style={{ marginTop: '.5rem' }}>
            <button type="button" className="btn btn-primary" data-testid="new-game" onClick={() => setSetupOpen(true)}>
              Nouvelle partie
            </button>
            <button type="button" className="btn btn-sm" onClick={() => g.setFlipped(!g.flipped)} title="Retourner l'échiquier">
              Retourner
            </button>
            {g.mode !== 'exercise' && !isExplore && (
              <button
                type="button"
                className={`btn btn-sm ${settings.blunderCheck !== 'off' ? '' : 'btn-ghost'}`}
                data-testid="blundercheck-toggle"
                aria-pressed={settings.blunderCheck !== 'off'}
                title="Filet anti-gaffe : demander confirmation avant un coup dangereux"
                onClick={() => void useSettings.getState().update({ blunderCheck: settings.blunderCheck === 'off' ? 'blunders' : 'off' })}
              >
                {settings.blunderCheck !== 'off' ? 'Es-tu sûr ? : activé' : 'Es-tu sûr ? : coupé'}
              </button>
            )}
            {g.mode !== 'exercise' && (
              <button type="button" className={`btn btn-sm ${settings.showEvalBar ? '' : 'btn-ghost'}`} data-testid="evalbar-toggle" aria-pressed={settings.showEvalBar} onClick={() => void useSettings.getState().update({ showEvalBar: !settings.showEvalBar })} title="Afficher ou masquer la barre d'évaluation (qui a l'avantage)">
                {settings.showEvalBar ? 'Masquer la barre' : 'Barre d\'avantage'}
              </button>
            )}
            {(settings.allowUndo || !vsBot) && (
              <button type="button" className="btn btn-sm" data-testid="undo" disabled={g.records.length === 0 || g.status.over} onClick={undo}>
                Annuler
              </button>
            )}
            {!g.status.over && g.records.length > 0 && g.mode !== 'exercise' && !isExplore && (
              <>
                <button type="button" className="btn btn-sm" onClick={() => void offerDraw()}>
                  Proposer nulle
                </button>
                <button type="button" className="btn btn-sm btn-danger" data-testid="resign" onClick={() => g.resign()}>
                  Abandonner
                </button>
              </>
            )}
          </div>
          {g.status.over && g.savedGameId && (
            <div className="btn-row" style={{ marginTop: '.75rem' }}>
              <button type="button" className="btn btn-primary" data-testid="go-debrief" onClick={() => navigate(`debrief/${g.savedGameId}`)}>
                Analyser la partie et voir mon Elo de performance
              </button>
            </div>
          )}
          {g.mode === 'exercise' && (
            <div style={{ marginTop: '.5rem' }}>
              <p className="muted small" style={{ margin: 0 }}>
                Exercice : trouve le meilleur coup. <a href="#/entrainement">Retour à l'entraînement</a>
              </p>
              {g.exerciseHint && (
                <p className="small" style={{ margin: '.3rem 0 0' }} data-testid="exercise-hint">
                  <span className="tag tag-accent">Indice</span> {g.exerciseHint}
                </p>
              )}
              {g.exerciseTheme && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  style={{ marginTop: '.5rem' }}
                  data-testid="next-puzzle"
                  onClick={() => {
                    botJob.current++;
                    stopSpeaking();
                    setExerciseFeedback(null);
                    launchPuzzle(g.exerciseTheme as PuzzleTheme, g.exerciseDrillId ?? undefined);
                  }}
                >
                  Puzzle suivant
                </button>
              )}
            </div>
          )}
        </div>
        {(settings.liveComments !== 'off' || isExplore) && (
          <div className="card" data-testid="live-comment">
            <div className="card-title">
              <IconKnight className="ico" />
              <h3>Coach</h3>
              {settings.voiceEnabled && (
                <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => comment && void speak(comment, { voiceName: settings.voiceName, rate: settings.voiceRate })} title="Relire">
                  🔊
                </button>
              )}
            </div>
            {g.goal && (
              <p className="small" style={{ margin: '0 0 .4rem' }} data-testid="game-goal">
                <span className="tag tag-accent">Objectif</span> {g.goal.label}
              </p>
            )}
            <p className="small" style={{ margin: 0 }}>{comment ?? 'Je commente chaque coup ici. Active la voix dans les réglages pour m\'entendre.'}</p>
            {avoided > 0 && <p className="muted small" style={{ margin: '.3rem 0 0' }}>Gaffes évitées grâce au filet : {avoided}</p>}
            {isExplore && (
              <div className="btn-row" style={{ marginTop: '.5rem' }} data-testid="explore-tools">
                <button type="button" className="btn btn-sm btn-primary" data-testid="play-best" disabled={!suggestion || g.status.over} onClick={() => suggestion && applyMoveNow({ from: suggestion.lan.slice(0, 2) as Square, to: suggestion.lan.slice(2, 4) as Square, promotion: (suggestion.lan[4] as 'q') || undefined })}>
                  Jouer le meilleur coup{suggestion ? ` (${suggestion.san})` : ''}
                </button>
                <button type="button" className={`btn btn-sm ${showBest ? '' : 'btn-ghost'}`} onClick={() => setShowBest((v) => !v)}>
                  {showBest ? 'Cacher la flèche' : 'Montrer la flèche'}
                </button>
                {suggestion && suggestion.line.length > 1 && <span className="muted small">Suite : {suggestion.line.join(' ')}</span>}
              </div>
            )}
            {settings.voiceEnabled && speechStatus.state === 'preparing' && <p className="muted small" style={{ margin: '.3rem 0 0' }}>Préparation de la voix HD…</p>}
            {settings.voiceEnabled && speechStatus.state === 'speaking' && <p className="muted small" style={{ margin: '.3rem 0 0' }}>🔊 lecture ({speechStatus.engine === 'hd' ? 'voix HD' : 'voix du navigateur'})</p>}
            {settings.voiceEnabled && speechStatus.state === 'error' && (
              <p className="small" style={{ margin: '.3rem 0 0', color: 'var(--red-2)' }} data-testid="speech-error">
                {speechStatus.message}
              </p>
            )}
          </div>
        )}
        <div className="card">
          <div className="card-title">
            <IconList className="ico" />
            <h3>Coups</h3>
          </div>
          {opening && (
            <p className="small" style={{ margin: '0 0 .4rem' }} data-testid="opening-live">
              <span className="tag tag-accent">{opening.eco}</span> {openingLabel(opening)}
            </p>
          )}
          <MoveList moves={g.records.map((r) => ({ ply: r.ply, san: r.san }))} current={viewPly ?? g.records.length} onSelect={(ply) => setViewPly(ply >= g.records.length ? null : ply)} />
        </div>
        <div className="card small muted">
          <div className="card-title" style={{ color: 'var(--text)' }}>
            <IconKnight className="ico" />
            <h3>Lire la heatmap</h3>
          </div>
          <div className="legend" style={{ marginBottom: '.4rem' }}>
            <span><i style={{ background: palette.w.overlay }} />attaquée par le Bleu</span>
            <span><i style={{ background: palette.b.overlay }} />attaquée par le Rouge</span>
            <span><i style={{ background: `linear-gradient(135deg, ${palette.w.overlay} 50%, ${palette.b.overlay} 50%)` }} />contestée</span>
          </div>
          <p className="small" style={{ margin: '0 0 .4rem' }}><strong>Flèches et marques :</strong> clic droit sur une case pour la marquer, clic droit glissé pour une flèche (Maj rouge, Alt bleu, Ctrl jaune) ; clic gauche dans le vide ou Échap pour effacer. Sur mobile : appui long. Le bouton ✎ sur l'échiquier permet de dessiner au clic gauche.</p>
          <strong>Heatmap :</strong> chiffres = nombre d'attaquants (Bleu en haut à gauche, Rouge en bas à droite). Anneau pulsant = pièce en prise. Raccourcis clavier A B R C P H X.
        </div>
      </aside>

      <Toast text={toast} onDone={() => setToast(null)} />
      {pendingMove && (
        <Modal title="Attends, es-tu sûr ?">
          <div className="stack" data-testid="blunder-check">
            <p>
              {pendingMove.risk.severity === 'mate' ? 'Danger de mat : ' : 'Ce coup semble risqué : '}
              {pendingMove.risk.reasons.join(' ; ')}.
            </p>
            <p className="muted small">Regarde la heatmap autour de tes pièces avant de décider. Tu peux désactiver ce filet dans les réglages quand tu n'en auras plus besoin.</p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="blunder-rethink"
                onClick={() => {
                  setPendingMove(null);
                  setAvoided((n) => n + 1);
                }}
              >
                Je réfléchis encore
              </button>
              <button
                type="button"
                className="btn"
                data-testid="blunder-play"
                onClick={() => {
                  const m = pendingMove.move;
                  setPendingMove(null);
                  applyMoveNow(m);
                }}
              >
                Jouer quand même
              </button>
            </div>
          </div>
        </Modal>
      )}
      {setupOpen && (
        <Modal title="Nouvelle partie" onClose={g.records.length > 0 ? () => setSetupOpen(false) : undefined}>
          <div className="stack">
            <div className="tabs">
              <button type="button" className={`tab ${setup.mode === 'bot' ? 'active' : ''}`} onClick={() => setSetup({ ...setup, mode: 'bot' })}>
                Contre un bot
              </button>
              <button type="button" className={`tab ${setup.mode === 'human' ? 'active' : ''}`} data-testid="mode-human" onClick={() => setSetup({ ...setup, mode: 'human' })}>
                Deux joueurs
              </button>
              <button type="button" className={`tab ${setup.mode === 'explore' ? 'active' : ''}`} data-testid="mode-explore" onClick={() => setSetup({ ...setup, mode: 'explore' })}>
                Exploration
              </button>
            </div>
            {setup.mode !== 'explore' && (
              <div>
                <div className="muted small">Cadence {setup.mode === 'bot' && '(chaque cadence a son propre Elo)'}</div>
                <div className="segmented" role="radiogroup" aria-label="Cadence">
                  {TIME_CONTROL_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={setup.timeControl === k}
                      className={setup.timeControl === k ? 'active' : ''}
                      data-testid={`tc-${k}`}
                      onClick={() => setSetup({ ...setup, timeControl: k, botElo: profileState ? ratingFor(profileState, k).recommendedBotElo : setup.botElo })}
                    >
                      {TIME_CONTROLS[k].label}
                    </button>
                  ))}
                </div>
                {profileState && setup.mode === 'bot' && (
                  <p className="muted small" style={{ margin: '.3rem 0 0' }}>
                    Ton Elo {TIME_CONTROLS[setup.timeControl].label.toLowerCase()} : <strong>{ratingFor(profileState, setup.timeControl).elo}</strong> · bot recommandé : {ratingFor(profileState, setup.timeControl).recommendedBotElo}
                  </p>
                )}
              </div>
            )}
            {setup.mode === 'explore' && (
              <div className="stack" style={{ gap: '.4rem' }}>
                <p className="small" style={{ margin: 0 }}>
                  Tu joues les deux camps, sans pendule ni classement. À chaque coup : barre d'avantage, commentaire de la position et meilleur coup expliqué (flèche verte). Idéal pour tester une idée ou une position.
                </p>
                <label className="small">
                  Position de départ (FEN, facultatif)
                  <input type="text" value={setup.startFen} placeholder="Laisser vide pour la position initiale" style={{ width: '100%', marginTop: '.25rem' }} data-testid="explore-fen" onChange={(e) => setSetup({ ...setup, startFen: e.target.value })} />
                </label>
              </div>
            )}
            {setup.mode === 'bot' && (
              <>
                <BotSelector elo={setup.botElo} recommended={recommended} record={botRecords[setup.botElo]} onChange={(e) => setSetup({ ...setup, botElo: e })} />
                <div>
                  <div className="muted small">Mon camp</div>
                  <div className="btn-row">
                    {(['w', 'b', 'random'] as const).map((c) => (
                      <button key={c} type="button" className={`btn btn-sm ${setup.color === c ? 'btn-primary' : ''}`} data-testid={`color-${c}`} onClick={() => setSetup({ ...setup, color: c })}>
                        {c === 'random' ? 'Aléatoire' : colorLabel(c, palette)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="btn-row">
              <button type="button" className="btn btn-primary" data-testid="start-game" onClick={startGame}>
                Commencer
              </button>
              {g.records.length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => setSetupOpen(false)}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function PlayerBar({ color, name, palette, active, thinking, fen, clockMs }: { color: Color; name: string; palette: ReturnType<typeof useSettings.getState>['palette']; active: boolean; thinking?: boolean; fen: string; clockMs?: number | null }) {
  return (
    <div className={`player-bar ${active ? 'active' : ''}`} style={{ ['--ring' as string]: palette[color].ring }}>
      <span className="side">
        <span className="dot" style={{ background: palette[color].piece }} /> {name}
        {clockMs !== null && clockMs !== undefined && (
          <span className={`clock ${clockMs < 30_000 ? 'low' : ''} ${active ? 'running' : ''}`} data-testid={`clock-${color}`}>
            {formatClock(clockMs)}
          </span>
        )}
      </span>
      <span className="row" style={{ gap: '.5rem' }}>
        <Material fen={fen} color={color} fill={palette[color === 'w' ? 'b' : 'w'].piece} />
        {thinking && (
          <span className="thinking">
            <span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} /> réfléchit…
          </span>
        )}
      </span>
    </div>
  );
}
