import { useEffect, useState } from 'react';
import { db } from '../data/db';
import type { Game, Profile } from '../data/models';
import { deleteGame, importPgnGame } from '../data/gameService';
import { parsePgn } from '../chess/game';
import { resultScore } from '../progress/profile';
import { loadProfile } from '../data/db';
import { EloCurve } from '../ui/EloCurve';
import { Modal } from '../ui/Modal';
import { openingForGame, openingLabel } from '../chess/openings';
import { TIME_CONTROLS } from '../data/models';

export function History() {
  const [games, setGames] = useState<Game[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [filter, setFilter] = useState<{ result: 'all' | 'win' | 'loss' | 'draw'; color: 'all' | 'blue' | 'red'; bot: number | 'all' }>({ result: 'all', color: 'all', bot: 'all' });
  const [importOpen, setImportOpen] = useState(false);
  const [pgnText, setPgnText] = useState('');
  const [importColor, setImportColor] = useState<'blue' | 'red'>('blue');
  const [importError, setImportError] = useState<string | null>(null);

  const reload = async () => {
    setGames(await db.games.orderBy('createdAt').reverse().toArray());
    setProfile(await loadProfile(db));
  };
  useEffect(() => {
    void reload();
  }, []);

  const shown = games.filter((g) => {
    const s = resultScore(g);
    if (filter.result === 'win' && s !== 1) return false;
    if (filter.result === 'loss' && s !== 0) return false;
    if (filter.result === 'draw' && s !== 0.5) return false;
    if (filter.color !== 'all' && g.playerColor !== filter.color) return false;
    if (filter.bot !== 'all' && g.botElo !== filter.bot) return false;
    return true;
  });
  const bots = [...new Set(games.map((g) => g.botElo).filter((e) => e > 0))].sort((a, b) => a - b);

  const doImport = async () => {
    setImportError(null);
    try {
      const chunks = pgnText.split(/\n\s*\n(?=\[)/).filter((c) => c.trim());
      let n = 0;
      for (const chunk of chunks.length ? chunks : [pgnText]) {
        const p = parsePgn(chunk);
        if (p.sans.length === 0) continue;
        await importPgnGame(chunk.trim(), p.sans, p.startFen, p.result, importColor);
        n++;
      }
      if (n === 0) throw new Error('Aucune partie trouvée dans ce PGN.');
      setImportOpen(false);
      setPgnText('');
      await reload();
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setPgnText(await f.text());
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Historique</h1>
          <p className="muted small">{games.length} partie{games.length > 1 ? 's' : ''} enregistrée{games.length > 1 ? 's' : ''}</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setImportOpen(true)}>
          Importer un PGN
        </button>
      </div>
      {profile && profile.eloHistory.length > 1 && (
        <div className="card">
          <h3>Elo maison : {profile.estimatedElo}</h3>
          <EloCurve points={profile.eloHistory} />
        </div>
      )}
      <div className="row">
        <select value={filter.result} onChange={(e) => setFilter({ ...filter, result: e.target.value as typeof filter.result })} aria-label="Résultat">
          <option value="all">Tous résultats</option>
          <option value="win">Victoires</option>
          <option value="loss">Défaites</option>
          <option value="draw">Nulles</option>
        </select>
        <select value={filter.color} onChange={(e) => setFilter({ ...filter, color: e.target.value as typeof filter.color })} aria-label="Camp">
          <option value="all">Tous camps</option>
          <option value="blue">Bleu</option>
          <option value="red">Rouge</option>
        </select>
        <select value={String(filter.bot)} onChange={(e) => setFilter({ ...filter, bot: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10) })} aria-label="Bot">
          <option value="all">Tous bots</option>
          {bots.map((b) => (
            <option key={b} value={b}>
              Bot {b}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 && (
        <div className="card empty">
          <p>Aucune partie ici pour l'instant.</p>
          <a className="btn btn-primary" href="#/partie">Jouer une partie</a>
        </div>
      )}
      <div className="stack" style={{ gap: '.5rem' }} data-testid="game-list">
        {shown.map((g) => {
          const s = resultScore(g);
          return (
            <div key={g.id} className="game-row">
              <span className={`result ${s === 1 ? 'result-win' : s === 0 ? 'result-loss' : 'result-draw'}`}>{s === 1 ? 'V' : s === 0 ? 'D' : 'N'}</span>
              <div>
                <div>
                  <strong>{g.playerColor === 'blue' ? 'Bleu' : 'Rouge'}</strong> {g.botElo ? `contre Bot ${g.botElo}` : g.imported ? '(importée)' : '(deux joueurs)'} · {g.sans.length} demi-coups · {g.result}{g.timeControl && g.timeControl !== 'unlimited' ? <span className="tag" style={{ marginLeft: '.4rem' }}>{TIME_CONTROLS[g.timeControl].short}</span> : null}
                </div>
                <div className="muted small">
                  {(() => {
                    const o = openingForGame(g.sans, g.startFen);
                    return o ? <span>{openingLabel(o)} · </span> : null;
                  })()}
                  {new Date(g.createdAt).toLocaleString('fr-FR')} {g.eloAfter !== undefined && g.eloBefore !== undefined ? `· Elo ${g.eloBefore} → ${g.eloAfter}` : ''} {g.analysisId ? '· analysée' : ''}
                </div>
              </div>
              <div className="btn-row">
                <a className="btn btn-sm btn-primary" href={`#/debrief/${g.id}`}>
                  {g.analysisId ? 'Débrief' : 'Analyser'}
                </a>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={async () => {
                    if (confirm('Supprimer cette partie et son analyse ?')) {
                      await deleteGame(g.id);
                      await reload();
                    }
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {importOpen && (
        <Modal title="Importer un PGN" onClose={() => setImportOpen(false)}>
          <p className="muted small">Colle un PGN (Lichess, chess.com…) ou choisis un fichier. Plusieurs parties séparées par une ligne vide sont acceptées.</p>
          <input type="file" accept=".pgn,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} />
          <textarea value={pgnText} onChange={(e) => setPgnText(e.target.value)} placeholder="[Event ...]" />
          <div className="row" style={{ margin: '.5rem 0' }}>
            <span className="muted small">Mon camp :</span>
            <button type="button" className={`btn btn-sm ${importColor === 'blue' ? 'btn-primary' : ''}`} onClick={() => setImportColor('blue')}>
              Bleu (Blancs)
            </button>
            <button type="button" className={`btn btn-sm ${importColor === 'red' ? 'btn-primary' : ''}`} onClick={() => setImportColor('red')}>
              Rouge (Noirs)
            </button>
          </div>
          {importError && <p style={{ color: 'var(--red-2)' }}>{importError}</p>}
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void doImport()}>
              Importer
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(false)}>
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
