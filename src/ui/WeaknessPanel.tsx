import { useState } from 'react';
import { Modal } from './Modal';
import { diagnosis, type WeaknessSummary } from '../progress/weaknessGuide';
import { launchAction } from '../progress/launchAction';

const KIND_ICON: Record<string, string> = { drills: '🔁', puzzles: '🧩', blindfold: '👁', endgame: '♔', game: '♟', link: '↗' };

export function WeaknessPanel({ weakness, onClose }: { weakness: WeaknessSummary; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const g = weakness.guide;
  return (
    <Modal title={`Programme : ${g.title}`} onClose={onClose}>
      <div className="stack" data-testid="weakness-panel" style={{ gap: '.8rem' }}>
        <p className="small">
          <span className={`tag ${weakness.alert ? 'tag-alert' : weakness.value === undefined ? '' : 'tag-ok'}`}>{weakness.alert ? 'À travailler' : weakness.value === undefined ? 'Pas de donnée' : 'Dans la bonne zone'}</span> {diagnosis(weakness)}
        </p>
        <p className="small muted" style={{ margin: 0 }}>{g.why}</p>
        <div>
          <strong className="small">Méthode à appliquer en partie</strong>
          <ul className="small" style={{ marginTop: '.3rem' }}>
            {g.method.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong className="small">Exercices ciblés</strong>
          <div className="stack" style={{ gap: '.35rem', marginTop: '.3rem' }}>
            {g.actions.map((a, i) => (
              <button
                key={i}
                type="button"
                className={`btn btn-sm ${a.kind === 'link' ? 'btn-ghost' : ''}`}
                style={{ justifyContent: 'flex-start' }}
                data-testid={`action-${a.kind}`}
                onClick={async () => {
                  const m = await launchAction(a);
                  if (m) setMsg(m);
                }}
              >
                <span aria-hidden>{KIND_ICON[a.kind]}</span> {a.label}
              </button>
            ))}
          </div>
          {msg && <p className="small" style={{ color: 'var(--accent)', marginTop: '.4rem' }}>{msg}</p>}
        </div>
        <p className="small" style={{ margin: 0 }}>
          <strong>Routine conseillée :</strong> {g.routine}
        </p>
      </div>
    </Modal>
  );
}
