import { useEffect, useState } from 'react';
import { db, loadProfile, saveProfile } from '../data/db';
import type { Game, Profile, TrainingPlan } from '../data/models';
import { INDICATORS, isAlert } from '../progress/profile';
import { Radar } from '../ui/Radar';
import { profileFor } from '../engine/botProfiles';
import { useSettings } from '../store/settingsStore';
import { useGame } from '../store/gameStore';
import { navigate } from '../app/router';
import { Modal } from '../ui/Modal';
import { Board } from '../board/Board';
import { resultScore } from '../progress/profile';

export function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const { settings, palette } = useSettings();

  useEffect(() => {
    void (async () => {
      setProfile(await loadProfile(db));
      setPlan((await db.plans.orderBy('generatedAt').reverse().first()) ?? null);
      setGames(await db.games.orderBy('createdAt').reverse().limit(5).toArray());
    })();
  }, []);

  if (!profile) return <div className="loading">Chargement…</div>;
  const bot = profileFor(profile.recommendedBotElo);
  const backupDue = settings.gamesSinceBackup >= 20 || (settings.lastBackupAt > 0 && Date.now() - settings.lastBackupAt > 30 * 24 * 3600 * 1000);

  const playRecommended = () => {
    useGame.getState().newGame({ mode: 'bot', playerColor: Math.random() < 0.5 ? 'w' : 'b', botElo: bot.elo });
    navigate('partie');
  };

  return (
    <div className="stack">
      {!profile.onboardingDone && <Onboarding profile={profile} onDone={(p) => setProfile(p)} />}
      <div className="grid grid-2">
        <div className="card">
          <div className="muted small">Elo maison (estimation interne, à comparer prudemment avec Lichess)</div>
          <div className="stat" data-testid="elo">{profile.estimatedElo}</div>
          <p className="small muted">
            {profile.gamesAnalyzed} partie{profile.gamesAnalyzed > 1 ? 's' : ''} analysée{profile.gamesAnalyzed > 1 ? 's' : ''} · série : {profile.streak.wins} V / {profile.streak.losses} D
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" data-testid="play-recommended" onClick={playRecommended}>
              Jouer contre {bot.name} ({bot.elo})
            </button>
            <a className="btn" href="#/partie">
              Choisir un bot
            </a>
          </div>
          {backupDue && (
            <p className="small" style={{ color: 'var(--accent)', marginTop: '.5rem' }}>
              Pense à sauvegarder tes données : <a href="#/reglages">exporter maintenant</a>.
            </p>
          )}
        </div>
        <div className="card">
          <h3>Radar de faiblesses</h3>
          {Object.keys(profile.indicators).length === 0 ? (
            <p className="muted small">Analyse tes premières parties pour remplir le radar.</p>
          ) : (
            <>
              <Radar current={profile.indicators} previous={profile.previousIndicators} />
              <div className="indicator-list">
                {INDICATORS.filter((d) => profile.indicators[d.key] !== undefined).map((d) => (
                  <div key={d.key} className={`indicator ${isAlert(d, profile.indicators[d.key]) ? 'alert' : ''}`} title={d.description}>
                    <span>{d.label}</span>
                    <span>
                      <strong>{profile.indicators[d.key]}</strong> <span className="muted small">{d.unit}</span>{' '}
                      {isAlert(d, profile.indicators[d.key]) ? <span className="tag tag-alert">à travailler</span> : <span className="tag tag-ok">ok</span>}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h3>Plan du jour</h3>
          {!plan ? (
            <p className="muted small">Le plan d'entraînement apparaît après ta première partie analysée et se recalcule toutes les 5 parties.</p>
          ) : (
            <>
              <p className="small">
                Cibles : {plan.targets.map((t) => INDICATORS.find((i) => i.key === t)?.label ?? t).join(' et ')} · 10 min par jour
              </p>
              <ul className="small">
                {plan.exercises.slice(0, 3).map((e) => (
                  <li key={e.id}>
                    {e.title} <span className="muted">({e.minutes} min)</span>
                  </li>
                ))}
              </ul>
              <a className="btn btn-sm" href="#/entrainement">
                Ouvrir l'entraînement
              </a>
            </>
          )}
        </div>
        <div className="card">
          <h3>Dernières parties</h3>
          {games.length === 0 && <p className="muted small">Aucune partie.</p>}
          {games.map((g) => {
            const s = resultScore(g);
            return (
              <div key={g.id} className="row spread small" style={{ padding: '.25rem 0', borderBottom: '1px solid var(--border)' }}>
                <span>
                  <span className={`result ${s === 1 ? 'result-win' : s === 0 ? 'result-loss' : 'result-draw'}`} style={{ marginRight: '.4rem' }}>{s === 1 ? 'V' : s === 0 ? 'D' : 'N'}</span>
                  {g.playerColor === 'blue' ? 'Bleu' : 'Rouge'} {g.botElo ? `vs ${g.botElo}` : ''}
                </span>
                <a href={`#/debrief/${g.id}`}>{g.analysisId ? 'débrief' : 'analyser'}</a>
              </div>
            );
          })}
          <a className="small" href="#/historique">
            Tout l'historique →
          </a>
        </div>
      </div>
      <div className="card small muted">
        Palette : {palette.name}. Les cases teintées en <span style={{ color: palette.w.piece, fontWeight: 700 }}>bleu</span> sont attaquées par le Bleu, en <span style={{ color: palette.b.piece, fontWeight: 700 }}>rouge</span> par le Rouge ; plus il y a d'attaquants, plus la teinte est soutenue.
      </div>
    </div>
  );
}

function Onboarding({ profile, onDone }: { profile: Profile; onDone: (p: Profile) => void }) {
  const [step, setStep] = useState(0);
  const { palette } = useSettings();
  const finish = async (elo: number) => {
    const p: Profile = { ...profile, onboardingDone: true, estimatedElo: elo, recommendedBotElo: elo, updatedAt: Date.now() };
    await saveProfile(p, db);
    onDone(p);
  };
  return (
    <Modal title="Bienvenue dans BlueRed Chess">
      {step === 0 && (
        <div className="onboarding-step stack">
          <div className="big">
            <span style={{ color: palette.w.piece }}>●</span> <span style={{ color: palette.b.piece }}>●</span>
          </div>
          <p>
            Ici, les Blancs sont <strong style={{ color: palette.w.piece }}>Bleus</strong> et jouent en premier ; les Noirs sont <strong style={{ color: palette.b.piece }}>Rouges</strong>. Les règles sont celles des échecs classiques.
          </p>
          <button type="button" className="btn btn-primary" data-testid="onboarding-next" onClick={() => setStep(1)}>
            Suivant
          </button>
        </div>
      )}
      {step === 1 && (
        <div className="onboarding-step stack">
          <p>
            La <strong>heatmap</strong> colore chaque case selon qui l'attaque. Survole ou clique le cavalier central : ses huit cases s'allument.
          </p>
          <Board fen="4k3/8/8/8/3N4/8/8/4K3 w - - 0 1" flipped={false} movable={[]} heatmapMode="P" palette={palette} intensity={1} showCounts={false} showHanging={false} showLoose={false} hatching={false} />
          <button type="button" className="btn btn-primary" data-testid="onboarding-next" onClick={() => setStep(2)}>
            Suivant
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="onboarding-step stack">
          <p>Quel est ton niveau ? Cela choisit ton premier adversaire.</p>
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn" data-testid="level-800" onClick={() => void finish(800)}>
              Débutant (800)
            </button>
            <button type="button" className="btn" onClick={() => void finish(1000)}>
              Occasionnel (1000)
            </button>
            <button type="button" className="btn" onClick={() => void finish(1300)}>
              Club (1300)
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
