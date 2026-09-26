// Export / import JSON et PGN (section 10). Fusion par identifiant, doublons ignorés.
import type { BlueRedDB } from './db';
import type { Analysis, Game, Profile, Settings, TrainingPlan } from './models';

export interface BackupFile {
  app: 'bluered-chess';
  version: 1;
  exportedAt: number;
  games: Game[];
  analyses: Analysis[];
  profile: Profile | null;
  plans: TrainingPlan[];
  settings: Omit<Settings, 'apiKey'> | null;
}

export async function exportBackup(db: BlueRedDB): Promise<BackupFile> {
  const [games, analyses, profile, plans, settings] = await Promise.all([
    db.games.toArray(),
    db.analyses.toArray(),
    db.profile.get('me'),
    db.plans.toArray(),
    db.settings.get('settings'),
  ]);
  let safeSettings: BackupFile['settings'] = null;
  if (settings) {
    const { apiKey: _omit, ...rest } = settings;
    void _omit;
    safeSettings = rest;
  }
  return { app: 'bluered-chess', version: 1, exportedAt: Date.now(), games, analyses, profile: profile ?? null, plans, settings: safeSettings };
}

export interface ImportReport {
  gamesAdded: number;
  analysesAdded: number;
  plansAdded: number;
  profileMerged: boolean;
  skipped: number;
}

export function validateBackup(data: unknown): data is BackupFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<BackupFile>;
  return d.app === 'bluered-chess' && Array.isArray(d.games) && Array.isArray(d.analyses);
}

/** Import avec fusion : rien n'est écrasé, les identifiants déjà présents sont ignorés. */
export async function importBackup(db: BlueRedDB, data: BackupFile): Promise<ImportReport> {
  const report: ImportReport = { gamesAdded: 0, analysesAdded: 0, plansAdded: 0, profileMerged: false, skipped: 0 };
  await db.transaction('rw', db.games, db.analyses, db.profile, db.plans, async () => {
    const existingGames = new Set((await db.games.toCollection().primaryKeys()) as string[]);
    const existingAnalyses = new Set((await db.analyses.toCollection().primaryKeys()) as string[]);
    const existingPlans = new Set((await db.plans.toCollection().primaryKeys()) as string[]);
    for (const g of data.games) {
      if (existingGames.has(g.id)) {
        report.skipped++;
        continue;
      }
      await db.games.add(g);
      report.gamesAdded++;
    }
    for (const a of data.analyses) {
      if (existingAnalyses.has(a.id)) {
        report.skipped++;
        continue;
      }
      await db.analyses.add(a);
      report.analysesAdded++;
    }
    for (const p of data.plans ?? []) {
      if (existingPlans.has(p.id)) {
        report.skipped++;
        continue;
      }
      await db.plans.add(p);
      report.plansAdded++;
    }
    if (data.profile) {
      const current = await db.profile.get('me');
      if (!current) {
        await db.profile.put(data.profile);
        report.profileMerged = true;
      } else {
        // Fusion : on garde le plus récent, on concatène l'historique Elo (dédoublonné par date).
        const newer = data.profile.updatedAt > current.updatedAt ? data.profile : current;
        const byDate = new Map<number, number>();
        for (const p of [...current.eloHistory, ...data.profile.eloHistory]) byDate.set(p.date, p.elo);
        const eloHistory = [...byDate.entries()].map(([date, elo]) => ({ date, elo })).sort((a, b) => a.date - b.date);
        await db.profile.put({ ...newer, eloHistory, gamesAnalyzed: Math.max(current.gamesAnalyzed, data.profile.gamesAnalyzed) });
        report.profileMerged = true;
      }
    }
  });
  return report;
}

export function serializeBackup(b: BackupFile): string {
  return JSON.stringify(b);
}

export function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text) as unknown;
  if (!validateBackup(data)) throw new Error('Fichier de sauvegarde invalide');
  return data;
}

/** Export PGN de toutes les parties. */
export function allGamesPgn(games: Game[]): string {
  return games
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((g) => g.pgn.trim())
    .join('\n\n');
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `bluered-chess-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/** Téléchargement ou partage système du fichier. */
export async function downloadOrShare(filename: string, content: string, mime = 'application/json'): Promise<void> {
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] }) && /Mobi|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: 'Sauvegarde BlueRed Chess' });
      return;
    } catch {
      /* repli sur téléchargement */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
