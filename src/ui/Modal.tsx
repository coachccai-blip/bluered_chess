import { useEffect, useState, type ReactNode } from 'react';
import { IconClose } from './icons';

/**
 * Fenêtre modale. Pendant les premières centaines de millisecondes après l'ouverture, elle ignore tout clic :
 * sur écran tactile, le toucher qui a provoqué l'ouverture génère un « clic » fantôme qui atterrirait sur la fenêtre
 * (et la fermait ou validait un bouton sans que l'utilisateur l'ait voulu).
 */
export function Modal({ title, children, onClose, guardMs = 450 }: { title: string; children: ReactNode; onClose?: () => void; guardMs?: number }) {
  const [armed, setArmed] = useState(guardMs <= 0);
  useEffect(() => {
    if (guardMs <= 0) return;
    const t = setTimeout(() => setArmed(true), guardMs);
    return () => clearTimeout(t);
  }, [guardMs]);
  return (
    <div className="modal-backdrop" onClick={() => armed && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} data-armed={armed} style={armed ? undefined : { pointerEvents: 'none' }} onClick={(e) => e.stopPropagation()}>
        <div className="row spread" style={{ marginBottom: '.5rem' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {onClose && (
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
              <IconClose width={18} height={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
