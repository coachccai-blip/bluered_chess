import type { ReactNode } from 'react';

const NAV: { key: string; label: string; hash: string; icon: string }[] = [
  { key: 'home', label: 'Accueil', hash: '#/', icon: '⌂' },
  { key: 'play', label: 'Partie', hash: '#/partie', icon: '♞' },
  { key: 'history', label: 'Historique', hash: '#/historique', icon: '☰' },
  { key: 'training', label: 'Entraînement', hash: '#/entrainement', icon: '◎' },
  { key: 'settings', label: 'Réglages', hash: '#/reglages', icon: '⚙' },
];

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-blue">Blue</span>
          <span className="brand-red">Red</span> Chess
        </a>
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
