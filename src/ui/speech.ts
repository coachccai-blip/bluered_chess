// Synthèse vocale du navigateur (Web Speech API) : gratuite, locale, aucune clé.
// Préfère la voix « Vivienne » (Microsoft, français neuronal) si elle est installée, sinon la meilleure voix française.
import { useEffect, useState } from 'react';
import { cachedAudio, hdVoice, hdVoiceSupported, rememberAudio } from './hdVoice';

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
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let speakSeq = 0;

export interface SpeechPrefs {
  /** Voix HD hors ligne (identifiant Piper) ; vide = voix du navigateur. */
  hdVoiceId?: string;
  voiceName?: string;
  rate: number;
}

let prefs: SpeechPrefs = { rate: 1 };

/** Préférences globales (poussées par le store des réglages). */
export function setSpeechPrefs(p: SpeechPrefs): void {
  prefs = p;
}

export interface SpeakOptions {
  voiceName?: string;
  rate?: number;
  pitch?: number;
  onEnd?: () => void;
  /** Forcer la voix du navigateur même si une voix HD est active. */
  browserOnly?: boolean;
  /** Forcer une voix HD précise (ex. bouton « Essayer »). */
  hdVoiceId?: string;
}

/** Lit un texte : voix HD (Piper) si active, sinon voix du navigateur. Interrompt la lecture en cours. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  const hd = opts.browserOnly ? undefined : (opts.hdVoiceId ?? prefs.hdVoiceId);
  if (hd && hdVoiceSupported() && text.trim()) {
    const my = ++speakSeq;
    stopSpeaking();
    try {
      const key = `${hd}|${text}`;
      let blob = cachedAudio(key);
      if (!blob) {
        blob = await hdVoice.synthesize(hd, text);
        rememberAudio(key, blob);
      }
      if (my !== speakSeq) return; // une autre lecture a pris le relais
      await playBlob(blob, opts.rate ?? prefs.rate);
      opts.onEnd?.();
      return;
    } catch (e) {
      console.warn('Voix HD indisponible, repli sur la voix du navigateur :', (e as Error).message);
      if (my !== speakSeq) return;
    }
  }
  return speakBrowser(text, opts);
}

function playBlob(blob: Blob, rate: number): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = Math.max(0.5, Math.min(2, rate));
    currentAudio = audio;
    currentUrl = url;
    const done = () => {
      if (currentAudio === audio) {
        currentAudio = null;
        currentUrl = null;
      }
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

function speakBrowser(text: string, opts: SpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    if (!supported() || !text.trim()) {
      opts.onEnd?.();
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(opts.voiceName ?? prefs.voiceName);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'fr-FR';
    u.rate = opts.rate ?? prefs.rate;
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
  speakSeq++;
  if (supported()) window.speechSynthesis.cancel();
  current = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export function isSpeaking(): boolean {
  return (supported() && window.speechSynthesis.speaking) || (currentAudio !== null && !currentAudio.paused);
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
