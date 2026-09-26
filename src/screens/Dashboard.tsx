import { useEffect, useState } from 'react';
import { db, loadProfile, saveProfile } from '../data/db';
import type { Game, Profile, TrainingPlan } from '../data/models';
import { INDICATORS, isAlert } from '../progress/profile';
import { Radar } from '../ui/Radar';
import { profileFor } from '../engine/botProfiles';
import { useSettings } from '../store/settingsStore';
import { useGame } from '../store/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { navigate } from '../app/router';
import { Modal } from '../ui/Modal';
import { Board } from '../board/Board';
import { resultScore } from '../progress/profile';
import { useInstallPrompt } from '../app/installPrompt';
import { Ring } from '../ui/Ring';
import { IconBoardEmpty, IconPlan, IconRadar, IconTrophy } from '../ui/icons';

export function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [totalGames, setTotalGames] = useState(0);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const { settings, palette, update } = useSettings();
  const current = useGame(useShallow((s) => ({ inProgress: s.records.length > 0 && !s.status.over, botElo: s.botElo, mode: s.mode, plies: s.records.length })));
  const { canInstall, installed, install } = useInstallPrompt();

  useEffect(() => {
    void (async () => {
      setProfile(await loadProfile(db));
      setPlan((await db.plans.orderBy('generatedAt').reverse().first()) ?? null);
      setGames(await db.games.orderBy('createdAt').reverse().limit(5).toArray());
      setTotalGames(await db.games.count());
      const lastAnalysis = await db.analyses.orderBy('createdAt').reverse().first();
      setLastAccuracy(lastAnalysis ? lastAnalysis.accuracy : null);
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
      {!profile.onboardingDone && <Onboarding profile={profile} onDone={(p) => setProfile(p)} onLevel={(elo) => void update({ defaultHeatmapMode: elo <= 800 ? 'P' : 'A' })} />}
      <div className="grid grid-2">
        <div className="card card-hero">
          <div className="card-title">
            <IconTrophy className="ico" />
            <h3>Ma progression</h3>
          </div>
          <div className="row" style={{ gap: '1.2rem', marginBottom: '.6rem' }}>
            <div>
              <div className="muted small">Elo maison</div>
              <div className="stat" data-testid="elo">{profile.estimatedElo}</div>
              <div className="muted small">estimation interne, à comparer prudemment avec Lichess</div>
            </div>
            <Ring value={lastAccuracy ?? 0} label="Précision de la dernière partie" color="var(--green)" />
          </div>
          <div className="stat-tiles" style={{ marginBottom: '.8rem' }}>
            <div className="stat-tile"><div className="label">Parties</div><div className="value">{totalGames}</div></div>
            <div className="stat-tile"><div className="label">Analysées</div><div className="value">{profile.gamesAnalyzed}</div></div>
            <div className="stat-tile"><div className="label">Série</div><div className="value">{profile.streak.wins > 0 ? `${profile.streak.wins} V` : profile.streak.losses > 0 ? `${profile.streak.losses} D` : '—'}</div></div>
            <div className="stat-tile"><div className="label">Précision</div><div className="value">{lastAccuracy !== null ? `${Math.round(lastAccuracy)} %` : '—'}</div></div>
          </div>
          <div className="btn-row">
            {current.inProgress && (
              <a className="btn btn-primary" href="#/partie" data-testid="resume-game">
                Reprendre la partie en cours ({current.mode === 'human' ? 'deux joueurs' : `bot ${current.botElo}`}, {current.plies} demi-coups)
              </a>
            )}
            <button type="button" className={`btn ${current.inProgress ? '' : 'btn-primary'}`} data-testid="play-recommended" onClick={playRecommended}>
              Jouer contre {bot.name} ({bot.elo})
            </button>
            <a className="btn" href="#/partie">
              Choisir un bot
            </a>
          </div>
          {canInstall && !installed && (
            <p className="small" style={{ marginTop: '.5rem' }}>
              <button type="button" className="btn btn-sm" onClick={() => void install()}>
                Installer l'application
              </button>{' '}
              <span className="muted">pour la lancer hors ligne depuis l'écran d'accueil.</span>
            </p>
          )}
          {backupDue && (
            <p className="small" style={{ color: 'var(--accent)', marginTop: '.5rem' }}>
              Pense à sauvegarder tes données : <a href="#/reglages">exporter maintenant</a>.
            </p>
          )}
        </div>
        <div className="card">
          <div className="card-title">
            <IconRadar className="ico" />
            <h3>Radar de faiblesses</h3>
          </div>
          {Object.keys(profile.indicators).length === 0 ? (
            <div className="empty">
              <IconRadar />
              <p>Analyse tes premières parties pour remplir le radar.</p>
            </div>
          ) : (
            <>
              <Radar current={profile.indicators} previous={profile.previousIndicators} />
              <div className="indicator-list">
                {INDICATORS.filter((d) => profile.indicators[d.key] !== undefined).map((d) => (
                  <div key={d.key} className={`indicator ${isAlert(d, profile.indicators[d.key]) ? 'alert' : ''}`} title={d.description}>
                    <span>{d.label}</span>
                    <span>
                      <span className="val">{profile.indicators[d.key]}</span> <span className="muted small">{d.unit}</span>{' '}
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
          <div className="card-title">
            <IconPlan className="ico" />
            <h3>Plan du jour</h3>
          </div>
          {!plan ? (
            <div className="empty">
              <IconPlan />
              <p>Le plan d'entraînement apparaît après ta première partie analysée et se recalcule toutes les 5 parties.</p>
            </div>
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
          <div className="card-title">
            <IconBoardEmpty className="ico" />
            <h3>Dernières parties</h3>
          </div>
          {games.length === 0 && (
            <div className="empty">
              <IconBoardEmpty />
              <p>Aucune partie pour l'instant.</p>
            </div>
          )}
          {games.map((g) => {
            const s = resultScore(g);
            return (
              <div key={g.id} className="list-row">
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
      <div className="card">
        <div className="legend">
          <span><i style={{ background: palette.w.overlay }} />attaquée par le Bleu</span>
          <span><i style={{ background: palette.b.overlay }} />attaquée par le Rouge</span>
          <span><i style={{ background: `linear-gradient(135deg, ${palette.w.overlay} 50%, ${palette.b.overlay} 50%)` }} />contestée</span>
          <span className="muted">Plus il y a d'attaquants, plus la teinte est soutenue. Palette : {palette.name}.</span>
        </div>
      </div>
    </div>
  );
}

function Onboarding({ profile, onDone, onLevel }: { profile: Profile; onDone: (p: Profile) => void; onLevel: (elo: number) => void }) {
  const [step, setStep] = useState(0);
  const { palette } = useSettings();
  const finish = async (elo: number) => {
    const p: Profile = { ...profile, onboardingDone: true, estimatedElo: elo, recommendedBotElo: elo, updatedAt: Date.now() };
    await saveProfile(p, db);
    onLevel(elo);
    onDone(p);
  };
  return (
    <Modal title="Bienvenue dans BlueRed Chess">
      <div className="steps" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
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
          <p>Quel est ton niveau ? Cela choisit ton premier adversaire (et, pour les débutants, une heatmap « pièce seule » plus lisible, modifiable dans les réglages).</p>
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
