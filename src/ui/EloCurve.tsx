import type { EloPoint } from '../data/models';

export function EloCurve({ points }: { points: EloPoint[] }) {
  const W = 600;
  const H = 120;
  if (points.length < 2) return null;
  const elos = points.map((p) => p.elo);
  const min = Math.min(...elos) - 20;
  const max = Math.max(...elos) + 20;
  const x = (i: number) => (i / (points.length - 1)) * (W - 40) + 30;
  const y = (e: number) => H - 10 - ((e - min) / (max - min)) * (H - 20);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.elo).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="eval-chart" style={{ height: 120, cursor: 'default' }} data-testid="elo-curve">
      <text x="2" y="14" fontSize="11" fill="#9aa4b5">{max - 20}</text>
      <text x="2" y={H - 4} fontSize="11" fill="#9aa4b5">{min + 20}</text>
      <path d={d} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.elo)} r="3" fill="#f5c542" />
      ))}
    </svg>
  );
}
