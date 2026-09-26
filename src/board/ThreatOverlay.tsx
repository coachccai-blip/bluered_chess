// Calque SVG de heatmap : cases attaquées par camp, cases contestées, chiffres, pièces en prise.
import type { AttackSummary, Color, Square } from '../chess/types';
import { ALL_SQUARES } from '../chess/types';
import { overlayOpacity, type Palette } from './theme';

export type HeatmapMode = 'A' | 'B' | 'R' | 'C' | 'P' | 'H' | 'X';

export const HEATMAP_MODES: { key: HeatmapMode; label: string; help: string }[] = [
  { key: 'A', label: 'Tout', help: 'Bleu + Rouge' },
  { key: 'B', label: 'Bleu', help: 'Cases attaquées par le Bleu' },
  { key: 'R', label: 'Rouge', help: 'Cases attaquées par le Rouge' },
  { key: 'C', label: 'Contestées', help: 'Cases attaquées par les deux camps' },
  { key: 'P', label: 'Pièce', help: 'Pièce sélectionnée ou survolée seule' },
  { key: 'H', label: 'Masquer', help: 'Aucune surbrillance' },
  { key: 'X', label: 'Prévisualiser', help: 'Après mon coup, ce que l\'adversaire attaquerait' },
];

interface Props {
  summary: AttackSummary;
  /** Prévisualisation (mode X) : carte après le coup envisagé, dessinée en pointillés. */
  preview?: AttackSummary | null;
  mode: HeatmapMode;
  palette: Palette;
  intensity: number;
  showCounts: boolean;
  showHanging: boolean;
  showLoose: boolean;
  hatching: boolean;
  flipped: boolean;
  squareSize: number;
  /** Cases de la pièce sélectionnée (mode P). */
  focusSquares?: Square[] | null;
  focusColor?: Color | null;
}

export function squareXY(sq: Square, flipped: boolean, size: number): { x: number; y: number } {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return { x: col * size, y: row * size };
}

export function ThreatOverlay(p: Props) {
  const { summary, mode, palette, intensity, squareSize: s } = p;
  if (mode === 'H') return null;
  const showW = mode === 'A' || mode === 'B' || mode === 'C' || mode === 'X';
  const showB = mode === 'A' || mode === 'R' || mode === 'C' || mode === 'X';
  const map = mode === 'X' && p.preview ? p.preview.map : summary.map;
  const dashed = mode === 'X' && p.preview;
  const elements: JSX.Element[] = [];

  for (const sq of ALL_SQUARES) {
    const { x, y } = squareXY(sq, p.flipped, s);
    let wCount = map[sq].w.length;
    let bCount = map[sq].b.length;
    if (mode === 'P') {
      if (!p.focusSquares || !p.focusColor) continue;
      if (!p.focusSquares.includes(sq)) continue;
      wCount = p.focusColor === 'w' ? 1 : 0;
      bCount = p.focusColor === 'b' ? 1 : 0;
    }
    if (mode === 'C' && (wCount === 0 || bCount === 0)) continue;
    const w = mode === 'P' || showW ? wCount : 0;
    const b = mode === 'P' || showB ? bCount : 0;
    if (w === 0 && b === 0) continue;
    const patW = p.hatching ? 'url(#hatch-w)' : palette.w.overlay;
    const patB = p.hatching ? 'url(#hatch-b)' : palette.b.overlay;
    const strokeProps = dashed ? { stroke: '#fff', strokeDasharray: '4 3', strokeWidth: 1.5 } : {};
    if (w > 0 && b > 0) {
      elements.push(
        <g key={sq} data-heat={sq} data-blue={w} data-red={b}>
          <polygon points={`${x},${y} ${x + s},${y} ${x},${y + s}`} fill={patW} opacity={overlayOpacity(w, intensity)} {...strokeProps} />
          <polygon points={`${x + s},${y} ${x + s},${y + s} ${x},${y + s}`} fill={patB} opacity={overlayOpacity(b, intensity)} {...strokeProps} />
        </g>,
      );
    } else if (w > 0) {
      elements.push(<rect key={sq} data-heat={sq} data-blue={w} data-red={0} x={x} y={y} width={s} height={s} fill={patW} opacity={overlayOpacity(w, intensity)} {...strokeProps} />);
    } else {
      elements.push(<rect key={sq} data-heat={sq} data-blue={0} data-red={b} x={x} y={y} width={s} height={s} fill={patB} opacity={overlayOpacity(b, intensity)} {...strokeProps} />);
    }
    if (p.showCounts && mode !== 'P') {
      const fs = s * 0.2;
      if (w > 0)
        elements.push(
          <text key={`${sq}-w`} x={x + s * 0.08} y={y + fs + s * 0.06} fontSize={fs} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={fs * 0.12} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
            {w}
          </text>,
        );
      if (b > 0)
        elements.push(
          <text key={`${sq}-b`} x={x + s * 0.92} y={y + s * 0.94} fontSize={fs} fontWeight={700} textAnchor="end" fill="#fff" stroke="#000" strokeWidth={fs * 0.12} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
            {b}
          </text>,
        );
    }
  }

  if (p.showHanging && mode !== 'P' && mode !== 'X') {
    for (const h of summary.hanging) {
      const { x, y } = squareXY(h.square, p.flipped, s);
      const attackerColor = h.color === 'w' ? 'b' : 'w';
      elements.push(
        <circle key={`hang-${h.square}`} className="hanging-ring" data-hanging={h.square} cx={x + s / 2} cy={y + s / 2} r={s * 0.42} fill="none" stroke={palette[attackerColor].ring} strokeWidth={s * 0.07} style={{ pointerEvents: 'none' }} />,
      );
    }
  }
  if (p.showLoose && mode !== 'P') {
    for (const l of summary.loose) {
      const { x, y } = squareXY(l.square, p.flipped, s);
      elements.push(
        <polygon key={`loose-${l.square}`} points={`${x + s * 0.5},${y + s * 0.06} ${x + s * 0.62},${y + s * 0.26} ${x + s * 0.38},${y + s * 0.26}`} fill="#f5c542" stroke="#000" strokeWidth={0.6} style={{ pointerEvents: 'none' }} />,
      );
    }
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <pattern id="hatch-w" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="3" height="6" fill={palette.w.overlay} />
        </pattern>
        <pattern id="hatch-b" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
          <rect width="3" height="6" fill={palette.b.overlay} />
        </pattern>
      </defs>
      {elements}
    </g>
  );
}
