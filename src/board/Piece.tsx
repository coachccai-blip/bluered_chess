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
  animate?: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
}

export function Piece({ type, color, x, y, size, fillColor, dragging, animate, onPointerDown }: Props) {
  const scale = size / 45;
  return (
    <g
      data-piece={`${color}${type}`}
      className={animate ? 'piece-anim' : undefined}
      style={{
        ['--piece-fill' as string]: fillColor,
        cursor: 'grab',
        opacity: dragging ? 0.35 : 1,
        // Transformation CSS (et non attribut SVG) pour pouvoir animer le glissement.
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        transformOrigin: '0 0',
      }}
      onPointerDown={onPointerDown}
    >
      <PieceGlyph type={type} />
    </g>
  );
}
