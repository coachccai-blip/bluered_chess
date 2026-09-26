// Routeur à hash minimal (#/partie, #/debrief/:id ...) : pas de 404 sur GitHub Pages.
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'play' }
  | { name: 'debrief'; id: string }
  | { name: 'history' }
  | { name: 'training' }
  | { name: 'settings' }
  | { name: 'about' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [seg, id] = path.split('/');
  switch (seg) {
    case 'partie':
    case 'play':
      return { name: 'play' };
    case 'debrief':
      return id ? { name: 'debrief', id } : { name: 'history' };
    case 'historique':
      return { name: 'history' };
    case 'entrainement':
      return { name: 'training' };
    case 'reglages':
      return { name: 'settings' };
    case 'a-propos':
      return { name: 'about' };
    default:
      return { name: 'home' };
  }
}

export function navigate(to: string) {
  window.location.hash = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
