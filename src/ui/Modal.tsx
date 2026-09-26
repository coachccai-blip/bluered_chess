import type { ReactNode } from 'react';
import { IconClose } from './icons';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
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
