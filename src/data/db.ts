// IndexedDB via Dexie : seule mémoire de l'application.
import Dexie, { type Table } from 'dexie';
import type { Analysis, Game, Profile, Settings, TrainingPlan } from './models';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from './models';

export class BlueRedDB extends Dexie {
  games!: Table<Game, string>;
  analyses!: Table<Analysis, string>;
  profile!: Table<Profile, string>;
  plans!: Table<TrainingPlan, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'bluered-chess') {
    super(name);
    this.version(1).stores({
      games: 'id, createdAt, botElo, result, playerColor',
      analyses: 'id, gameId, createdAt',
      profile: 'id',
      plans: 'id, generatedAt',
      settings: 'id',
    });
  }
}

export const db = new BlueRedDB();

export async function loadSettings(database: BlueRedDB = db): Promise<Settings> {
  const s = await database.settings.get('settings');
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  // Migration v2 : le coach lit aussi son avis et l'explication du coup « Mieux » pendant la partie.
  const version = s?.settingsVersion ?? 1;
  if (version < 2) merged.liveComments = 'full';
  // Migration v3 : barre d'évaluation verticale affichée par défaut (masquable d'un clic).
  if (version < 3) merged.showEvalBar = true;
  if (version < 3) {
    merged.settingsVersion = 3;
    await database.settings.put(merged);
  }
  return merged;
}

export async function saveSettings(s: Settings, database: BlueRedDB = db): Promise<void> {
  await database.settings.put(s);
}

export async function loadProfile(database: BlueRedDB = db): Promise<Profile> {
  const p = await database.profile.get('me');
  return { ...DEFAULT_PROFILE, ...(p ?? {}) };
}

export async function saveProfile(p: Profile, database: BlueRedDB = db): Promise<void> {
  await database.profile.put(p);
}

/** Demande au navigateur de ne jamais purger les données. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}
