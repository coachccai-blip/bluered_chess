import type { Color, PieceSymbol } from '../chess/types';
import { PieceGlyph } from './pieces';

interface Props {
  type: PieceSymbol;
  color: Color;
  x: number;
  y: number;
  size: number;
  fillColor: string;
  dragging?: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
}

export function Piece({ type, color, x, y, size, fillColor, dragging, onPointerDown }: Props) {
  const scale = size / 45;
  return (
    <g
      data-piece={`${color}${type}`}
      transform={`translate(${x} ${y}) scale(${scale})`}
      style={{ ['--piece-fill' as string]: fillColor, cursor: 'grab', opacity: dragging ? 0.35 : 1, transition: 'transform 120ms ease' }}
      onPointerDown={onPointerDown}
    >
      <PieceGlyph type={type} />
    </g>
  );
}
