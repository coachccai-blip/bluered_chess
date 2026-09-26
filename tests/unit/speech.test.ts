import { describe, expect, it } from 'vitest';
import { splitSentences, score } from '../../src/ui/speech';

describe('voix', () => {
  it('découpe les longs commentaires en phrases courtes', () => {
    const text = 'Tu joues Cavalier f3. Bon coup. ' + 'Il attaque le pion e5 et développe une pièce. '.repeat(6);
    const chunks = splitSentences(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text.trim().replace(/\s+/g, ' '));
    expect(splitSentences('Court.')).toEqual(['Court.']);
  });
  it('préfère Vivienne puis les voix françaises', () => {
    const viv = score({ name: 'Microsoft Vivienne Online (Natural) - French (France)', lang: 'fr-FR', local: false });
    const hort = score({ name: 'Microsoft Hortense - French (France)', lang: 'fr-FR', local: true });
    const en = score({ name: 'Google US English', lang: 'en-US', local: false });
    expect(viv).toBeGreaterThan(hort);
    expect(hort).toBeGreaterThan(en);
  });
});
