// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const synthesize = vi.fn(async () => new Blob(['x'], { type: 'audio/wav' }));
vi.mock('../../src/ui/hdVoice', () => ({
  hdVoice: { synthesize },
  hdVoiceSupported: () => true,
  cachedAudio: () => undefined,
  rememberAudio: () => {},
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
    const { speak, setSpeechPrefs, getSpeechStatus } = await import('../../src/ui/speech');
    setSpeechPrefs({ hdVoiceId: 'fr_FR-siwis-medium', rate: 1 });
    await speak('Tu joues e4.');
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(plays).toHaveLength(1);
    expect(getSpeechStatus().state).toBe('idle');
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
