import { useEffect, useMemo, useRef, useState } from 'react';
import { Board, type Arrow } from '../board/Board';
import { db } from '../data/db';
import type { Analysis, Game } from '../data/models';
import { analyzeGame } from '../analysis/analyzeGame';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '../analysis/classify';
import { MOTIF_LABEL } from '../analysis/motifs';
import { formatEval, PHASE_LABEL, type KeyMoment, type MoveEval } from '../analysis/coach';
import { useEngine } from '../engine/useEngine';
import { useSettings } from '../store/settingsStore';
import { useGame } from '../store/gameStore';
import { saveAnalysis } from '../data/gameService';
import { EvalChart } from '../ui/EvalChart';
import { MoveList } from '../ui/MoveList';
import { HeatmapToolbar } from '../ui/HeatmapToolbar';
import { buildPgn, fenSequence, START_FEN } from '../chess/game';
import { downloadOrShare } from '../data/backup';
import { navigate } from '../app/router';
import { explainWithLlm } from '../analysis/llmCoach';
import { decryptText } from '../data/crypto';
import type { HeatmapMode } from '../board/ThreatOverlay';
import type { Square } from '../chess/types';
import { Ring } from '../ui/Ring';
import { EvalBarVertical } from '../ui/EvalBarVertical';
import { fastMistakes } from '../progress/goals';
import { classifyMove, CATEGORY_LABEL as CAT } from '../analysis/classify';
import { winProbability } from '../analysis/winprob';
import { lineScore } from '../engine/engineClient';
import { bestLineText, commentForMove, explainBest } from '../analysis/explain';
import { openingAnnouncement, openingForGame, openingLabel } from '../chess/openings';
import { speak, stopSpeaking } from '../ui/speech';

