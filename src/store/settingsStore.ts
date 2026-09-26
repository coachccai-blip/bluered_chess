import { create } from 'zustand';
import { db, loadSettings, saveSettings } from '../data/db';
import { DEFAULT_SETTINGS, type Settings } from '../data/models';
import { PALETTES, type Palette } from '../board/theme';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  palette: Palette;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  palette: PALETTES.bluered,
  load: async () => {
    const s = await loadSettings(db);
    set({ settings: s, loaded: true, palette: PALETTES[s.theme] ?? PALETTES.bluered });
  },
  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next, palette: PALETTES[next.theme] ?? PALETTES.bluered });
    await saveSettings(next, db);
  },
}));
