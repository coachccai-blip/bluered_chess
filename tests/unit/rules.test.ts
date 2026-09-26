import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  applyMove,
  buildPgn,
  gameStatus,
  gameStatusWithHistory,
  legalMovesFrom,
  needsPromotion,
  parsePgn,
  mateInOne,
  allowsMateInOne,
  phaseOf,
  fenSequence,
} from '../../src/chess/game';

describe('règles FIDE via chess.js', () => {
  it('roque interdit quand le roi est en échec', () => {
    const fen = '4r1k1/8/8/8/8/8/8/4K2R w K - 0 1';
    const moves = legalMovesFrom(fen, 'e1').map((m) => m.san);
    expect(moves).not.toContain('O-O');
  });
  it('roque interdit à travers une case attaquée', () => {
    const fen = '5rk1/8/8/8/8/8/8/4K2R w K - 0 1';
    expect(legalMovesFrom(fen, 'e1').map((m) => m.san)).not.toContain('O-O');
  });
  it('roque autorisé sinon', () => {
    const fen = '6k1/8/8/8/8/8/8/4K2R w K - 0 1';
    expect(legalMovesFrom(fen, 'e1').map((m) => m.san)).toContain('O-O');
  });
  it('prise en passant', () => {
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2';
    const res = applyMove(fen, { from: 'e5', to: 'd6' }, 3);
    expect(res?.record.san).toBe('exd6');
    expect(res?.record.captured).toBe('p');
  });
  it('promotion avec échec', () => {
    const fen = '7k/P7/8/8/8/8/8/K7 w - - 0 1';
    expect(needsPromotion(fen, 'a7', 'a8')).toBe(true);
    const res = applyMove(fen, { from: 'a7', to: 'a8', promotion: 'q' }, 1);
    expect(res?.record.san).toBe('a8=Q+');
    expect(res?.record.check).toBe(true);
  });
  it('coup illégal refusé', () => {
    expect(applyMove(START_FEN, { from: 'e2', to: 'e5' }, 1)).toBeNull();
  });
  it('mat, pat, matériel insuffisant', () => {
    expect(gameStatus('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toEqual({
      over: true,
      result: '0-1',
      reason: 'checkmate',
    });
    expect(gameStatus('k7/8/1Q6/8/8/8/8/K7 b - - 0 1').over).toBe(true);
    expect(gameStatus('k7/8/1Q6/8/8/8/8/K7 b - - 0 1')).toMatchObject({ reason: 'stalemate' });
    expect(gameStatus('k7/8/8/8/8/8/8/K6N w - - 0 1')).toMatchObject({ reason: 'insufficient' });
  });
  it('répétition triple', () => {
    const sans = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];
    expect(gameStatusWithHistory(START_FEN, sans)).toMatchObject({ reason: 'repetition' });
  });
  it('mat en 1 détecté et coup qui permet le mat', () => {
    expect(mateInOne('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')).toBe('Ra8#');
    expect(allowsMateInOne('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8')).toBe(false);
    expect(allowsMateInOne('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', 'a8a7')).toBe(false);
    expect(allowsMateInOne('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', 'a8b8')).toBe(false);
    expect(allowsMateInOne('6k1/5ppp/8/8/8/8/r4PPP/6K1 w - - 0 1', 'g1h1')).toBe(true);
    expect(allowsMateInOne('6k1/5ppp/8/8/8/8/r4PPP/6K1 w - - 0 1', 'h2h3')).toBe(false);
  });
  it('phases de jeu', () => {
    expect(phaseOf(START_FEN, 1)).toBe('opening');
    expect(phaseOf(START_FEN, 30)).toBe('middlegame');
    expect(phaseOf('8/5k2/8/8/8/8/5K2/8 w - - 0 1', 60)).toBe('endgame');
  });
});

describe('PGN', () => {
  const scholar = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];
  it('exporte et réimporte une partie complète', () => {
    const pgn = buildPgn(START_FEN, scholar, { White: 'Bleu', Black: 'Rouge', Result: '1-0' }, { 7: 'Mat du berger' });
    expect(pgn).toContain('Qxf7#');
    expect(pgn).toContain('{Mat du berger}');
    const parsed = parsePgn(pgn);
    expect(parsed.sans).toEqual(scholar);
    expect(parsed.headers.White).toBe('Bleu');
  });
  it('rejoue une partie longue sans erreur', () => {
    const pgn =
      '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0';
    const { sans } = parsePgn(pgn);
    expect(sans.length).toBe(33);
    expect(gameStatus(fenSequence(START_FEN, sans).at(-1)!)).toMatchObject({ reason: 'checkmate', result: '1-0' });
  });
});
