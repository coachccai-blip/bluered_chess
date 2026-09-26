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
  const { settings, palette } = useSettings();
  const running = useRef(false);

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
          <Board
            fen={boardFen}
            flipped={playerColor === 'b'}
            movable={[]}
            arrows={arrows}
            heatmapMode={heat}
            palette={palette}
            intensity={settings.heatmapIntensity}
            showCounts={settings.showCounts}
            showHanging={settings.showHanging}
            showLoose={settings.showLoose}
            hatching={settings.hatching}
          />
          <HeatmapToolbar mode={heat} onChange={setHeat} />
          <div className="btn-row" style={{ justifyContent: 'center' }}>
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
          {currentMove && (
            <div className="card" style={{ marginTop: '.5rem' }}>
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
