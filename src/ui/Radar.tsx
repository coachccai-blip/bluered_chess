import { INDICATORS, radarScore } from '../progress/profile';

const SHORT: Record<string, string> = { hanging: 'Pièces pendantes', tactics: 'Tactiques', kingSafety: 'Roi', endgame: 'Finales', opening: 'Ouverture', redSquares: 'Cases rouges', advantage: 'Avantage' };

/** Radar à 7 axes : indicateurs actuels vs précédents. */
export function Radar({ current, previous }: { current: Record<string, number>; previous?: Record<string, number> }) {
  const S = 360;
  const c = S / 2;
  const r = S * 0.3;
  const n = INDICATORS.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, v: number) => ({ x: c + Math.cos(angle(i)) * r * (v / 100), y: c + Math.sin(angle(i)) * r * (v / 100) });
  const poly = (vals: Record<string, number> | undefined) =>
    INDICATORS.map((d, i) => point(i, radarScore(d, vals?.[d.key]))).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg className="radar" viewBox={`0 0 ${S} ${S}`} data-testid="radar">
      {[25, 50, 75, 100].map((lvl) => (
        <polygon key={lvl} points={INDICATORS.map((_, i) => point(i, lvl)).map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#2d3544" />
      ))}
      {INDICATORS.map((d, i) => {
        const p = point(i, 100);
        const l = point(i, 132);
        return (
          <g key={d.key}>
            <line x1={c} y1={c} x2={p.x} y2={p.y} stroke="#2d3544" />
            <text x={l.x} y={l.y} fontSize="11" fill="#9aa4b5" textAnchor="middle" dominantBaseline="middle">
              {SHORT[d.key] ?? d.label}
            </text>
          </g>
        );
      })}
      {previous && <polygon points={poly(previous)} fill="#9aa4b5" fillOpacity="0.15" stroke="#9aa4b5" strokeDasharray="4 3" />}
      <polygon points={poly(current)} fill="#3b82f6" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="2" />
    </svg>
  );
}
