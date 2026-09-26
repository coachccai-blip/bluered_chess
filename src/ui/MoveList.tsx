import { CATEGORY_COLOR, type MoveCategory } from '../analysis/classify';

export interface MoveListItem {
  ply: number;
  san: string;
  category?: MoveCategory;
}

export function MoveList({ moves, current, onSelect }: { moves: MoveListItem[]; current: number; onSelect?: (ply: number) => void }) {
  const rows: MoveListItem[][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(moves.slice(i, i + 2));
  return (
    <div className="move-list" data-testid="move-list">
      {moves.length === 0 && <p className="muted small">Aucun coup joué.</p>}
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="num">{i + 1}.</td>
              {r.map((m) => (
                <td key={m.ply}>
                  <span className={`mv ${current === m.ply ? 'current' : ''}`} onClick={() => onSelect?.(m.ply)}>
                    {m.category && <span className="badge" style={{ background: CATEGORY_COLOR[m.category] }} />}
                    {m.san}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
