// Barre d'évaluation verticale à gauche de l'échiquier : part bleue (Blancs) en bas quand le Bleu est en bas.
import { winProbability } from '../analysis/winprob';
import { formatEval } from '../analysis/coach';
import type { Palette } from '../board/theme';

export function EvalBarVertical({ cp, flipped, palette, pending }: { cp: number | null; flipped: boolean; palette: Palette; pending?: boolean }) {
  const value = cp ?? 0;
  const whitePct = winProbability(value); // 0..100, part des Blancs (Bleu)
  const label = cp === null ? '…' : formatEval(cp);
  // Sans retournement, le Bleu est en bas : sa part part du bas.
  const bluePct = whitePct;
  const blueOnBottom = !flipped;
  return (
    <div className={`evalbar ${pending ? 'pending' : ''}`} data-testid="evalbar" data-cp={cp ?? ''} title={`Évaluation : ${label} (point de vue du Bleu)`} aria-label={`Évaluation ${label}`}>
      <div className="evalbar-track" style={{ background: palette.b.piece }}>
        <div
          className="evalbar-fill"
          style={{
            background: palette.w.piece,
            height: `${bluePct}%`,
            top: blueOnBottom ? 'auto' : 0,
            bottom: blueOnBottom ? 0 : 'auto',
          }}
        />
        <div className="evalbar-mid" />
      </div>
      <span className={`evalbar-label ${(value >= 0) === blueOnBottom ? 'at-bottom' : 'at-top'}`} style={{ color: value >= 0 ? palette.w.piece : palette.b.piece }}>
        {label}
      </span>
    </div>
  );
}
