// Client de la voix HD : pilote le Worker Piper, gère le téléchargement, le cache OPFS et la lecture audio.
export interface Progress {
  loaded: number;
  total: number;
  url: string;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: Progress) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function wasmPaths() {
  const base = `${location.origin}${import.meta.env.BASE_URL}tts/`;
  return { onnxWasm: `${base}ort/`, piperData: `${base}piper/piper_phonemize.data`, piperWasm: `${base}piper/piper_phonemize.wasm` };
}

export function hdVoiceSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory && typeof WebAssembly !== 'undefined';
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./hdVoice.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { id: number; type: string; result?: unknown; message?: string; loaded?: number; total?: number; url?: string };
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') {
        p.onProgress?.({ loaded: msg.loaded ?? 0, total: msg.total ?? 0, url: msg.url ?? '' });
        return;
      }
      pending.delete(msg.id);
      if (msg.type === 'ok') p.resolve(msg.result);
      else p.reject(new Error(msg.message ?? 'Erreur de synthèse vocale'));
    };
    worker.onerror = (e) => {
      for (const [id, p] of pending) {
        p.reject(new Error(e.message || 'Le Worker de synthèse a échoué'));
        pending.delete(id);
      }
    };
  }
  return worker;
}

function call<T>(msg: Record<string, unknown>, onProgress?: (p: Progress) => void): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    getWorker().postMessage({ id, ...msg });
  });
}

export const hdVoice = {
  stored: () => call<string[]>({ type: 'stored' }),
  download: (voiceId: string, onProgress?: (p: Progress) => void) => call<void>({ type: 'download', voiceId }, onProgress),
  remove: (voiceId: string) => call<void>({ type: 'remove', voiceId }),
  warmup: (voiceId: string, onProgress?: (p: Progress) => void) => call<void>({ type: 'warmup', voiceId, wasmPaths: wasmPaths() }, onProgress),
  synthesize: (voiceId: string, text: string, onProgress?: (p: Progress) => void) => call<Blob>({ type: 'predict', voiceId, text, wasmPaths: wasmPaths() }, onProgress),
};

// Petit cache mémoire des phrases déjà synthétisées (relecture instantanée).
const audioCache = new Map<string, Blob>();
export function cachedAudio(key: string): Blob | undefined {
  return audioCache.get(key);
}
export function rememberAudio(key: string, blob: Blob): void {
  audioCache.set(key, blob);
  if (audioCache.size > 40) audioCache.delete(audioCache.keys().next().value as string);
}
