import { create } from 'zustand';
import { db, loadSettings, saveSettings } from '../data/db';
import { DEFAULT_SETTINGS, type Settings } from '../data/models';
import { PALETTES, type Palette } from '../board/theme';
import { setSpeechPrefs } from '../ui/speech';

type Resolved = 'dark' | 'light';

function resolveTheme(mode: Settings['themeMode']): Resolved {
  if (mode === 'dark' || mode === 'light') return mode;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function applyTheme(mode: Settings['themeMode']): Resolved {
  const r = resolveTheme(mode);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = r;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', r === 'dark' ? '#161B24' : '#FFFFFF');
  }
  return r;
}

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  palette: Palette;
  resolvedTheme: Resolved;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  palette: PALETTES.bluered,
  resolvedTheme: 'dark',
  load: async () => {
    const s = await loadSettings(db);
    setSpeechPrefs({ hdVoiceId: s.hdVoiceId, voiceName: s.voiceName, rate: s.voiceRate });
    set({ settings: s, loaded: true, palette: PALETTES[s.theme] ?? PALETTES.bluered, resolvedTheme: applyTheme(s.themeMode) });
  },
  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    setSpeechPrefs({ hdVoiceId: next.hdVoiceId, voiceName: next.voiceName, rate: next.voiceRate });
    set({ settings: next, palette: PALETTES[next.theme] ?? PALETTES.bluered, resolvedTheme: applyTheme(next.themeMode) });
    await saveSettings(next, db);
  },
}));

// Suit le thème du système quand le mode est « système ».
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    const st = useSettings.getState();
    if (st.settings.themeMode === 'system') useSettings.setState({ resolvedTheme: applyTheme('system') });
  });
}
