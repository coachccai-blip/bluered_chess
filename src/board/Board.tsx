// Échiquier SVG Bleu contre Rouge : clic-clic, glisser-déposer, promotion, flèches, heatmap.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { attackedSquaresOf, computeAttacks, parseFenBoard, boardPieces, type AttackOptions } from '../chess/attacks';
import { applyMove, inCheck, kingSquare, legalMovesFrom, needsPromotion, turnOf } from '../chess/game';
import type { Color, PieceSymbol, Square } from '../chess/types';
import { ALL_SQUARES, coordsToSquare, squareToCoords } from '../chess/types';
import { Piece } from './Piece';
import { ThreatOverlay, squareXY, type HeatmapMode } from './ThreatOverlay';
import type { Palette } from './theme';

export interface Arrow {
  from: Square;
  to: Square;
  color: string;
  dashed?: boolean;
  crossed?: boolean;
}

export interface BoardProps {
  fen: string;
  flipped: boolean;
  /** Camps que l'utilisateur peut déplacer (vide = lecture seule). */
  movable: Color[];
  onMove?: (m: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => void;
  lastMove?: { from: Square; to: Square } | null;
  arrows?: Arrow[];
  heatmapMode: HeatmapMode;
  palette: Palette;
  intensity: number;
  showCounts: boolean;
  showHanging: boolean;
  showLoose: boolean;
  hatching: boolean;
  attackOptions?: AttackOptions;
  animations?: boolean;
  size?: number; // px logique (viewBox) ; l'élément s'adapte en CSS
  onSquareClick?: (sq: Square) => void;
  /** Cases surlignées (exercices). */
  marked?: Square[];
}

const SIZE = 800;
const SQ = SIZE / 8;

/**
 * Identités stables des pièces entre deux positions : la pièce déplacée garde son identifiant (ainsi que la tour
 * du roque), ce qui permet d'animer le glissement avec des clés React constantes.
 */
export function nextPieceIds(prev: Map<Square, number>, prevFen: string | null, fen: string, lastMove: { from: Square; to: Square } | null, nextId: { value: number }): Map<Square, number> {
  const board = parseFenBoard(fen);
  const ids = new Map<Square, number>();
  if (prevFen && lastMove && prev.size > 0) {
    for (const [sq, id] of prev) ids.set(sq, id);
    const movedId = ids.get(lastMove.from);
    ids.delete(lastMove.from);
    if (movedId !== undefined) ids.set(lastMove.to, movedId);
    // Roque : la tour saute aussi.
    const fromFile = lastMove.from.charCodeAt(0);
    const toFile = lastMove.to.charCodeAt(0);
    const rank = lastMove.to[1];
    const piece = board[parseInt(rank, 10) - 1][toFile - 97];
    if (piece?.type === 'k' && Math.abs(fromFile - toFile) === 2) {
      const rookFrom = (toFile > fromFile ? 'h' : 'a') + rank;
      const rookTo = (toFile > fromFile ? 'f' : 'd') + rank;
      const rid = ids.get(rookFrom as Square);
      ids.delete(rookFrom as Square);
      if (rid !== undefined) ids.set(rookTo as Square, rid);
    }
  }
  // Nettoyage : cases vides, puis identifiants neufs pour les pièces sans identité (nouvelle partie, promotion).
  for (const sq of [...ids.keys()]) {
    const { file, rank } = squareToCoords(sq);
    if (!board[rank][file]) ids.delete(sq);
  }
  for (const pc of boardPieces(board)) if (!ids.has(pc.square)) ids.set(pc.square, nextId.value++);
  return ids;
}

export function Board(p: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [hover, setHover] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number } | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  const board = useMemo(() => parseFenBoard(p.fen), [p.fen]);
  const pieces = useMemo(() => boardPieces(board), [board]);
  const idsRef = useRef<{ fen: string | null; ids: Map<Square, number>; counter: { value: number } }>({ fen: null, ids: new Map(), counter: { value: 1 } });
  const skipAnimRef = useRef(false);
  if (idsRef.current.fen !== p.fen) {
    idsRef.current.ids = nextPieceIds(idsRef.current.ids, idsRef.current.fen, p.fen, p.lastMove ?? null, idsRef.current.counter);
    idsRef.current.fen = p.fen;
  }
  const animate = p.animations !== false && !skipAnimRef.current;
  useEffect(() => {
    skipAnimRef.current = false;
  }, [p.fen]);
  const turn = turnOf(p.fen);
  const summary = useMemo(() => computeAttacks(p.fen, p.attackOptions), [p.fen, p.attackOptions]);
  const check = useMemo(() => (inCheck(p.fen) ? kingSquare(p.fen, turn) : null), [p.fen, turn]);

  const canMove = (sq: Square) => {
    const piece = board[parseInt(sq[1], 10) - 1][sq.charCodeAt(0) - 97];
    return !!piece && piece.color === turn && p.movable.includes(piece.color);
  };

