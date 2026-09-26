// Coach par LLM (optionnel, opt-in) : envoie uniquement les moments clés au format JSON.
import type { KeyMoment } from './coach';

export interface LlmConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function buildPrompt(moments: KeyMoment[], playerColor: 'w' | 'b'): string {
  const side = playerColor === 'w' ? 'Bleu (Blancs)' : 'Rouge (Noirs)';
  const payload = moments.map((m) => ({
    ply: m.ply,
    fen: m.fenBefore,
    played: m.san,
    recommended: m.recommendedMove,
    category: m.category,
    motif: m.motif,
    ruleBasedAdvice: m.adviceText,
  }));
  return [
    `Tu es un coach d'échecs bienveillant pour un joueur de niveau débutant à intermédiaire. Le joueur jouait ${side}.`,
    'Pour chaque moment clé ci-dessous (JSON), explique en 3 phrases maximum, en français simple, pourquoi le coup joué était une erreur et pourquoi le coup recommandé était meilleur. Sois concret (nomme les pièces et les cases). Ne répète pas le conseil existant mot pour mot.',
    'Réponds en JSON strict : un tableau d\'objets {"ply": number, "explanation": string}.',
    JSON.stringify(payload),
  ].join('\n\n');
}

export async function explainWithLlm(moments: KeyMoment[], playerColor: 'w' | 'b', cfg: LlmConfig): Promise<Record<number, string>> {
  const prompt = buildPrompt(moments, playerColor);
  let text = '';
  if (cfg.provider === 'anthropic') {
    const res = await fetch(`${cfg.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: cfg.model || 'claude-sonnet-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Erreur API (${res.status})`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    text = data.content.map((c) => c.text ?? '').join('');
  } else {
    const res = await fetch(`${cfg.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4 }),
    });
    if (!res.ok) throw new Error(`Erreur API (${res.status})`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    text = data.choices[0]?.message.content ?? '';
  }
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Réponse du coach illisible');
  const arr = JSON.parse(match[0]) as { ply: number; explanation: string }[];
  const out: Record<number, string> = {};
  for (const a of arr) out[a.ply] = a.explanation;
  return out;
}
