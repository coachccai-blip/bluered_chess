// Matériel capturé par chaque camp et différence, calculés depuis le FEN.
import { PIECE_VALUES, type Color, type PieceSymbol } from '../chess/types';
import { PieceGlyph } from '../board/pieces';

const START: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];

export function capturedBy(fen: string, color: Color): { pieces: PieceSymbol[]; diff: number } {
  const placement = fen.split(' ')[0];
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } } as Record<Color, Record<PieceSymbol, number>>;
  for (const ch of placement) {
    const l = ch.toLowerCase() as PieceSymbol;
    if (!'pnbrqk'.includes(l)) continue;
    count[ch === l ? 'b' : 'w'][l]++;
  }
  const opp: Color = color === 'w' ? 'b' : 'w';
  const pieces: PieceSymbol[] = [];
  for (const t of ORDER) for (let i = 0; i < Math.max(0, START[t] - count[opp][t]); i++) pieces.push(t);
  const material = (c: Color) => ORDER.reduce((a, t) => a + count[c][t] * PIECE_VALUES[t], 0);
  return { pieces, diff: Math.round((material(color) - material(opp)) / 100) };
}

export function Material({ fen, color, fill }: { fen: string; color: Color; fill: string }) {
  const { pieces, diff } = capturedBy(fen, color);
  if (pieces.length === 0 && diff <= 0) return null;
  return (
    <span className="material" title="Pièces capturées" data-testid={`material-${color}`}>
      {pieces.map((t, i) => (
        <svg key={i} viewBox="0 0 45 45" style={{ ['--piece-fill' as string]: fill }}>
          <PieceGlyph type={t} />
        </svg>
      ))}
      {diff > 0 && <span className="plus">+{diff}</span>}
    </span>
  );
}
