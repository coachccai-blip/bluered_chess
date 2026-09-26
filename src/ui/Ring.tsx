/** Anneau de progression (0..100) avec valeur au centre. */
export function Ring({ value, label, color, size = 96 }: { value: number; label?: string; color?: string; size?: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label ?? ''} ${Math.round(v)} %`}>
      <svg viewBox="0 0 100 100">
        <circle className="track" cx="50" cy="50" r={r} fill="none" strokeWidth="10" />
        <circle className="bar" cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={color ? { stroke: color } : undefined} />
      </svg>
      <div className="txt">{Math.round(v)}%</div>
    </div>
  );
}
