import { useEffect } from 'react';
import { useRoute } from './router';
import { useSettings } from '../store/settingsStore';
import { Layout } from './Layout';
import { UpdateBanner } from './UpdateBanner';
import { Dashboard } from '../screens/Dashboard';
import { Play } from '../screens/Play';
import { Debrief } from '../screens/Debrief';
import { History } from '../screens/History';
import { Training } from '../screens/Training';
import { SettingsScreen } from '../screens/Settings';
import { About } from '../screens/About';
import { requestPersistentStorage } from '../data/db';
import { warmupSpeech } from '../ui/speech';

export function App() {
  const route = useRoute();
  const load = useSettings((s) => s.load);
  const loaded = useSettings((s) => s.loaded);
  useEffect(() => {
    void load();
    void requestPersistentStorage();
  }, [load]);
  // Voix HD : chargement anticipé, après le moteur d'échecs, pour éviter l'attente au premier commentaire.
  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(warmupSpeech, 2500);
    return () => window.clearTimeout(t);
  }, [loaded]);
  if (!loaded) return <div className="loading">Chargement…</div>;
  let screen: JSX.Element;
  switch (route.name) {
    case 'play':
      screen = <Play />;
      break;
    case 'debrief':
      screen = <Debrief id={route.id} />;
      break;
    case 'history':
      screen = <History />;
      break;
    case 'training':
      screen = <Training />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    case 'about':
      screen = <About />;
      break;
    default:
      screen = <Dashboard />;
  }
  return (
    <Layout route={route.name}>
      {screen}
      <UpdateBanner />
    </Layout>
  );
}
