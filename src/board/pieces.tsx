// Jeu de pièces SVG monochrome maison (viewBox 0 0 45 45), recoloré par la variable CSS --piece-fill.
// Contour blanc épais pour rester lisible sur une case teintée.
import type { PieceSymbol } from '../chess/types';

const stroke = { stroke: '#fff', strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const fill = 'var(--piece-fill)';

export const PIECE_PATHS: Record<PieceSymbol, JSX.Element> = {
  p: (
    <g fill={fill} {...stroke}>
      <circle cx="22.5" cy="12" r="5" />
      <path d="M18.5 16.5h8l3.5 10.5h-15z" />
      <path d="M12 27h21a2 2 0 0 1 2 2v3h-25v-3a2 2 0 0 1 2-2z" />
      <path d="M10 33h25a2 2 0 0 1 2 2v3h-29v-3a2 2 0 0 1 2-2z" />
    </g>
  ),
  r: (
    <g fill={fill} {...stroke}>
      <path d="M11 9h5v4h4V9h5v4h4V9h5v8H11z" />
      <path d="M13 17h19v3l-2 2v13h-15V22l-2-2z" />
      <path d="M9 35h27v4H9z" />
    </g>
  ),
  n: (
    <g fill={fill} {...stroke}>
      <path d="M11 39c0-9 3-15 9-19-2-2-1.5-5 .5-7l2.5-5 2.5 3.5C33 12 36 18 36 26c0 5-2 9-2 13z" />
      <path d="M20 20c-3 3-6 8-6 12" fill="none" />
      <circle cx="27.5" cy="16.5" r="1.4" fill="#fff" stroke="none" />
      <path d="M9 39h27v0" />
    </g>
  ),
  b: (
    <g fill={fill} {...stroke}>
      <circle cx="22.5" cy="8" r="2.6" />
      <path d="M22.5 10.5C15.5 16 13 22 14 29h17c1-7-1.5-13-8.5-18.5z" />
      <path d="M22.5 15v8M19 19h7" stroke="#fff" strokeWidth="1.8" fill="none" />
      <path d="M13 29h19v4H13z" />
      <path d="M10 33h25a2 2 0 0 1 2 2v3H8v-3a2 2 0 0 1 2-2z" />
    </g>
  ),
  q: (
    <g fill={fill} {...stroke}>
      <path d="M10 29L8 14l8.5 8L22.5 9l6 13 8.5-8-2 15z" />
      <circle cx="8" cy="12.5" r="2.3" />
      <circle cx="22.5" cy="7.5" r="2.3" />
      <circle cx="37" cy="12.5" r="2.3" />
      <path d="M10 29h25v5H10z" />
      <path d="M9 34h27v5H9z" />
    </g>
  ),
  k: (
    <g fill={fill} {...stroke}>
      <path d="M21 4h3v3.5h3.5v3H24V14h-3v-3.5h-3.5v-3H21z" />
      <path d="M12 30c-4-8 0-14 6-12l4.5 6 4.5-6c6-2 10 4 6 12z" />
      <path d="M12 30h21v5H12z" />
      <path d="M10 35h25v4H10z" />
    </g>
  ),
};

export function PieceGlyph({ type }: { type: PieceSymbol }) {
  return PIECE_PATHS[type];
}
