// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const synthesize = vi.fn(async () => new Blob(['x'], { type: 'audio/wav' }));
const memory = new Map<string, Blob>();
vi.mock('../../src/ui/hdVoice', () => ({
  hdVoice: { synthesize, warmup: async () => {} },
  hdVoiceSupported: () => true,
  cachedAudio: (k: string) => memory.get(k),
  cachedAudioAsync: async (k: string) => memory.get(k),
  rememberAudio: (k: string, b: Blob) => void memory.set(k, b),
  cancelPrefetch: () => {},
}));

const plays: string[] = [];
beforeEach(() => {
  plays.length = 0;
  synthesize.mockClear();
  Object.defineProperty(globalThis.URL, 'createObjectURL', { value: () => 'blob:fake', configurable: true });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: () => {}, configurable: true });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: function (this: HTMLMediaElement) {
      plays.push(this.src);
      setTimeout(() => this.onended?.(new Event('ended')), 5);
      return Promise.resolve();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: () => {} });
});

describe('speak() avec une voix HD', () => {
  it('synthétise puis joue réellement le son (régression : compteur incrémenté deux fois)', async () => {
    memory.clear();
    const { speak, setSpeechPrefs, getSpeechStatus } = await import('../../src/ui/speech');
    setSpeechPrefs({ hdVoiceId: 'fr_FR-siwis-medium', rate: 1 });
    await speak('Tu joues e4.');
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(plays).toHaveLength(1);
    expect(getSpeechStatus().state).toBe('idle');
  });
  it('lit phrase par phrase : un long commentaire est joué en plusieurs morceaux', async () => {
    memory.clear();
    const { speak, setSpeechPrefs } = await import('../../src/ui/speech');
    setSpeechPrefs({ hdVoiceId: 'fr_FR-siwis-medium', rate: 1 });
    const text = 'Tu joues Cavalier f3. Bon coup. ' + 'Il attaque le pion e5 et développe une pièce. '.repeat(5);
    await speak(text);
    expect(synthesize.mock.calls.length).toBeGreaterThan(1);
    // Les phrases identiques sont synthétisées une seule fois (cache) mais jouées à chaque fois.
    expect(plays.length).toBeGreaterThanOrEqual(synthesize.mock.calls.length);
    expect(plays.length).toBeGreaterThan(1);
  });
  it('la pré-génération remplit le cache et la lecture suivante ne synthétise plus', async () => {
    memory.clear();
    const { speak, setSpeechPrefs, prefetchSpeech, isPrepared } = await import('../../src/ui/speech');
    setSpeechPrefs({ hdVoiceId: 'fr_FR-siwis-medium', rate: 1 });
    const progress: number[] = [];
    await prefetchSpeech(['Tu joues e4.', 'Tu joues d4. Bon coup.'], (d) => progress.push(d)).done;
    expect(progress).toEqual([1, 2]);
    expect(await isPrepared('Tu joues d4. Bon coup.')).toBe(true);
    synthesize.mockClear();
    await speak('Tu joues d4. Bon coup.');
    expect(synthesize).not.toHaveBeenCalled();
    expect(plays.length).toBeGreaterThan(0);
  });
  it('une nouvelle lecture remplace la précédente', async () => {
    const { speak, setSpeechPrefs } = await import('../../src/ui/speech');
    setSpeechPrefs({ hdVoiceId: 'fr_FR-siwis-medium', rate: 1 });
    const first = speak('Première phrase.');
    const second = speak('Seconde phrase.');
    await Promise.all([first, second]);
    expect(plays).toHaveLength(1);
  });
});
