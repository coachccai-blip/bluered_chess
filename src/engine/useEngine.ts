import { useEffect, useState } from 'react';
import { getEngine, type EngineClient } from './engineClient';

let initPromise: Promise<EngineClient> | null = null;

export function engineReady(): Promise<EngineClient> {
  if (!initPromise) {
    const e = getEngine();
    initPromise = e.init().then(() => e);
  }
  return initPromise;
}

/** Hook : moteur prêt (ou erreur). */
export function useEngine(): { engine: EngineClient | null; error: string | null } {
  const [engine, setEngine] = useState<EngineClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    engineReady()
      .then((e) => alive && setEngine(e))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, []);
  return { engine, error };
}