export function Debrief({ id }: { id: string }) {
  const [game, setGame] = useState<Game | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [partial, setPartial] = useState<MoveEval[]>([]);
  const [ply, setPly] = useState(0);
  const [heat, setHeat] = useState<HeatmapMode>('A');
  const [llmText, setLlmText] = useState<Record<number, string>>({});
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { engine, error: engineError } = useEngine();
  const { settings, palette, update: updateSettings } = useSettings();
  const running = useRef(false);
  const [reading, setReading] = useState(false);
  /** Mode « Devine le coup ». */
  const [guessMode, setGuessMode] = useState(false);
  const [guessScore, setGuessScore] = useState({ ok: 0, total: 0 });
  const [guessFeedback, setGuessFeedback] = useState<string | null>(null);
  const [guessBusy, setGuessBusy] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const readingRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const g = await db.games.get(id);
      if (!g) {
        setError('Partie introuvable.');
        return;
      }
      setGame(g);
      if (g.analysisId) {
        const a = await db.analyses.get(g.analysisId);
        if (a) setAnalysis(a);
      }
    })();
  }, [id]);

  // Lance l'analyse si nécessaire.
  useEffect(() => {
    if (!game || analysis || !engine || running.current || game.analysisId) return;
    running.current = true;
    const color = game.playerColor === 'blue' ? 'w' : 'b';
    setProgress({ done: 0, total: game.sans.length + 1 });
    analyzeGame(engine, game.startFen || START_FEN, game.sans, color, {
      depth: settings.analysisDepth,
      onProgress: (done, total, p) => {
        setProgress({ done, total });
        setPartial([...p]);
      },
    })
      .then(async (res) => {
        const a = await saveAnalysis(game, res);
        setAnalysis(a);
        setProgress(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        running.current = false;
      });
  }, [game, analysis, engine, settings.analysisDepth]);

  const fens = useMemo(() => (game ? fenSequence(game.startFen || START_FEN, game.sans) : [START_FEN]), [game]);
  const moves = analysis?.moves ?? partial;
  const playerColor = game?.playerColor === 'red' ? 'b' : 'w';
  const currentMove = ply > 0 ? moves[ply - 1] : undefined;

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setPly((p) => Math.min(fens.length - 1, p + 1));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [fens.length]);

  const arrows: Arrow[] = useMemo(() => {
    if (!currentMove) return [];
    const out: Arrow[] = [];
    const bad = ['blunder', 'mistake', 'inaccuracy', 'mate_missed'].includes(currentMove.category);
    out.push({ from: currentMove.lan.slice(0, 2) as Square, to: currentMove.lan.slice(2, 4) as Square, color: bad ? '#e74c3c' : '#2ecc71', crossed: bad });
    if (bad && currentMove.bestMoveLan && currentMove.bestMoveLan !== currentMove.lan) {
      out.push({ from: currentMove.bestMoveLan.slice(0, 2) as Square, to: currentMove.bestMoveLan.slice(2, 4) as Square, color: '#2ecc71' });
    }
    return out;
  }, [currentMove]);

  // Sur un moment clé, on montre la position AVANT le coup avec les flèches.
  const boardFen = currentMove && arrows.length > 1 ? currentMove.fenBefore : fens[ply];
  const opening = useMemo(() => (game ? openingForGame(game.sans, game.startFen) : null), [game]);
  const commentAt = (i: number): string | null => {
    const m = moves[i - 1];
    if (!m || !game) return null;
    const ann = openingAnnouncement(game.sans, i);
    const prefix = ann ? `Ouverture : ${openingLabel(ann)}. ` : '';
    return prefix + commentForMove(m, playerColor);
  };
  const commentText = ply > 0 ? commentAt(ply) : null;
  const fast = analysis && game ? fastMistakes(analysis, game.thinkTimes, playerColor) : null;
  // Devine le coup : position avant un coup du joueur, échiquier jouable, verdict du moteur sur la proposition.
  const guessTarget = guessMode && ply < moves.length && moves[ply]?.color === playerColor ? moves[ply] : null;
  const onGuess = async (m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    if (!guessTarget || !engine) return;
    const lan = `${m.from}${m.to}${m.promotion ?? ''}`;
    setGuessBusy(true);
    try {
      let text: string;
      let ok = false;
      if (lan === guessTarget.bestMoveLan) {
        ok = true;
        text = `Bravo ! ${guessTarget.bestMove} est exactement le meilleur coup.`;
      } else {
        const { applyMove } = await import('../chess/game');
        const after = applyMove(guessTarget.fenBefore, m, guessTarget.ply);
        if (!after) throw new Error('coup illégal');
        const r = await engine.analyze(after.fen, { depth: settings.analysisDepth >= 14 ? 12 : 10 });
        const l = r.lines[0];
        const stm = after.fen.split(' ')[1] === 'w' ? 1 : -1;
        const cpWhite = l ? lineScore(l) * stm : 0;
        const sign = playerColor === 'w' ? 1 : -1;
        const loss = Math.max(0, winProbability(guessTarget.evalBefore * sign) - winProbability(cpWhite * sign));
        const cat = classifyMove({ winProbLoss: loss, isBest: false, isOnlyMove: false, mateAvailableBefore: null, mateStillAvailableAfter: false });
        ok = cat === 'excellent' || cat === 'good';
        const same = lan === guessTarget.lan ? ' (c\'est le coup que tu avais joué)' : '';
        text = `${after.record.san}${same} : ${CAT[cat].toLowerCase()}. Le moteur préférait ${guessTarget.bestMove}.`;
      }
      setGuessScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
      setGuessFeedback(text);
      if (settings.voiceEnabled) void speak(text, { voiceName: settings.voiceName, rate: settings.voiceRate });
    } catch (e) {
      setGuessFeedback((e as Error).message);
    } finally {
      setGuessBusy(false);
    }
  };
  const nextGuess = () => {
    setGuessFeedback(null);
    // Prochaine position où c'est au joueur de jouer.
    for (let i = ply + 1; i < moves.length; i++) {
      if (moves[i].color === playerColor) {
        setPly(i);
        return;
      }
    }
    setGuessMode(false);
  };
  const explanation = currentMove ? explainBest(currentMove, currentMove.color === playerColor) : null;
  const lineText = currentMove ? bestLineText(currentMove) : null;

  // Lecture automatique du commentaire à chaque navigation.
  useEffect(() => {
    if (!commentText || !settings.voiceEnabled || !settings.autoReadDebrief || readingRef.current) return;
    void speak(commentText, { voiceName: settings.voiceName, rate: settings.voiceRate });
  }, [commentText, settings.voiceEnabled, settings.autoReadDebrief, settings.voiceName, settings.voiceRate]);
  useEffect(() => () => stopSpeaking(), []);

  /** Lit toute la partie : avance d'un coup à la fin de chaque commentaire. */
  const readWholeGame = async () => {
    if (readingRef.current) {
      readingRef.current = false;
      setReading(false);
      stopSpeaking();
      return;
    }
    readingRef.current = true;
    setReading(true);
    for (let i = Math.max(1, ply); i < fens.length && readingRef.current; i++) {
      setPly(i);
      const text = commentAt(i);
      if (!text) break;
      await speak(text, { voiceName: settings.voiceName, rate: settings.voiceRate });
      await new Promise((r) => setTimeout(r, 350));
    }
    readingRef.current = false;
    setReading(false);
  };

  const replayFromHere = (m: KeyMoment | MoveEval) => {
    const g = useGame.getState();
    g.newGame({ mode: 'bot', playerColor, botElo: game?.botElo || 1200, startFen: m.fenBefore });
    navigate('partie');
  };

  const exportAnnotated = async () => {
    if (!game || !analysis) return;
    const comments: Record<number, string> = {};
    for (const k of analysis.keyMoments) comments[k.ply] = `${CATEGORY_LABEL[k.category]} : ${k.adviceText}`;
    for (const m of analysis.moves) if (!comments[m.ply] && m.category !== 'excellent' && m.category !== 'good') comments[m.ply] = `${CATEGORY_LABEL[m.category]} (${formatEval(m.evalBefore)} → ${formatEval(m.evalAfter)}), mieux : ${m.bestMove ?? '?'}`;
    const pgn = buildPgn(game.startFen || START_FEN, game.sans, { Event: 'BlueRed Chess', Result: game.result, Annotator: 'BlueRed Coach', White: game.playerColor === 'blue' ? 'Moi' : `Bot ${game.botElo}`, Black: game.playerColor === 'red' ? 'Moi' : `Bot ${game.botElo}` }, comments);
    await downloadOrShare(`bluered-${game.id.slice(0, 8)}.pgn`, pgn, 'application/x-chess-pgn');
  };

  const askLlm = async () => {
    if (!analysis || !settings.apiKey) return;
    setLlmBusy(true);
    setLlmError(null);
    try {
      const key = await decryptText(settings.apiKey);
      const out = await explainWithLlm(analysis.keyMoments, playerColor, { provider: settings.apiProvider ?? 'anthropic', apiKey: key, model: settings.apiModel, baseUrl: settings.apiBaseUrl });
      setLlmText(out);
    } catch (e) {
      setLlmError((e as Error).message);
    } finally {
      setLlmBusy(false);
    }
  };

  if (error) return <div className="card">{error}</div>;
  if (!game) return <div className="loading">Chargement…</div>;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Débrief</h1>
          <p className="muted small">{game.playerColor === 'blue' ? 'Bleu' : 'Rouge'} {game.botElo ? `contre Bot ${game.botElo}` : ''} · {game.result} · {new Date(game.createdAt).toLocaleDateString('fr-FR')}</p>
          {opening && (
            <p className="small" data-testid="opening-name">
              <span className="tag tag-accent">{opening.eco}</span> <strong>{openingLabel(opening)}</strong>
            </p>
          )}
        </div>
        <div className="btn-row">
          <a className="btn btn-sm" href="#/historique">
            Historique
          </a>
          <button type="button" className="btn btn-sm" disabled={!analysis} onClick={() => void exportAnnotated()}>
            Exporter le PGN annoté
          </button>
        </div>
      </div>
      {engineError && <div className="card" style={{ color: 'var(--red-2)' }}>Moteur indisponible : {engineError}</div>}
      {progress && (
        <div className="card" data-testid="analysis-progress">
          <p>
            Analyse en cours… {progress.done}/{progress.total} positions (profondeur {settings.analysisDepth}). Tu peux déjà parcourir les coups analysés.
          </p>
          <div className="progress">
            <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}
      {analysis && (
        <div className="grid grid-2">
          <div className="card">
            <div className="row" style={{ gap: '1.2rem', marginBottom: '.6rem' }}>
              <Ring value={analysis.summary.accuracy} label="Précision" color={analysis.summary.accuracy >= 80 ? 'var(--green)' : analysis.summary.accuracy >= 60 ? 'var(--accent)' : 'var(--red-2)'} />
              <div>
                <div className="muted small">Précision</div>
                <div className="stat" data-testid="accuracy">{analysis.summary.accuracy.toFixed(0)} %</div>
              </div>
            </div>
            <div className="stat-tiles" style={{ marginBottom: '.7rem' }}>
              <div className="stat-tile"><div className="label">Gaffes</div><div className="value" style={{ color: '#e74c3c' }}>{analysis.summary.blunders}</div></div>
              <div className="stat-tile"><div className="label">Erreurs</div><div className="value" style={{ color: '#e67e22' }}>{analysis.summary.mistakes}</div></div>
              <div className="stat-tile"><div className="label">Imprécisions</div><div className="value" style={{ color: '#f1c40f' }}>{analysis.summary.inaccuracies}</div></div>
            </div>
            <p className="small">
              <strong>Phase la plus faible :</strong> {analysis.summary.weakestPhase ? PHASE_LABEL[analysis.summary.weakestPhase] : '—'}
            </p>
            <p className="small">
              <strong>Force :</strong> {analysis.summary.strength}
            </p>
            <p className="small">
              <strong>Faiblesse :</strong> {analysis.summary.weakness}
            </p>
            {game.goal && (
              <p className="small" data-testid="goal-result">
                <span className={`tag ${game.goal.achieved ? 'tag-ok' : 'tag-alert'}`}>{game.goal.achieved ? 'Objectif atteint' : 'Objectif manqué'}</span> {game.goal.label}. {game.goal.detail}
              </p>
            )}
            {fast && fast.total > 0 && (
              <p className="small" data-testid="fast-mistakes">
                <span className={`tag ${fast.fast > 0 ? 'tag-alert' : 'tag-ok'}`}>Réflexion</span> {fast.fast} de tes {fast.total} erreur{fast.total > 1 ? 's' : ''} {fast.fast > 1 ? 'ont été jouées' : 'a été jouée'} en moins de 3 secondes.{fast.fast > 0 ? ' Prends le temps de vérifier les pièces en prise avant de jouer.' : ' Bonne discipline de réflexion.'}
              </p>
            )}
          </div>
          <div className="card">
            <h3>Évaluation</h3>
            <EvalChart moves={analysis.moves} current={ply} onSelect={setPly} />
            <p className="muted small">Clique sur la courbe pour naviguer. Flèches ← → au clavier.</p>
          </div>
        </div>
      )}
      <div className="play-layout">
        <div>
          <div className="board-row">
          {settings.showEvalBarDebrief !== false && (
            <EvalBarVertical cp={moves.length === 0 ? null : ply === 0 ? (moves[0]?.evalBefore ?? 0) : (moves[ply - 1]?.evalAfter ?? null)} flipped={playerColor === 'b'} palette={palette} pending={moves.length === 0 || (ply > 0 && !moves[ply - 1])} />
          )}
          <Board
            fen={guessTarget ? guessTarget.fenBefore : boardFen}
            flipped={playerColor === 'b'}
            movable={guessTarget && !guessFeedback && !guessBusy ? [playerColor] : []}
            onMove={(m) => void onGuess(m)}
            arrows={guessTarget && !guessFeedback ? [] : arrows}
            heatmapMode={heat}
            palette={palette}
            intensity={settings.heatmapIntensity}
            showCounts={settings.showCounts}
            showHanging={settings.showHanging}
            showLoose={settings.showLoose}
            hatching={settings.hatching}
            drawMode={drawMode}
            onDrawModeChange={setDrawMode}
          />
          </div>
          <HeatmapToolbar mode={heat} onChange={setHeat} drawMode={drawMode} onDrawModeChange={setDrawMode} />
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <button type="button" className={`btn btn-sm ${settings.showEvalBarDebrief !== false ? '' : 'btn-ghost'}`} data-testid="debrief-evalbar-toggle" aria-pressed={settings.showEvalBarDebrief !== false} onClick={() => void updateSettings({ showEvalBarDebrief: settings.showEvalBarDebrief === false })} title="Afficher ou masquer la barre d'avantage">
              {settings.showEvalBarDebrief !== false ? 'Masquer la barre' : 'Afficher la barre'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPly(0)}>
              ⏮
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPly((p) => Math.max(0, p - 1))}>
              ◀
            </button>
            <span className="muted small" style={{ alignSelf: 'center' }}>
              coup {ply}/{fens.length - 1}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setPly((p) => Math.min(fens.length - 1, p + 1))}>
              ▶
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPly(fens.length - 1)}>
              ⏭
            </button>
          </div>
          {analysis && (
            <div className="card" style={{ marginTop: '.5rem', borderColor: guessMode ? 'var(--accent)' : undefined }} data-testid="guess-panel">
              <div className="row spread">
                <strong>Devine le coup</strong>
                <span className="muted small">{guessScore.total > 0 ? `${guessScore.ok} / ${guessScore.total} bons coups` : 'à chaque position, propose ton coup avant de voir le tien'}</span>
                <button
                  type="button"
                  className={`btn btn-sm ${guessMode ? '' : 'btn-primary'}`}
                  data-testid="guess-toggle"
                  onClick={() => {
                    setGuessFeedback(null);
                    if (!guessMode) {
                      setGuessMode(true);
                      const first = moves.findIndex((m) => m.color === playerColor);
                      if (first >= 0) setPly(first);
                    } else setGuessMode(false);
                  }}
                >
                  {guessMode ? 'Quitter' : 'Commencer'}
                </button>
              </div>
              {guessMode && guessTarget && !guessFeedback && <p className="small" style={{ margin: '.4rem 0 0' }}>{guessBusy ? 'Le moteur évalue ta proposition…' : `Coup ${Math.ceil(guessTarget.ply / 2)} : à toi de jouer. Trouve le meilleur coup.`}</p>}
              {guessMode && !guessTarget && !guessFeedback && <p className="small muted" style={{ margin: '.4rem 0 0' }}>Avance jusqu'à une position où c'est à toi de jouer.</p>}
              {guessFeedback && (
                <div className="row" style={{ marginTop: '.4rem' }}>
                  <span className="small" data-testid="guess-feedback">{guessFeedback}</span>
                  <button type="button" className="btn btn-sm btn-primary" onClick={nextGuess}>
                    Position suivante
                  </button>
                </div>
              )}
            </div>
          )}
          {analysis && (
            <div className="btn-row" style={{ justifyContent: 'center', marginTop: '.5rem' }}>
              <button type="button" className={`btn btn-sm ${reading ? 'btn-danger' : 'btn-primary'}`} data-testid="read-game" onClick={() => void readWholeGame()}>
                {reading ? 'Arrêter la lecture' : '🔊 Lire la partie coup par coup'}
              </button>
              {commentText && (
                <button type="button" className="btn btn-sm" onClick={() => void speak(commentText, { voiceName: settings.voiceName, rate: settings.voiceRate })}>
                  Relire ce coup
                </button>
              )}
            </div>
          )}
          {currentMove && (
            <div className="card" style={{ marginTop: '.5rem' }} data-testid="move-comment">
              <div className="row">
                <span className="badge" style={{ background: CATEGORY_COLOR[currentMove.category], width: 14, height: 14 }} />
                <strong>
                  {Math.ceil(currentMove.ply / 2)}
                  {currentMove.color === 'w' ? '.' : '…'} {currentMove.san}
                </strong>
                <span className="tag">{CATEGORY_LABEL[currentMove.category]}</span>
                <span className="muted small">
                  {formatEval(currentMove.evalBefore)} → {formatEval(currentMove.evalAfter)}
                </span>
                {currentMove.bestMove && currentMove.bestMove !== currentMove.san && <span className="small">Mieux : {currentMove.bestMove}</span>}
                {game.thinkTimes?.[currentMove.ply - 1] !== undefined && currentMove.color === playerColor && (
                  <span className="muted small" title="Temps de réflexion">{game.thinkTimes[currentMove.ply - 1] < 3000 ? '⚡ ' : '⏱ '}{(game.thinkTimes[currentMove.ply - 1] / 1000).toFixed(0)} s</span>
                )}
              </div>
              {currentMove.motifs.length > 0 && (
                <div className="row" style={{ marginTop: '.3rem' }}>
                  {currentMove.motifs.map((h, i) => (
                    <span key={i} className="tag">
                      {MOTIF_LABEL[h.motif]}
                    </span>
                  ))}
                </div>
              )}
              {commentText && <p className="small" style={{ margin: '.5rem 0 0' }}>{commentText.replace(explanation ?? '', '').trim()}</p>}
              {explanation && (
                <div className="small" style={{ marginTop: '.5rem', padding: '.6rem .75rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-3)', borderLeft: '3px solid var(--green)' }} data-testid="why-better">
                  <strong>Pourquoi {currentMove.bestMove} est meilleur :</strong> {explanation}
                  {lineText && <div className="muted" style={{ marginTop: '.3rem' }}>{lineText}</div>}
                </div>
              )}
            </div>
          )}
        </div>
        <aside className="side-panel">
          <div className="card">
            <h3>Coups</h3>
            <MoveList moves={game.sans.map((san, i) => ({ ply: i + 1, san, category: moves[i]?.category }))} current={ply} onSelect={setPly} />
          </div>
          {analysis && (
            <div className="card">
              <div className="row spread">
                <h3>Moments clés</h3>
                {settings.apiKey && (
                  <button type="button" className="btn btn-sm" disabled={llmBusy} onClick={() => void askLlm()}>
                    {llmBusy ? 'Coach IA…' : 'Coach IA'}
                  </button>
                )}
              </div>
              {llmError && <p className="small" style={{ color: 'var(--red-2)' }}>{llmError}</p>}
              <div className="stack" style={{ gap: '.5rem' }} data-testid="key-moments">
                {analysis.keyMoments.map((k) => (
                  <div key={k.ply} className={`card moment-card ${k.category} ${ply === k.ply ? 'active' : ''}`} style={{ padding: '.6rem', cursor: 'pointer' }} onClick={() => setPly(k.ply)}>
                    <div className="row spread">
                      <strong>
                        {Math.ceil(k.ply / 2)}
                        {k.color === 'w' ? '.' : '…'} {k.san}
                      </strong>
                      <span className="tag" style={{ borderColor: CATEGORY_COLOR[k.category] }}>
                        {CATEGORY_LABEL[k.category]}
                      </span>
                    </div>
                    {k.motif && <div className="muted small">{MOTIF_LABEL[k.motif]}</div>}
                    <p className="small" style={{ margin: '.3rem 0' }}>{k.adviceText}</p>
                    {llmText[k.ply] && <p className="small" style={{ margin: '.3rem 0', color: '#a3e4b3' }}>{llmText[k.ply]}</p>}
                    <div className="row">
                      {k.recommendedMove && <span className="small">Recommandé : <strong>{k.recommendedMove}</strong></span>}
                      <button type="button" className="btn btn-sm" onClick={(e) => { e.stopPropagation(); replayFromHere(k); }}>
                        Rejouer d'ici
                      </button>
                    </div>
                  </div>
                ))}
                {analysis.keyMoments.length === 0 && <p className="muted small">Aucune erreur marquante : belle partie !</p>}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
