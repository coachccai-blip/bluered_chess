import { describe, expect, it } from 'vitest';
import { loadPersistedGame, persistGame, useGame } from '../../src/store/gameStore';
import { parseHash } from '../../src/app/router';
import { nextPieceIds } from '../../src/board/Board';
import { fenSequence, START_FEN } from '../../src/chess/game';

describe('routeur à hash', () => {
  it('reconnaît les routes françaises et le débrief avec identifiant', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/partie')).toEqual({ name: 'play' });
    expect(parseHash('#/debrief/abc')).toEqual({ name: 'debrief', id: 'abc' });
    expect(parseHash('#/debrief')).toEqual({ name: 'history' });
    expect(parseHash('#/entrainement?x=1')).toEqual({ name: 'training' });
    expect(parseHash('#/inconnu')).toEqual({ name: 'home' });
  });
});

describe('store de partie', () => {
  it('joue, annule, abandonne et persiste', () => {
    const g = useGame.getState();
    g.newGame({ mode: 'bot', playerColor: 'b', botElo: 900 });
    expect(useGame.getState().flipped).toBe(true);
    expect(useGame.getState().playMove('e4')?.san).toBe('e4');
    expect(useGame.getState().playMove('e9')).toBeNull();
    useGame.getState().playMove('e5');
    expect(useGame.getState().records).toHaveLength(2);
    useGame.getState().undo(2);
    expect(useGame.getState().fen).toBe(START_FEN);
    useGame.getState().playMove('e4');
    useGame.getState().resign();
    expect(useGame.getState().status).toMatchObject({ over: true, result: '1-0', reason: 'resign' });
    expect(useGame.getState().playMove('e5')).toBeNull();

    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    persistGame(useGame.getState(), storage);
    const restored = loadPersistedGame(storage);
    expect(restored.records).toHaveLength(1);
    expect(restored.botElo).toBe(900);
    expect(loadPersistedGame({ getItem: () => 'pas du json' })).toEqual({});
    expect(loadPersistedGame(null)).toEqual({});
  });
});

describe('identités des pièces (animation)', () => {
  it('conserve l\'identifiant de la pièce déplacée et de la tour du roque', () => {
    const counter = { value: 1 };
    const fens = fenSequence(START_FEN, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
    let ids = nextPieceIds(new Map(), null, fens[0], null, counter);
    expect(ids.size).toBe(32);
    const pawnE2 = ids.get('e2');
    ids = nextPieceIds(ids, fens[0], fens[1], { from: 'e2', to: 'e4' }, counter);
    expect(ids.get('e4')).toBe(pawnE2);
    expect(ids.has('e2')).toBe(false);
    const moves = [['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['f8', 'c5']] as const;
    moves.forEach(([from, to], i) => {
      ids = nextPieceIds(ids, fens[i + 1], fens[i + 2], { from, to }, counter);
    });
    const king = ids.get('e1');
    const rook = ids.get('h1');
    ids = nextPieceIds(ids, fens[6], fens[7], { from: 'e1', to: 'g1' }, counter);
    expect(ids.get('g1')).toBe(king);
    expect(ids.get('f1')).toBe(rook);
    expect(ids.size).toBe(32);
    // Nouvelle partie sans dernier coup : identifiants neufs mais toujours 32.
    const fresh = nextPieceIds(ids, fens[7], START_FEN, null, counter);
    expect(fresh.size).toBe(32);
  });
});
