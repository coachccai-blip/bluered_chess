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
import { IconList, IconKnight } from '../ui/icons';
import { describeLiveMove, spoken, explainBest } from '../analysis/explain';
import { openingAnnouncement, openingForGame, openingLabel } from '../chess/openings';
import { speak, stopSpeaking, useSpeechStatus } from '../ui/speech';
import { buildMoveEval } from '../analysis/analyzeGame';
import { CATEGORY_LABEL } from '../analysis/classify';

interface PendingSetup {
  mode: 'bot' | 'human';
  color: 'w' | 'b' | 'random';
  botElo: number;
}

export function Play() {
  const g = useGame();
  const { settings, palette } = useSettings();
  const { engine, error: engineError, retry: retryEngine } = useEngine();
  const vsBot = g.mode === 'bot' || g.mode === 'exercise';
  const [setupOpen, setSetupOpen] = useState(g.records.length === 0 && g.mode === 'bot' && !g.exerciseBestMove);
  const [setup, setSetup] = useState<PendingSetup>({ mode: 'bot', color: 'w', botElo: g.botElo });
  const [recommended, setRecommended] = useState<number | undefined>();
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
      setRecommended(p.recommendedBotElo);
      setSetup((s) => ({ ...s, botElo: g.records.length === 0 ? p.recommendedBotElo : s.botElo }));
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
  const movable: Color[] = g.status.over || viewPly !== null ? [] : g.mode === 'human' ? ['w', 'b'] : [g.playerColor];
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

  // Barre d'évaluation optionnelle.
  useEffect(() => {
    if (!engine || !settings.showEvalBar || g.mode === 'exercise') {
      setEvalCp(null);
      return;
    }
    if (g.status.over && g.status.reason === 'checkmate') {
      setEvalCp(g.status.result === '1-0' ? 10000 : -10000);
      return;
    }
    let alive = true;
    setEvalPending(true);
    engine
      .analyze(g.fen, { depth: 10 })
      .then((r) => {
        if (!alive) return;
        const l = r.lines[0];
        if (l) setEvalCp(lineScore(l) * (turn === 'w' ? 1 : -1));
      })
      .catch(() => {})
      .finally(() => alive && setEvalPending(false));
    return () => {
      alive = false;
    };
  }, [engine, g.fen, settings.showEvalBar, g.mode, turn, g.status]);

  // Fin de partie : sauvegarde unique.
  useEffect(() => {
    if (!g.status.over || g.savedGameId || g.mode === 'exercise' || saving) return;
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
      if (st.liveComments === 'off') return;
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
        const verdict = ev.category === 'excellent' || ev.category === 'good' ? `${CATEGORY_LABEL[ev.category]} coup.` : `${CATEGORY_LABEL[ev.category]}${ev.bestMove ? `, mieux valait ${spoken(ev.bestMove)}.` : '.'}`;
        const why = explainBest(ev, true);
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
        const ok = rec.san === best || rec.lan === best || lanToSan(fenBefore, best) === rec.san;
        setExerciseFeedback(ok ? { ok: true, text: `Bien joué : ${rec.san} était le bon coup.` } : { ok: false, text: `${rec.san} n'est pas le meilleur coup. Le moteur préférait ${best}. Annule et réessaie, ou continue la partie.` });
        // Répétition espacée : on enregistre le premier essai seulement.
        if (gs.exerciseDrillId) void recordDrillResult(gs.exerciseDrillId, ok).then(() => setToast(ok ? 'Fiche validée : prochaine révision plus tard' : 'Fiche à revoir demain'));
      }
    },
    [settings.sounds, commentLastMove],
  );

  const onMove = useCallback(
    (m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
      const gs = useGame.getState();
      const level = useSettings.getState().settings.blunderCheck;
      // Filet anti-gaffe : seulement pour le joueur (pas en mode exercice, où l'erreur fait partie de l'apprentissage).
      if (level !== 'off' && gs.mode !== 'exercise' && (gs.mode === 'human' || turnOf(gs.fen) === gs.playerColor)) {
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

  const startGame = () => {
    const color: Color = setup.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
    botJob.current++;
    const goal = setup.mode === 'bot' ? goalFor(planTarget) ?? null : null;
    g.newGame({ mode: setup.mode, playerColor: color, botElo: setup.botElo, goal });
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

  const arrows: Arrow[] = useMemo(() => [], []);
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
    const reason: Record<string, string> = { checkmate: 'Échec et mat', stalemate: 'Pat', repetition: 'Nulle par répétition', 'fifty-moves': 'Nulle (50 coups)', insufficient: 'Matériel insuffisant', resign: 'Abandon', 'draw-agreed': 'Nulle acceptée' };
    const who = s.result === '1-0' ? `${colorLabel('w', palette)} gagne` : s.result === '0-1' ? `${colorLabel('b', palette)} gagne` : 'Partie nulle';
    return `${reason[s.reason]} · ${who}`;
  })();

  return (
    <div className="play-layout">
      <div>
        <PlayerBar color={g.flipped ? g.playerColor : (botColor ?? 'b')} name={g.flipped ? (vsBot ? `Moi (${playerLabel})` : colorLabel('w', palette)) : vsBot ? `${botProfile.name} (${g.botElo})` : colorLabel('b', palette)} palette={palette} active={turn === (g.flipped ? g.playerColor : (botColor ?? 'b')) && !g.status.over} thinking={!g.flipped && g.botThinking} fen={viewedFen} />
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
          />
        </div>
        <PlayerBar color={g.flipped ? (botColor ?? 'b') : g.playerColor} name={g.flipped ? (vsBot ? `${botProfile.name} (${g.botElo})` : colorLabel('b', palette)) : vsBot ? `Moi (${playerLabel})` : colorLabel('w', palette)} palette={palette} active={turn === (g.flipped ? (botColor ?? 'b') : g.playerColor) && !g.status.over} thinking={g.flipped && g.botThinking} fen={viewedFen} />
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
          <div className="btn-row" style={{ marginTop: '.5rem' }}>
            <button type="button" className="btn btn-primary" data-testid="new-game" onClick={() => setSetupOpen(true)}>
              Nouvelle partie
            </button>
            <button type="button" className="btn btn-sm" onClick={() => g.setFlipped(!g.flipped)} title="Retourner l'échiquier">
              Retourner
            </button>
            {g.mode !== 'exercise' && (
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
            {!g.status.over && g.records.length > 0 && g.mode !== 'exercise' && (
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
                Analyser la partie
              </button>
            </div>
          )}
          {g.mode === 'exercise' && (
            <p className="muted small" style={{ marginTop: '.5rem' }}>
              Exercice : trouve le meilleur coup. <a href="#/entrainement">Retour à l'entraînement</a>
            </p>
          )}
        </div>
        {settings.liveComments !== 'off' && (
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
            </div>
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

function PlayerBar({ color, name, palette, active, thinking, fen }: { color: Color; name: string; palette: ReturnType<typeof useSettings.getState>['palette']; active: boolean; thinking?: boolean; fen: string }) {
  return (
    <div className={`player-bar ${active ? 'active' : ''}`} style={{ ['--ring' as string]: palette[color].ring }}>
      <span className="side">
        <span className="dot" style={{ background: palette[color].piece }} /> {name}
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
