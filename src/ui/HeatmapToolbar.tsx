import { useEffect } from 'react';
import { HEATMAP_MODES, type HeatmapMode } from '../board/ThreatOverlay';

export function HeatmapToolbar({ mode, onChange, drawMode, onDrawModeChange }: { mode: HeatmapMode; onChange: (m: HeatmapMode) => void; drawMode?: boolean; onDrawModeChange?: (on: boolean) => void }) {
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
      {onDrawModeChange && (
        <button
          type="button"
          className={`heat-btn heat-draw ${drawMode ? 'active' : ''}`}
          data-testid="toolbar-draw"
          aria-pressed={!!drawMode}
          title={drawMode ? 'Mode dessin actif : toucher = marquer une case, glisser = flèche. Toucher à nouveau pour rejouer.' : 'Mode dessin : marquer des cases et tracer des flèches avec le doigt ou le clic gauche'}
          onClick={() => onDrawModeChange(!drawMode)}
        >
          ✎ Dessin
        </button>
      )}
    </div>
  );
}
