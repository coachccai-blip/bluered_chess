import { describe, expect, it } from 'vitest';
import { BlueRedDB, loadSettings } from '../../src/data/db';
import { exportBackup, importBackup, parseBackup, serializeBackup, allGamesPgn } from '../../src/data/backup';
import type { Game } from '../../src/data/models';

function mkGame(id: string, createdAt = 1): Game {
  return { id, createdAt, playerColor: 'blue', botElo: 900, result: '1-0', pgn: `[Event "t${id}"]\n\n1. e4 *`, startFen: '', sans: ['e4'], durationSec: 10 };
}

describe('sauvegarde et restauration', () => {
  it('exporte sans la clé API puis importe en fusionnant sans écraser', async () => {
    const a = new BlueRedDB('test-a');
    const b = new BlueRedDB('test-b');
    await a.games.bulkAdd([mkGame('1'), mkGame('2', 2)]);
    await a.settings.put({ id: 'settings', theme: 'bluered', apiKey: 'secret' } as never);
    await a.profile.put({ id: 'me', estimatedElo: 1100, eloHistory: [{ date: 1, elo: 1100 }], indicators: {}, gamesAnalyzed: 2, updatedAt: 10, streak: { wins: 0, losses: 0 }, recommendedBotElo: 1100, onboardingDone: true });
    const backup = await exportBackup(a);
    expect(backup.games).toHaveLength(2);
    expect((backup.settings as Record<string, unknown>).apiKey).toBeUndefined();
    const text = serializeBackup(backup);
    const parsed = parseBackup(text);

    await b.games.add({ ...mkGame('2', 2), botElo: 1500 });
    await b.profile.put({ id: 'me', estimatedElo: 1050, eloHistory: [{ date: 2, elo: 1050 }], indicators: {}, gamesAnalyzed: 1, updatedAt: 5, streak: { wins: 0, losses: 0 }, recommendedBotElo: 1050, onboardingDone: true });
    const report = await importBackup(b, parsed);
    expect(report.gamesAdded).toBe(1);
    expect(report.skipped).toBe(1);
    expect((await b.games.get('2'))?.botElo).toBe(1500); // non écrasé
    const prof = await b.profile.get('me');
    expect(prof?.estimatedElo).toBe(1100); // profil le plus récent
    expect(prof?.eloHistory).toHaveLength(2);
    expect(allGamesPgn(await b.games.toArray())).toContain('[Event "t1"]');
    expect(() => parseBackup('{"app":"autre"}')).toThrow();
  });
});

describe('migration des réglages', () => {
  it('passe les anciens réglages en commentaires « avec avis »', async () => {
    const d = new BlueRedDB('test-settings');
    await d.settings.put({ id: 'settings', theme: 'bluered', liveComments: 'descriptive' } as never);
    const s = await loadSettings(d);
    expect(s.liveComments).toBe('full');
    expect(s.settingsVersion).toBe(3);
    expect(s.showEvalBar).toBe(true);
    await d.settings.put({ ...s, liveComments: 'descriptive' });
    expect((await loadSettings(d)).liveComments).toBe('descriptive'); // choix explicite conservé ensuite
  });
});
