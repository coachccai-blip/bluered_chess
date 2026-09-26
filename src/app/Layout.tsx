import type { ReactNode } from 'react';
import { useOnline } from './installPrompt';

const NAV: { key: string; label: string; hash: string; icon: string }[] = [
  { key: 'home', label: 'Accueil', hash: '#/', icon: '⌂' },
  { key: 'play', label: 'Partie', hash: '#/partie', icon: '♞' },
  { key: 'history', label: 'Historique', hash: '#/historique', icon: '☰' },
  { key: 'training', label: 'Entraînement', hash: '#/entrainement', icon: '◎' },
  { key: 'settings', label: 'Réglages', hash: '#/reglages', icon: '⚙' },
];

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const online = useOnline();
  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-blue">Blue</span>
          <span className="brand-red">Red</span> Chess
        </a>
        <span className={`net ${online ? 'net-on' : 'net-off'}`} title={online ? 'En ligne' : 'Hors ligne : tout fonctionne, les mises à jour attendront'} data-testid="net-status">
          {online ? 'en ligne' : 'hors ligne'}
        </span>
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.key} href={n.hash} className={`nav-link ${route === n.key || (n.key === 'history' && route === 'debrief') ? 'active' : ''}`}>
              <span className="nav-icon" aria-hidden>
                {n.icon}
              </span>
              <span className="nav-label">{n.label}</span>
            </a>
          ))}
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
