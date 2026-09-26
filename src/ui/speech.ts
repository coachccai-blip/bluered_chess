// Synthèse vocale du navigateur (Web Speech API) : gratuite, locale, aucune clé.
// Préfère la voix « Vivienne » (Microsoft, français neuronal) si elle est installée, sinon la meilleure voix française.
import { useEffect, useState } from 'react';

export interface VoiceInfo {
  name: string;
  lang: string;
  local: boolean;
}

const PREFERRED = ['vivienne', 'denise', 'eloise', 'henri', 'thomas', 'amélie', 'audrey', 'hortense', 'julie'];

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function listVoices(): VoiceInfo[] {
  if (!supported()) return [];
  return window.speechSynthesis
    .getVoices()
    .map((v) => ({ name: v.name, lang: v.lang, local: v.localService }))
    .sort((a, b) => score(b) - score(a));
}

/** Score de préférence : Vivienne > autres voix neuronales françaises > français > reste. */
export function score(v: VoiceInfo): number {
  const n = v.name.toLowerCase();
  const fr = v.lang.toLowerCase().startsWith('fr');
  let s = fr ? 100 : 0;
  const idx = PREFERRED.findIndex((p) => n.includes(p));
  if (idx >= 0) s += 50 - idx;
  if (n.includes('natural') || n.includes('neural') || n.includes('online') || n.includes('premium') || n.includes('enhanced')) s += 10;
  if (v.lang.toLowerCase() === 'fr-fr') s += 5;
  return s;
}

/** Voix effectivement utilisée : celle choisie par l'utilisateur si présente, sinon la meilleure. */
export function pickVoice(preferredName?: string): SpeechSynthesisVoice | null {
  if (!supported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  if (preferredName) {
    const v = voices.find((x) => x.name === preferredName);
    if (v) return v;
  }
  const ranked = [...voices].sort((a, b) => score({ name: b.name, lang: b.lang, local: b.localService }) - score({ name: a.name, lang: a.lang, local: a.localService }));
  return ranked[0] ?? null;
}

export function hasVivienne(): boolean {
  return listVoices().some((v) => v.name.toLowerCase().includes('vivienne'));
}

let current: SpeechSynthesisUtterance | null = null;

export interface SpeakOptions {
  voiceName?: string;
  rate?: number;
  pitch?: number;
  onEnd?: () => void;
}

/** Lit un texte ; interrompt la lecture en cours. Résout à la fin (ou immédiatement si indisponible). */
export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!supported() || !text.trim()) {
      opts.onEnd?.();
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(opts.voiceName);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'fr-FR';
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    const done = () => {
      if (current === u) current = null;
      opts.onEnd?.();
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    current = u;
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (supported()) window.speechSynthesis.cancel();
  current = null;
}

export function isSpeaking(): boolean {
  return supported() && window.speechSynthesis.speaking;
}

/** Hook : liste des voix (mise à jour quand le navigateur les charge). */
export function useVoices(): { voices: VoiceInfo[]; supported: boolean } {
  const [voices, setVoices] = useState<VoiceInfo[]>(() => listVoices());
  useEffect(() => {
    if (!supported()) return;
    const refresh = () => setVoices(listVoices());
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    // Certains navigateurs ne déclenchent pas l'événement : on réessaie brièvement.
    const t = setTimeout(refresh, 800);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', refresh);
      clearTimeout(t);
    };
  }, []);
  return { voices, supported: supported() };
}