  const legalDests = useMemo(() => {
    if (!selected) return [] as Square[];
    return legalMovesFrom(p.fen, selected).map((m) => m.to as Square);
  }, [selected, p.fen]);

  // Mode P : pièce sélectionnée ou survolée.
  const focus = selected ?? hover;
  const focusPiece = focus ? board[parseInt(focus[1], 10) - 1][focus.charCodeAt(0) - 97] : null;
  const focusSquares = useMemo(() => (focusPiece ? attackedSquaresOf(board, focusPiece) : null), [board, focusPiece]);

  // Mode X : prévisualisation après le coup envisagé.
  const preview = useMemo(() => {
    if (p.heatmapMode !== 'X' || !selected || !hover || !legalDests.includes(hover)) return null;
    const r = applyMove(p.fen, { from: selected, to: hover, promotion: needsPromotion(p.fen, selected, hover) ? 'q' : undefined }, 1);
    return r ? computeAttacks(r.fen, p.attackOptions) : null;
  }, [p.heatmapMode, selected, hover, legalDests, p.fen, p.attackOptions]);

  const squareFromEvent = useCallback(
    (e: { clientX: number; clientY: number }): Square | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const col = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      const file = p.flipped ? 7 - col : col;
      const rank = p.flipped ? row : 7 - row;
      return coordsToSquare(file, rank);
    },
    [p.flipped],
  );

  const tryMove = (from: Square, to: Square) => {
    if (!legalMovesFrom(p.fen, from).some((m) => m.to === to)) return false;
    if (needsPromotion(p.fen, from, to)) {
      setPromotion({ from, to });
      return true;
    }
    p.onMove?.({ from, to });
    return true;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const sq = squareFromEvent(e);
    if (!sq) return;
    p.onSquareClick?.(sq);
    if (selected && selected !== sq && tryMove(selected, sq)) {
      setSelected(null);
      return;
    }
    if (canMove(sq)) {
      setSelected(sq);
      const rect = svgRef.current!.getBoundingClientRect();
      setDrag({ from: sq, x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (selected === sq) {
      setSelected(null);
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const sq = squareFromEvent(e);
    setHover(sq);
    if (drag) {
      const rect = svgRef.current!.getBoundingClientRect();
      setDrag({ ...drag, x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const sq = squareFromEvent(e);
    const from = drag.from;
    setDrag(null);
    if (sq && sq !== from) {
      // Après un glisser-déposer, la pièce est déjà à destination : pas d'animation.
      skipAnimRef.current = true;
      if (tryMove(from, sq)) setSelected(null);
      else skipAnimRef.current = false;
    }
  };

  const squareFill = (sq: Square) => {
    const file = sq.charCodeAt(0) - 97;
    const rank = parseInt(sq[1], 10) - 1;
    return (file + rank) % 2 === 0 ? p.palette.dark : p.palette.light;
  };

  const promoPieces: ('q' | 'r' | 'b' | 'n')[] = ['q', 'r', 'b', 'n'];

  return (
    <div className="board-wrap">
      <svg
        ref={svgRef}
        className="board"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        data-testid="board"
        data-fen={p.fen}
        data-movable={p.movable.join("")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'none', userSelect: 'none' }}
      >
        {/* Cases */}
        {ALL_SQUARES.map((sq) => {
          const { x, y } = squareXY(sq, p.flipped, SQ);
          return <rect key={sq} data-square={sq} x={x} y={y} width={SQ} height={SQ} fill={squareFill(sq)} />;
        })}
        {/* Dernier coup */}
        {p.lastMove &&
          [p.lastMove.from, p.lastMove.to].map((sq) => {
            const { x, y } = squareXY(sq, p.flipped, SQ);
            return <rect key={`lm-${sq}`} x={x} y={y} width={SQ} height={SQ} fill="#f6f669" opacity={0.45} />;
          })}
        {/* Cases marquées */}
        {p.marked?.map((sq) => {
          const { x, y } = squareXY(sq, p.flipped, SQ);
          return <rect key={`mk-${sq}`} x={x + 3} y={y + 3} width={SQ - 6} height={SQ - 6} fill="none" stroke="#f5c542" strokeWidth={5} />;
        })}
        {/* Heatmap */}
        <ThreatOverlay
          summary={summary}
          preview={preview}
          mode={p.heatmapMode}
          palette={p.palette}
          intensity={p.intensity}
          showCounts={p.showCounts}
          showHanging={p.showHanging}
          showLoose={p.showLoose}
          hatching={p.hatching}
          flipped={p.flipped}
          squareSize={SQ}
          focusSquares={focusSquares}
          focusColor={focusPiece?.color ?? null}
        />
        {/* Sélection et échec */}
        {selected && (
          <rect {...squareXY(selected, p.flipped, SQ)} width={SQ} height={SQ} fill="none" stroke="#f5c542" strokeWidth={6} />
        )}
        {check && (
          <circle cx={squareXY(check, p.flipped, SQ).x + SQ / 2} cy={squareXY(check, p.flipped, SQ).y + SQ / 2} r={SQ * 0.45} fill="none" stroke="#ff2d2d" strokeWidth={6} />
        )}
        {/* Destinations légales */}
        {legalDests.map((sq) => {
          const { x, y } = squareXY(sq, p.flipped, SQ);
          const occupied = board[parseInt(sq[1], 10) - 1][sq.charCodeAt(0) - 97];
          return occupied ? (
            <circle key={`d-${sq}`} data-dest={sq} cx={x + SQ / 2} cy={y + SQ / 2} r={SQ * 0.46} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={8} style={{ pointerEvents: 'none' }} />
          ) : (
            <circle key={`d-${sq}`} data-dest={sq} cx={x + SQ / 2} cy={y + SQ / 2} r={SQ * 0.14} fill="rgba(0,0,0,0.35)" style={{ pointerEvents: 'none' }} />
          );
        })}
        {/* Coordonnées */}
        {Array.from({ length: 8 }, (_, i) => {
          const file = String.fromCharCode(97 + (p.flipped ? 7 - i : i));
          const rank = p.flipped ? i + 1 : 8 - i;
          return (
            <g key={i} fontSize={SQ * 0.18} fontWeight={600} style={{ pointerEvents: 'none' }}>
              <text x={i * SQ + SQ - 4} y={SIZE - 4} textAnchor="end" fill={i % 2 === 0 ? p.palette.dark : p.palette.light} opacity={0.9}>
                {file}
              </text>
              <text x={3} y={i * SQ + SQ * 0.22} fill={i % 2 === 0 ? p.palette.dark : p.palette.light} opacity={0.9}>
                {rank}
              </text>
            </g>
          );
        })}
        {/* Pièces */}
        {pieces.map((pc) => {
          const { x, y } = squareXY(pc.square, p.flipped, SQ);
          const isDragging = drag?.from === pc.square;
          return (
            <Piece
              key={idsRef.current.ids.get(pc.square) ?? pc.square}
              type={pc.type}
              color={pc.color}
              x={x}
              y={y}
              size={SQ}
              fillColor={p.palette[pc.color].piece}
              dragging={isDragging}
              animate={animate}
            />
          );
        })}
        {/* Pièce en cours de glissement */}
        {drag &&
          (() => {
            const pc = pieces.find((q) => q.square === drag.from);
            if (!pc) return null;
            return <Piece type={pc.type} color={pc.color} x={drag.x - SQ / 2} y={drag.y - SQ / 2} size={SQ} fillColor={p.palette[pc.color].piece} />;
          })()}
        {/* Flèches */}
        <defs>
          {(p.arrows ?? []).map((a, i) => (
            <marker key={i} id={`arrow-${i}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={a.color} />
            </marker>
          ))}
        </defs>
        {(p.arrows ?? []).map((a, i) => {
          const f = squareXY(a.from, p.flipped, SQ);
          const t = squareXY(a.to, p.flipped, SQ);
          const x1 = f.x + SQ / 2;
          const y1 = f.y + SQ / 2;
          const x2 = t.x + SQ / 2;
          const y2 = t.y + SQ / 2;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={`arrow-${i}`} style={{ pointerEvents: 'none' }} opacity={0.85}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={a.color} strokeWidth={SQ * 0.16} strokeLinecap="round" strokeDasharray={a.dashed ? '14 10' : undefined} markerEnd={`url(#arrow-${i})`} />
              {a.crossed && (
                <g stroke="#111" strokeWidth={SQ * 0.08} strokeLinecap="round">
                  <line x1={mx - SQ * 0.18} y1={my - SQ * 0.18} x2={mx + SQ * 0.18} y2={my + SQ * 0.18} />
                  <line x1={mx - SQ * 0.18} y1={my + SQ * 0.18} x2={mx + SQ * 0.18} y2={my - SQ * 0.18} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {promotion && (
        <div className="promotion-modal" role="dialog" aria-label="Choix de la promotion">
          <p>Promotion en :</p>
          <div className="promotion-choices">
            {promoPieces.map((t) => (
              <button
                key={t}
                type="button"
                data-promotion={t}
                className="promo-btn"
                onClick={() => {
                  p.onMove?.({ from: promotion.from, to: promotion.to, promotion: t });
                  setPromotion(null);
                  setSelected(null);
                }}
              >
                <svg viewBox="0 0 45 45" width="56" height="56" style={{ ['--piece-fill' as string]: p.palette[turn].piece }}>
                  <PieceSvg type={t} />
                </svg>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setPromotion(null)}>
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

import { PieceGlyph } from './pieces';
function PieceSvg({ type }: { type: PieceSymbol }) {
  return <PieceGlyph type={type} />;
}
