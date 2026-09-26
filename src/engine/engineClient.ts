// Client UCI promisifié autour du Worker Stockfish lite. Une file d'attente sérialise les requêtes.
export interface EngineLine {
  multipv: number;
  /** Score en centipions du point de vue du camp au trait (undefined si mat). */
  cp?: number;
  /** Mat en N coups (positif = le camp au trait mate, négatif = se fait mater). */
  mate?: number;
  depth: number;
  pv: string[]; // coups LAN
}

export interface AnalyzeOptions {
  depth?: number;
  movetime?: number; // ms
  multiPv?: number;
  /** Options UCI supplémentaires (UCI_LimitStrength, UCI_Elo, Skill Level...). */
  uciOptions?: Record<string, string | number | boolean>;
}

export interface AnalyzeResult {
  bestMove: string | null; // LAN
  lines: EngineLine[];
}

type Job = {
  fen: string;
  opts: AnalyzeOptions;
  resolve: (r: AnalyzeResult) => void;
  reject: (e: Error) => void;
};

export interface EngineTransport {
  postMessage(msg: string): void;
  onMessage(cb: (line: string) => void): void;
  terminate(): void;
}

/** Transport navigateur : Worker sur le script du moteur. */
export function workerTransport(url: string): EngineTransport {
  const worker = new Worker(url);
  return {
    postMessage: (m) => worker.postMessage(m),
    onMessage: (cb) => {
      worker.onmessage = (e: MessageEvent) => cb(typeof e.data === 'string' ? e.data : String(e.data));
    },
    terminate: () => worker.terminate(),
  };
}

export function engineUrl(): string {
  return `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;
}

const DEFAULT_OPTIONS: Record<string, string | number | boolean> = {
  UCI_LimitStrength: false,
  UCI_Elo: 3190,
  'Skill Level': 20,
  MultiPV: 1,
};

export class EngineClient {
  private queue: Job[] = [];
  private busy = false;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (e: Error) => void;
  private current: { lines: Map<number, EngineLine>; job: Job } | null = null;
  private lastOptions: Record<string, string | number | boolean> = {};
  private listeners = new Set<(line: string) => void>();
  private disposed = false;

  constructor(
    private transport: EngineTransport,
    startupTimeoutMs = 30_000,
  ) {
    this.ready = new Promise((r, j) => {
      this.resolveReady = r;
      this.rejectReady = j;
    });
    this.ready.catch(() => {});
    // Si le moteur ne répond pas (fichier absent du cache, WebAssembly bloqué), on signale l'échec.
    const timer = setTimeout(() => this.rejectReady(new Error('Le moteur ne répond pas (fichiers absents ou WebAssembly indisponible).')), startupTimeoutMs);
    this.ready.then(() => clearTimeout(timer), () => clearTimeout(timer));
    transport.onMessage((line) => this.handle(line));
    transport.postMessage('uci');
  }

  /** Attend l'initialisation UCI (uciok). */
  async init(): Promise<void> {
    await this.ready;
    this.transport.postMessage('ucinewgame');
    this.transport.postMessage('isready');
  }

  onLine(cb: (line: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private send(cmd: string) {
    this.transport.postMessage(cmd);
  }

  private setOptions(opts: Record<string, string | number | boolean>) {
    const merged = { ...DEFAULT_OPTIONS, ...opts };
    for (const [k, v] of Object.entries(merged)) {
      if (this.lastOptions[k] !== v) {
        this.send(`setoption name ${k} value ${v}`);
        this.lastOptions[k] = v;
      }
    }
  }

  analyze(fen: string, opts: AnalyzeOptions = {}): Promise<AnalyzeResult> {
    if (this.disposed) return Promise.reject(new Error('Moteur arrêté'));
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, opts, resolve, reject });
      void this.pump();
    });
  }

  private async pump() {
    if (this.busy || this.queue.length === 0) return;
    this.busy = true;
    try {
      await this.ready;
    } catch (e) {
      this.busy = false;
      this.queue.splice(0).forEach((j) => j.reject(e as Error));
      return;
    }
    const job = this.queue.shift()!;
    this.current = { lines: new Map(), job };
    this.setOptions({ MultiPV: job.opts.multiPv ?? 1, ...(job.opts.uciOptions ?? {}) });
    this.send(`position fen ${job.fen}`);
    const parts: string[] = ['go'];
    if (job.opts.depth) parts.push('depth', String(job.opts.depth));
    if (job.opts.movetime) parts.push('movetime', String(job.opts.movetime));
    if (!job.opts.depth && !job.opts.movetime) parts.push('depth', '12');
    this.send(parts.join(' '));
  }

  private handle(line: string) {
    for (const l of this.listeners) l(line);
    if (line === 'uciok') {
      this.resolveReady();
      return;
    }
    if (!this.current) return;
    if (line.startsWith('info ') && line.includes(' pv ')) {
      const parsed = parseInfo(line);
      if (parsed) this.current.lines.set(parsed.multipv, parsed);
      return;
    }
    if (line.startsWith('bestmove')) {
      const bm = line.split(' ')[1];
      const lines = [...this.current.lines.values()].sort((a, b) => a.multipv - b.multipv);
      const job = this.current.job;
      this.current = null;
      this.busy = false;
      job.resolve({ bestMove: bm && bm !== '(none)' ? bm : null, lines });
      void this.pump();
    }
  }

  /** Arrête toute recherche en cours et vide la file. */
  cancelAll() {
    this.queue.splice(0).forEach((j) => j.reject(new Error('Analyse annulée')));
    if (this.current) this.send('stop');
  }

  dispose() {
    this.disposed = true;
    this.cancelAll();
    this.send('quit');
    this.transport.terminate();
  }
}

/** Parse une ligne « info depth 12 multipv 1 score cp 34 ... pv e2e4 e7e5 ». */
export function parseInfo(line: string): EngineLine | null {
  const t = line.split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let cp: number | undefined;
  let mate: number | undefined;
  let pv: string[] = [];
  for (let i = 0; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        depth = parseInt(t[i + 1], 10);
        break;
      case 'multipv':
        multipv = parseInt(t[i + 1], 10);
        break;
      case 'score':
        if (t[i + 1] === 'cp') cp = parseInt(t[i + 2], 10);
        else if (t[i + 1] === 'mate') mate = parseInt(t[i + 2], 10);
        break;
      case 'pv':
        pv = t.slice(i + 1);
        i = t.length;
        break;
    }
  }
  if (pv.length === 0 || (cp === undefined && mate === undefined)) return null;
  // Ignorer les bornes (lowerbound/upperbound) qui bruitent les valeurs.
  if (line.includes('lowerbound') || line.includes('upperbound')) return null;
  return { multipv, cp, mate, depth, pv };
}

/** Convertit une ligne moteur en score numérique du point de vue du camp au trait (mat = ±10000 ajusté). */
export function lineScore(l: { cp?: number; mate?: number }): number {
  if (l.mate !== undefined) return l.mate > 0 ? 10000 - l.mate : -10000 - l.mate;
  return l.cp ?? 0;
}

let shared: EngineClient | null = null;
/** Instance partagée (une seule par page : le Worker lite est mono-thread). */
export function getEngine(): EngineClient {
  if (!shared) shared = new EngineClient(workerTransport(engineUrl()));
  return shared;
}

/** Détruit l'instance partagée pour permettre une nouvelle tentative de chargement. */
export function resetEngine(): void {
  try {
    shared?.dispose();
  } catch {
    /* déjà arrêté */
  }
  shared = null;
}
