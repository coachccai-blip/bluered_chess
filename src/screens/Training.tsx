import { useEffect, useMemo, useState } from 'react';
import { db } from '../data/db';
import type { Analysis, Drill, Exercise, Game, TrainingPlan } from '../data/models';
import { dueDrills, isMastered } from '../progress/drills';
import { MOTIF_LABEL, type Motif } from '../analysis/motifs';
import { WeaknessPanel } from '../ui/WeaknessPanel';
import { rankWeaknesses, type WeaknessSummary } from '../progress/weaknessGuide';
import type { Profile } from '../data/models';
import { INDICATORS } from '../progress/profile';
import { analyzedPairs, refreshProfileAndPlan } from '../data/gameService';
import { blindfoldScore, countAttackersQuestion, knightSquaresQuestion, type BlindfoldQuestion, type CountQuestion } from '../progress/exercises';
import { Board } from '../board/Board';
import { useSettings } from '../store/settingsStore';
import { useGame } from '../store/gameStore';
import { navigate } from '../app/router';
import type { Square } from '../chess/types';
import { computeAttacks } from '../chess/attacks';
import { mistakePositions } from '../progress/trainingPlan';
import { loadProfile, saveProfile } from '../data/db';
import { START_FEN } from '../chess/game';

type Active = { kind: 'knight' } | { kind: 'count' } | { kind: 'hanging' } | null;

