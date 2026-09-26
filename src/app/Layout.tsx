import type { ReactNode } from 'react';
import { useOnline } from './installPrompt';
import { useSettings } from '../store/settingsStore';
import { IconHome, IconKnight, IconList, IconMoon, IconSettings, IconSun, IconTarget } from '../ui/icons';

const NAV = [
  { key: 'home', label: 'Accueil', hash: '#/', Icon: IconHome },
  { key: 'play', label: 'Partie', hash: '#/partie', Icon: IconKnight },
  { key: 'history', label: 'Historique', hash: '#/historique', Icon: IconList },
  { key: 'training', label: 'Entraînement', hash: '#/entrainement', Icon: IconTarget },
  { key: 'settings', label: 'Réglages', hash: '#/reglages', Icon: IconSettings },
];

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const online = useOnline();
  const { settings, update, resolvedTheme } = useSettings();
  const toggleTheme = () => void update({ themeMode: resolvedTheme === 'dark' ? 'light' : 'dark' });
  void settings;
  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={30} height={30} />
          <span>
            <span className="brand-blue">Blue</span>
            <span className="brand-red">Red</span> Chess
          </span>
        </a>
        <nav className="nav" aria-label="Navigation principale">
          {NAV.map(({ key, label, hash, Icon }) => (
            <a key={key} href={hash} className={`nav-link ${route === key || (key === 'history' && route === 'debrief') ? 'active' : ''}`} aria-current={route === key ? 'page' : undefined}>
              <Icon className="nav-icon" />
              <span className="nav-label">{label}</span>
            </a>
          ))}
        </nav>
        <span className={`net ${online ? 'net-on' : 'net-off'}`} title={online ? 'En ligne' : 'Hors ligne : tout fonctionne, les mises à jour attendront'} data-testid="net-status">
          {online ? 'en ligne' : 'hors ligne'}
        </span>
        <button type="button" className="theme-btn" onClick={toggleTheme} title={resolvedTheme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'} aria-label="Changer de thème" data-testid="theme-toggle">
          {resolvedTheme === 'dark' ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
        </button>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
