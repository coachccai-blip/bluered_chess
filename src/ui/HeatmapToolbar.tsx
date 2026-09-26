import { useEffect } from 'react';
import { HEATMAP_MODES, type HeatmapMode } from '../board/ThreatOverlay';

export function HeatmapToolbar({ mode, onChange }: { mode: HeatmapMode; onChange: (m: HeatmapMode) => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toUpperCase() as HeatmapMode;
      if (HEATMAP_MODES.some((m) => m.key === k)) onChange(k);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onChange]);
  return (
    <div className="heat-toolbar" role="toolbar" aria-label="Modes de heatmap">
      {HEATMAP_MODES.map((m) => (
        <button key={m.key} type="button" className={`heat-btn ${mode === m.key ? 'active' : ''}`} title={m.help} data-heatmode={m.key} onClick={() => onChange(m.key)}>
          <kbd>{m.key}</kbd>
          {m.label}
        </button>
      ))}
    </div>
  );
}
