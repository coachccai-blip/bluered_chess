import { BOT_PROFILES, BOT_STEP, MAX_BOT_ELO, MIN_BOT_ELO, profileFor } from '../engine/botProfiles';

export function BotSelector({ elo, recommended, onChange, record }: { elo: number; recommended?: number; onChange: (e: number) => void; record?: { wins: number; losses: number; draws: number } }) {
  const p = profileFor(elo);
  return (
    <div className="stack" style={{ gap: '.5rem' }}>
      <div className="bot-card">
        <div className="bot-avatar">{p.name[0]}</div>
        <div>
          <div>
            <strong>{p.name}</strong> · <span data-testid="bot-elo">{p.elo}</span> Elo{' '}
            {recommended === p.elo && <span className="tag tag-ok">recommandé</span>}
          </div>
          <div className="muted small">{p.style}</div>
          {record && (
            <div className="muted small">
              Ton bilan : {record.wins} V · {record.draws} N · {record.losses} D
            </div>
          )}
        </div>
      </div>
      <input
        className="bot-slider"
        type="range"
        min={MIN_BOT_ELO}
        max={MAX_BOT_ELO}
        step={BOT_STEP}
        value={p.elo}
        aria-label="Niveau du bot"
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        list="bot-ticks"
      />
      <datalist id="bot-ticks">
        {BOT_PROFILES.map((b) => (
          <option key={b.elo} value={b.elo} />
        ))}
      </datalist>
      <div className="bot-ticks">
        <span>800</span>
        <span>1000</span>
        <span>1200</span>
        <span>1400</span>
        <span>1600</span>
        <span>1800</span>
      </div>
    </div>
  );
}