export function Training() {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [pairs, setPairs] = useState<{ game: Game; analysis: Analysis }[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [active, setActive] = useState<Active>(() => {
    const m = /[?&]ex=(knight|count|hanging)/.exec(window.location.hash);
    return m ? ({ kind: m[1] } as Active) : null;
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [openWeakness, setOpenWeakness] = useState<WeaknessSummary | null>(null);
  const { palette, settings } = useSettings();

  const reload = async () => {
    setPlan((await db.plans.orderBy('generatedAt').reverse().first()) ?? null);
    setPairs(await analyzedPairs());
    setDrills(await db.drills.toArray());
    setProfile(await loadProfile(db));
  };
  useEffect(() => {
    void reload();
  }, []);

  const markDone = async (ex: Exercise) => {
    if (!plan) return;
    const next = { ...plan, progress: { ...plan.progress, [ex.id]: (plan.progress[ex.id] ?? 0) + 1 } };
    await db.plans.put(next);
    setPlan(next);
  };

  const launch = async (ex: Exercise) => {
    const g = useGame.getState();
    switch (ex.kind) {
      case 'replay_mistake':
        g.newGame({ mode: 'exercise', playerColor: (ex.fen ?? '').split(' ')[1] === 'b' ? 'b' : 'w', botElo: 1200, startFen: ex.fen, exerciseBestMove: ex.bestMove ?? null });
        g.setHeatmapMode('A');
        await markDone(ex);
        navigate('partie');
        break;
      case 'basic_endgame':
        g.newGame({ mode: 'bot', playerColor: 'w', botElo: 1800, startFen: ex.fen });
        await markDone(ex);
        navigate('partie');
        break;
      case 'clean_opening': {
        const last = pairs[0];
        const color = last ? (last.game.playerColor === 'blue' ? 'w' : 'b') : 'w';
        g.newGame({ mode: 'bot', playerColor: color, botElo: last?.game.botElo || 1200, startFen: START_FEN });
        await markDone(ex);
        navigate('partie');
        break;
      }
      case 'find_hanging':
        setActive({ kind: 'hanging' });
        break;
      case 'knight_squares':
        setActive({ kind: 'knight' });
        break;
      case 'count_attackers':
        setActive({ kind: 'count' });
        break;
      case 'lichess_puzzles':
        window.open(ex.url, '_blank', 'noopener');
        await markDone(ex);
        break;
    }
  };

  const due = dueDrills(drills);
  const mastered = drills.filter(isMastered).length;
  const launchDrill = (d: Drill) => {
    const g = useGame.getState();
    g.newGame({ mode: 'exercise', playerColor: d.fen.split(' ')[1] === 'b' ? 'b' : 'w', botElo: 1200, startFen: d.fen, exerciseBestMove: d.bestMove, exerciseDrillId: d.id });
    g.setHeatmapMode('A');
    navigate('partie');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Entraînement</h1>
          <p className="muted small">10 minutes par jour sur tes deux points faibles.</p>
        </div>
      </div>
      {active?.kind === 'knight' && <BlindfoldExercise onClose={() => setActive(null)} />}
      {active?.kind === 'count' && <CountExercise onClose={() => setActive(null)} />}
      {active?.kind === 'hanging' && <HangingExercise pairs={pairs} onClose={() => setActive(null)} />}
      {openWeakness && <WeaknessPanel weakness={openWeakness} onClose={() => setOpenWeakness(null)} />}
      {!active && (
        <>
          <div className="card" data-testid="by-weakness">
            <h3>Entraînement par faiblesse</h3>
            <p className="muted small">Chaque axe du radar a son programme : diagnostic, méthode à appliquer en partie, exercices ciblés et routine.</p>
            <div className="indicator-list">
              {rankWeaknesses(profile?.indicators ?? {}).map((w) => (
                <div key={w.key} className={`indicator ${w.alert ? 'alert' : ''}`}>
                  <span>
                    <strong>{w.guide.title}</strong>{' '}
                    {w.value === undefined ? <span className="muted small">pas encore mesuré</span> : <span className="muted small">{w.value} {w.unit}</span>}{' '}
                    {w.alert && <span className="tag tag-alert">à travailler</span>}
                  </span>
                  <button type="button" className={`btn btn-sm ${w.alert ? 'btn-primary' : ''}`} data-testid={`program-${w.key}`} onClick={() => setOpenWeakness(w)}>
                    Programme
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="card" data-testid="drills">
            <div className="row spread">
              <h3>Révisions du jour</h3>
              <span className="muted small">{drills.length} fiche{drills.length > 1 ? 's' : ''} · {mastered} acquise{mastered > 1 ? 's' : ''}</span>
            </div>
            <p className="muted small">Chaque erreur analysée devient une fiche : retrouve le bon coup. Réussie, elle revient dans 1, 3, 7, 14 puis 30 jours ; ratée, elle revient demain.</p>
            {due.length === 0 ? (
              <p className="small">{drills.length === 0 ? 'Aucune fiche pour l\'instant : analyse une partie pour en créer.' : 'Rien à réviser aujourd\'hui. Reviens demain !'}</p>
            ) : (
              <div className="stack" style={{ gap: '.4rem' }}>
                {due.slice(0, 8).map((d) => (
                  <div key={d.id} className="indicator">
                    <span>
                      <strong>Coup {Math.ceil(d.ply / 2)}</strong> · {d.motif ? MOTIF_LABEL[d.motif as Motif] : 'erreur'} <span className="muted small">(tu avais joué {d.playedSan}) · boîte {d.box}</span>
                    </span>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => launchDrill(d)}>
                      Réviser
                    </button>
                  </div>
                ))}
                {due.length > 8 && <p className="muted small">… et {due.length - 8} autre{due.length - 8 > 1 ? 's' : ''}.</p>}
              </div>
            )}
          </div>
          <div className="card">
            <h3>Exercices libres</h3>
            <div className="btn-row">
              <button type="button" className="btn" data-testid="ex-knight" onClick={() => setActive({ kind: 'knight' })}>
                Cases du cavalier (à l'aveugle)
              </button>
              <button type="button" className="btn" data-testid="ex-count" onClick={() => setActive({ kind: 'count' })}>
                Compte les attaquants
              </button>
              <button type="button" className="btn" onClick={() => setActive({ kind: 'hanging' })} disabled={pairs.length === 0}>
                Trouve la pièce pendante
              </button>
            </div>
          </div>
          {!plan ? (
            <div className="card">
              <p className="muted">Ton plan personnalisé se génère après ta première partie analysée (puis toutes les 5 parties).</p>
              <button type="button" className="btn btn-sm" onClick={async () => { await refreshProfileAndPlan(); await reload(); }}>
                Recalculer maintenant
              </button>
            </div>
          ) : (
            <div className="card">
              <div className="row spread">
                <h3>Plan sur 2 semaines</h3>
                <span className="muted small">généré le {new Date(plan.generatedAt).toLocaleDateString('fr-FR')}</span>
              </div>
              <p className="small">
                Cibles : <strong>{plan.targets.map((t) => INDICATORS.find((i) => i.key === t)?.label ?? t).join(' et ')}</strong>. 10 minutes par jour.
              </p>
              <PlanProgress plan={plan} pairs={pairs} />
              <div className="stack" style={{ gap: '.5rem' }}>
                {plan.exercises.map((ex) => (
                  <div key={ex.id} className="card" style={{ padding: '.6rem' }}>
                    <div className="row spread">
                      <strong>{ex.title}</strong>
                      <span className="tag">{ex.minutes} min · fait {plan.progress[ex.id] ?? 0}×</span>
                    </div>
                    <p className="muted small" style={{ margin: '.2rem 0' }}>{ex.description}</p>
                    <p className="small" style={{ margin: '.2rem 0' }}>Objectif : {ex.goal}</p>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => void launch(ex)}>
                      Lancer
                    </button>
                  </div>
                ))}
              </div>
              <div className="btn-row" style={{ marginTop: '.75rem' }}>
                <button type="button" className="btn btn-sm" onClick={async () => { await db.plans.delete(plan.id); await refreshProfileAndPlan(); await reload(); }}>
                  Régénérer le plan
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <p className="muted small">Palette : {palette.name} · Heatmap intensité {settings.heatmapIntensity}</p>
    </div>
  );
}

function PlanProgress({ plan, pairs }: { plan: TrainingPlan; pairs: { game: Game; analysis: Analysis }[] }) {
  const current = useMemo(() => {
    // Recalcul rapide des indicateurs courants via le profil sauvegardé (les paires servent au compte).
    return plan.indicatorsAtGeneration;
  }, [plan]);
  return (
    <div className="small muted" style={{ marginBottom: '.5rem' }}>
      {plan.targets.map((t) => {
        const d = INDICATORS.find((i) => i.key === t);
        return (
          <div key={t}>
            {d?.label} au moment du plan : <strong>{current[t] ?? '—'}</strong> {d?.unit} (seuil {d?.threshold}) · parties analysées depuis : {Math.max(0, pairs.length - plan.gamesCountAtGeneration)}
          </div>
        );
      })}
    </div>
  );
}

function BlindfoldExercise({ onClose }: { onClose: () => void }) {
  const { palette } = useSettings();
  const [q, setQ] = useState<BlindfoldQuestion>(() => knightSquaresQuestion());
  const [picked, setPicked] = useState<Square[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const toggle = (sq: Square) => {
    if (revealed) return;
    setPicked((p) => (p.includes(sq) ? p.filter((s) => s !== sq) : [...p, sq]));
  };
  const reveal = async () => {
    const s = blindfoldScore(picked, q.answer);
    setScores((arr) => [...arr, s]);
    setRevealed(true);
    const p = await loadProfile(db);
    await saveProfile({ ...p, blindfoldScores: [...(p.blindfoldScores ?? []), { date: Date.now(), score: s }].slice(-100) }, db);
  };
  const next = () => {
    setQ(knightSquaresQuestion());
    setPicked([]);
    setRevealed(false);
  };
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return (
    <div className="card stack">
      <div className="row spread">
        <h3>
          Quelles cases le {q.pieceName} <strong>{q.piece}</strong> attaque-t-il ?
        </h3>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
      <Board fen={q.fen} flipped={false} movable={[]} heatmapMode="H" palette={palette} intensity={1} showCounts={false} showHanging={false} showLoose={false} hatching={false} onSquareClick={toggle} marked={revealed ? q.answer : picked} />
      <div className="row">
        {!revealed ? (
          <button type="button" className="btn btn-primary" data-testid="reveal" onClick={() => void reveal()}>
            Vérifier
          </button>
        ) : (
          <>
            <span data-testid="blindfold-score">Score : {scores[scores.length - 1]} %</span>
            <button type="button" className="btn btn-primary" onClick={next}>
              Question suivante
            </button>
          </>
        )}
        {avg !== null && <span className="muted small">Moyenne : {avg} % sur {scores.length}</span>}
      </div>
    </div>
  );
}

function CountExercise({ onClose }: { onClose: () => void }) {
  const { palette } = useSettings();
  const [q, setQ] = useState<CountQuestion>(() => countAttackersQuestion());
  const [blue, setBlue] = useState(0);
  const [red, setRed] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const [tally, setTally] = useState({ ok: 0, total: 0 });
  const check = () => {
    const ok = blue === q.blue && red === q.red;
    setResult(ok);
    setTally((t) => ({ ok: t.ok + (ok ? 1 : 0), total: t.total + 1 }));
  };
  const next = () => {
    setQ(countAttackersQuestion());
    setBlue(0);
    setRed(0);
    setResult(null);
  };
  return (
    <div className="card stack">
      <div className="row spread">
        <h3>
          Combien d'attaquants sur <strong>{q.square}</strong> ?
        </h3>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
      <Board fen={q.fen} flipped={false} movable={[]} heatmapMode={result === null ? 'H' : 'A'} palette={palette} intensity={1} showCounts={result !== null} showHanging={false} showLoose={false} hatching={false} marked={[q.square]} />
      <div className="row">
        <label>
          <span style={{ color: palette.w.piece, fontWeight: 700 }}>Bleu</span>{' '}
          <input type="number" min={0} max={9} value={blue} onChange={(e) => setBlue(parseInt(e.target.value || '0', 10))} style={{ width: 60 }} />
        </label>
        <label>
          <span style={{ color: palette.b.piece, fontWeight: 700 }}>Rouge</span>{' '}
          <input type="number" min={0} max={9} value={red} onChange={(e) => setRed(parseInt(e.target.value || '0', 10))} style={{ width: 60 }} />
        </label>
        {result === null ? (
          <button type="button" className="btn btn-primary" onClick={check}>
            Vérifier
          </button>
        ) : (
          <>
            <span style={{ color: result ? '#2ecc71' : 'var(--red-2)' }}>
              {result ? 'Exact !' : `Réponse : ${q.blue} bleu, ${q.red} rouge`}
            </span>
            <button type="button" className="btn btn-primary" onClick={next}>
              Suivante
            </button>
          </>
        )}
        <span className="muted small">
          {tally.ok}/{tally.total}
        </span>
      </div>
    </div>
  );
}

function HangingExercise({ pairs, onClose }: { pairs: { game: Game; analysis: Analysis }[]; onClose: () => void }) {
  const { palette } = useSettings();
  const positions = useMemo(() => {
    const out = mistakePositions(pairs, ['hanging_piece', 'moved_into_attack', 'missed_free_capture'], 20).map((p) => p.fen);
    return out.length ? out : pairs.flatMap((p) => p.analysis.moves.filter((m) => computeAttacks(m.fenAfter).hanging.length > 0).slice(0, 3).map((m) => m.fenAfter));
  }, [pairs]);
  const [idx, setIdx] = useState(0);
  const [time, setTime] = useState(15);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  const fen = positions[idx % Math.max(1, positions.length)];
  const hanging = useMemo(() => (fen ? computeAttacks(fen).hanging : []), [fen]);
  useEffect(() => {
    if (done) return;
    if (time <= 0) {
      setDone({ ok: false, text: `Temps écoulé. Pièces en prise : ${hanging.map((h) => h.square).join(', ') || 'aucune'}` });
      return;
    }
    const t = setTimeout(() => setTime((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [time, done, hanging]);
  if (!fen) return <div className="card">Aucune position disponible : analyse d'abord quelques parties. <button type="button" className="btn btn-sm" onClick={onClose}>Fermer</button></div>;
  const click = (sq: Square) => {
    if (done) return;
    const ok = hanging.some((h) => h.square === sq);
    setDone(ok ? { ok: true, text: `Oui : la pièce en ${sq} est en prise.` } : { ok: false, text: `Non. Pièces en prise : ${hanging.map((h) => h.square).join(', ') || 'aucune'}` });
  };
  return (
    <div className="card stack">
      <div className="row spread">
        <h3>Trouve la pièce pendante ({time}s)</h3>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
      <Board fen={fen} flipped={false} movable={[]} heatmapMode={done ? 'A' : 'H'} palette={palette} intensity={1} showCounts={!!done} showHanging={!!done} showLoose={false} hatching={false} onSquareClick={click} />
      {done && (
        <div className="row">
          <span style={{ color: done.ok ? '#2ecc71' : 'var(--red-2)' }}>{done.text}</span>
          <button type="button" className="btn btn-primary" onClick={() => { setIdx((i) => i + 1); setTime(15); setDone(null); }}>
            Position suivante
          </button>
        </div>
      )}
    </div>
  );
}
