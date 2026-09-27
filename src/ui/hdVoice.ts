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

// File de synthèse à priorité : une lecture demandée par l'utilisateur passe devant les pré-générations.
type Job = { run: () => Promise<void>; priority: number; cancelled?: boolean };
const queue: Job[] = [];
let running = false;

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      queue.sort((a, b) => b.priority - a.priority);
      const job = queue.shift()!;
      if (job.cancelled) continue;
      await job.run();
    }
  } finally {
    running = false;
  }
}

function enqueue<T>(priority: number, fn: () => Promise<T>): Promise<T> & { cancel: () => void } {
  let job: Job;
  const p = new Promise<T>((resolve, reject) => {
    job = { priority, run: () => fn().then(resolve, reject) };
    queue.push(job);
    void pump();
  }) as Promise<T> & { cancel: () => void };
  p.cancel = () => {
    job.cancelled = true;
  };
  return p;
}

/** Annule les synthèses de basse priorité en attente (pré-générations). */
export function cancelPrefetch(): void {
  for (const j of queue) if (j.priority <= 0) j.cancelled = true;
}

export const hdVoice = {
  stored: () => call<string[]>({ type: 'stored' }),
  download: (voiceId: string, onProgress?: (p: Progress) => void) => call<void>({ type: 'download', voiceId }, onProgress),
  remove: (voiceId: string) => call<void>({ type: 'remove', voiceId }),
  warmup: (voiceId: string, onProgress?: (p: Progress) => void) => enqueue(5, () => call<void>({ type: 'warmup', voiceId, wasmPaths: wasmPaths() }, onProgress)),
  /** Synthèse ; priorité 10 = lecture immédiate, 0 = pré-génération. */
  synthesize: (voiceId: string, text: string, priority = 10) => enqueue(priority, () => call<Blob>({ type: 'predict', voiceId, text, wasmPaths: wasmPaths() })),
  pendingCount: () => queue.filter((j) => !j.cancelled).length,
};

// Cache mémoire (accès immédiat) doublé d'un cache persistant dans IndexedDB (relecture instantanée d'une partie déjà vue).
const audioCache = new Map<string, Blob>();
const MEMORY_MAX = 200;
const PERSISTENT_MAX = 600;

export function cachedAudio(key: string): Blob | undefined {
  return audioCache.get(key);
}

export async function cachedAudioAsync(key: string): Promise<Blob | undefined> {
  const mem = audioCache.get(key);
  if (mem) return mem;
  try {
    const { db } = await import('../data/db');
    const entry = await db.audio.get(key);
    if (entry) {
      audioCache.set(key, entry.blob);
      return entry.blob;
    }
  } catch {
    /* IndexedDB indisponible */
  }
  return undefined;
}

export function rememberAudio(key: string, blob: Blob): void {
  audioCache.set(key, blob);
  if (audioCache.size > MEMORY_MAX) audioCache.delete(audioCache.keys().next().value as string);
  void (async () => {
    try {
      const { db } = await import('../data/db');
      await db.audio.put({ key, blob, createdAt: Date.now(), size: blob.size });
      const count = await db.audio.count();
      if (count > PERSISTENT_MAX) {
        const oldest = await db.audio.orderBy('createdAt').limit(count - PERSISTENT_MAX + 50).primaryKeys();
        await db.audio.bulkDelete(oldest as string[]);
      }
    } catch {
      /* quota ou stockage indisponible */
    }
  })();
}

export async function clearAudioCache(): Promise<void> {
  audioCache.clear();
  try {
    const { db } = await import('../data/db');
    await db.audio.clear();
  } catch {
    /* ignore */
  }
}
