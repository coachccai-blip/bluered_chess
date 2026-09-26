import type { MoveEval } from '../analysis/coach';
import { winProbability } from '../analysis/winprob';

/** Courbe d'évaluation cliquable : bleu au-dessus de zéro, rouge en dessous. */
export function EvalChart({ moves, current, onSelect }: { moves: MoveEval[]; current: number; onSelect: (ply: number) => void }) {
  const W = 600;
  const H = 140;
  const n = moves.length;
  if (n === 0) return null;
  const x = (i: number) => (i / n) * W;
  const y = (cp: number) => H - (winProbability(cp) / 100) * H;
  const pts = [{ x: 0, cp: moves[0].evalBefore }, ...moves.map((m, i) => ({ x: x(i + 1), cp: m.evalAfter }))];
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${y(p.cp).toFixed(1)}`).join(' ');
  const area = `${path} L${W},${H / 2} L0,${H / 2} Z`;
  return (
    <svg
      className="eval-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      data-testid="eval-chart"
      onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const ply = Math.round(((e.clientX - rect.left) / rect.width) * n);
        onSelect(Math.max(1, Math.min(n, ply)));
      }}
    >
      <defs>
        <clipPath id="clip-top">
          <rect x="0" y="0" width={W} height={H / 2} />
        </clipPath>
        <clipPath id="clip-bottom">
          <rect x="0" y={H / 2} width={W} height={H / 2} />
        </clipPath>
      </defs>
      <path d={area} fill="#3b82f6" opacity="0.8" clipPath="url(#clip-top)" />
      <path d={area} fill="#ef4444" opacity="0.8" clipPath="url(#clip-bottom)" />
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#fff" strokeOpacity="0.4" />
      <path d={path} fill="none" stroke="#fff" strokeWidth="1.5" />
      {current > 0 && <line x1={x(current)} y1="0" x2={x(current)} y2={H} stroke="#f5c542" strokeWidth="2" />}
    </svg>
  );
}
