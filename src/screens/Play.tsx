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
import { START_FEN, turnOf, lanToSan } from '../chess/game';
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
import { IconList, IconKnight } from '../ui/icons';

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
  const [drawMsg, setDrawMsg] = useState<string | null>(null);
  const [exerciseFeedback, setExerciseFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** Position consultée (null = direct). */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [botRecords, setBotRecords] = useState<Record<number, { wins: number; losses: number; draws: number }>>({});
  const botJob = useRef(0);

  useEffect(() => {
    void loadProfile(db).then((p) => {
      setRecommended(p.recommendedBotElo);
      setSetup((s) => ({ ...s, botElo: g.records.length === 0 ? p.recommendedBotElo : s.botElo }));
    });
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
    let alive = true;
    engine
      .analyze(g.fen, { depth: 8 })
      .then((r) => {
        if (!alive) return;
        const l = r.lines[0];
        if (l) setEvalCp(lineScore(l) * (turn === 'w' ? 1 : -1));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [engine, g.fen, settings.showEvalBar, g.mode, turn]);

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
    })
      .then((game) => {
        g.setSavedGameId(game.id);
        setToast('Partie enregistrée dans l\'historique');
      })
      .finally(() => setSaving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.status.over, g.savedGameId]);

  const onMove = useCallback(
    (m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
      const fenBefore = useGame.getState().fen;
      const rec = useGame.getState().playMove(m);
      if (!rec) return;
      if (settings.sounds) (rec.captured ? sounds.capture : rec.check ? sounds.check : sounds.move)();
      if (useGame.getState().mode === 'exercise' && useGame.getState().exerciseBestMove) {
        const best = useGame.getState().exerciseBestMove!;
        const ok = rec.san === best || rec.lan === best || lanToSan(fenBefore, best) === rec.san;
        setExerciseFeedback(ok ? { ok: true, text: `Bien joué : ${rec.san} était le bon coup.` } : { ok: false, text: `${rec.san} n'est pas le meilleur coup. Le moteur préférait ${best}. Annule et réessaie, ou continue la partie.` });
      }
    },
    [settings.sounds],
  );

  const startGame = () => {
    const color: Color = setup.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : setup.color;
    botJob.current++;
    g.newGame({ mode: setup.mode, playerColor: color, botElo: setup.botElo });
    g.setHeatmapMode(settings.defaultHeatmapMode);
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
        />
        <PlayerBar color={g.flipped ? (botColor ?? 'b') : g.playerColor} name={g.flipped ? (vsBot ? `${botProfile.name} (${g.botElo})` : colorLabel('b', palette)) : vsBot ? `Moi (${playerLabel})` : colorLabel('w', palette)} palette={palette} active={turn === (g.flipped ? (botColor ?? 'b') : g.playerColor) && !g.status.over} thinking={g.flipped && g.botThinking} fen={viewedFen} />
        {settings.showEvalBar && evalCp !== null && (
          <div className="eval-bar" title={`Évaluation : ${(evalCp / 100).toFixed(1)}`} style={{ maxWidth: 'min(92vw, 640px)', margin: '.4rem auto' }}>
            <div style={{ width: `${50 + 50 * (2 / (1 + Math.exp(-0.00368208 * evalCp)) - 1)}%` }} />
          </div>
        )}
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
        <HeatmapToolbar mode={g.heatmapMode} onChange={g.setHeatmapMode} />
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
        <div className="card">
          <div className="card-title">
            <IconList className="ico" />
            <h3>Coups</h3>
          </div>
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
          <strong>Heatmap :</strong> chiffres = nombre d'attaquants (Bleu en haut à gauche, Rouge en bas à droite). Anneau pulsant = pièce en prise. Raccourcis clavier A B R C P H X.
        </div>
      </aside>

      <Toast text={toast} onDone={() => setToast(null)} />
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
