import { useEffect, useState } from 'react';
import { getEngine, resetEngine, type EngineClient } from './engineClient';

let initPromise: Promise<EngineClient> | null = null;

export function engineReady(): Promise<EngineClient> {
  if (!initPromise) {
    const e = getEngine();
    initPromise = e.init().then(() => e);
  }
  return initPromise;
}

/** Repart de zéro (nouveau Worker) après un échec de chargement. */
export function retryEngine(): Promise<EngineClient> {
  resetEngine();
  initPromise = null;
  return engineReady();
}

/** Hook : moteur prêt (ou erreur), avec fonction de nouvelle tentative. */
export function useEngine(): { engine: EngineClient | null; error: string | null; retry: () => void } {
  const [engine, setEngine] = useState<EngineClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    (attempt === 0 ? engineReady() : retryEngine())
      .then((e) => alive && setEngine(e))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { engine, error, retry: () => setAttempt((a) => a + 1) };
}
