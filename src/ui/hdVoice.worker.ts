// Worker de synthèse vocale HD (Piper via ONNX Runtime) : ne bloque jamais l'interface.
/// <reference lib="webworker" />
import * as tts from '@mintplex-labs/piper-tts-web';

interface WasmPaths {
  onnxWasm: string;
  piperData: string;
  piperWasm: string;
}

type Req =
  | { id: number; type: 'stored' }
  | { id: number; type: 'download'; voiceId: string }
  | { id: number; type: 'remove'; voiceId: string }
  | { id: number; type: 'warmup'; voiceId: string; wasmPaths: WasmPaths }
  | { id: number; type: 'predict'; voiceId: string; text: string; wasmPaths: WasmPaths };

type Res =
  | { id: number; type: 'ok'; result?: unknown }
  | { id: number; type: 'error'; message: string }
  | { id: number; type: 'progress'; loaded: number; total: number; url: string };

const post = (r: Res) => (self as unknown as Worker).postMessage(r);

let session: tts.TtsSession | null = null;
let sessionVoice = '';

async function getSession(voiceId: string, wasmPaths: WasmPaths, id: number): Promise<tts.TtsSession> {
  if (session && sessionVoice === voiceId) return session;
  const s = new tts.TtsSession({
    voiceId,
    wasmPaths,
    progress: (p) => post({ id, type: 'progress', loaded: p.loaded, total: p.total, url: p.url }),
  });
  await s.waitReady;
  session = s;
  sessionVoice = voiceId;
  return s;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    switch (req.type) {
      case 'stored':
        post({ id: req.id, type: 'ok', result: await tts.stored() });
        break;
      case 'download':
        await tts.download(req.voiceId, (p) => post({ id: req.id, type: 'progress', loaded: p.loaded, total: p.total, url: p.url }));
        post({ id: req.id, type: 'ok' });
        break;
      case 'remove':
        await tts.remove(req.voiceId);
        if (sessionVoice === req.voiceId) {
          session = null;
          sessionVoice = '';
        }
        post({ id: req.id, type: 'ok' });
        break;
      case 'warmup':
        await getSession(req.voiceId, req.wasmPaths, req.id);
        post({ id: req.id, type: 'ok' });
        break;
      case 'predict': {
        const s = await getSession(req.voiceId, req.wasmPaths, req.id);
        const blob = await s.predict(req.text);
        post({ id: req.id, type: 'ok', result: blob });
        break;
      }
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: (err as Error).message || String(err) });
  }
};
