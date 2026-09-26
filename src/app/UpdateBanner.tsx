import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Vérifie une mise à jour toutes les heures quand l'app reste ouverte.
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
    },
  });
  // Le message « prêt hors ligne » disparaît seul après 5 s pour ne jamais gêner le jeu.
  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 5000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="update-banner" role="status">
      {needRefresh ? (
        <>
          <span>Nouvelle version disponible.</span>
          <button type="button" className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
            Recharger
          </button>
        </>
      ) : (
        <span>Application prête à fonctionner hors ligne.</span>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        Fermer
      </button>
    </div>
  );
}
