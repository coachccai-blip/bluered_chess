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

let current: SpeechSynthesisUtterance[] = [];
let speakSeq = 0;

// Élément audio partagé, « débloqué » au premier geste de l'utilisateur (indispensable sur iPhone/Android
// où un son ne peut démarrer qu'à la suite d'un clic ; ensuite, changer la source suffit).
let sharedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

function unlockAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const a = getAudio();
    a.src = SILENT_WAV;
    a.play().catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    if (supported()) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

/** Dernier état de la voix, pour l'afficher à l'utilisateur (« lecture », « erreur : … »). */
export type SpeechStatus = { state: 'idle' } | { state: 'preparing'; engine: 'hd' | 'browser' } | { state: 'speaking'; engine: 'hd' | 'browser' } | { state: 'error'; message: string };
let status: SpeechStatus = { state: 'idle' };
const statusListeners = new Set<(s: SpeechStatus) => void>();
function setStatus(s: SpeechStatus): void {
  status = s;
  statusListeners.forEach((l) => l(s));
}
export function getSpeechStatus(): SpeechStatus {
  return status;
}
export function useSpeechStatus(): SpeechStatus {
  const [st, setSt] = useState<SpeechStatus>(status);
  useEffect(() => {
    statusListeners.add(setSt);
    return () => {
      statusListeners.delete(setSt);
    };
  }, []);
  return st;
}

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
  if (!text.trim()) {
    opts.onEnd?.();
    return;
  }
  stopSpeaking();
  const my = ++speakSeq; // après stopSpeaking(), qui incrémente aussi le compteur
  const hd = opts.browserOnly ? undefined : (opts.hdVoiceId ?? prefs.hdVoiceId);
  if (hd && hdVoiceSupported()) {
    try {
      setStatus({ state: 'preparing', engine: 'hd' });
      const key = `${hd}|${text}`;
      let blob = cachedAudio(key);
      if (!blob) {
        blob = await hdVoice.synthesize(hd, text);
        rememberAudio(key, blob);
      }
      if (my !== speakSeq) return; // une autre lecture a pris le relais
      setStatus({ state: 'speaking', engine: 'hd' });
      await playBlob(blob, opts.rate ?? prefs.rate);
      if (my === speakSeq) setStatus({ state: 'idle' });
      opts.onEnd?.();
      return;
    } catch (e) {
      const message = (e as Error).message || String(e);
      console.warn('Voix HD indisponible, repli sur la voix du navigateur :', message);
      setStatus({ state: 'error', message: `Voix HD : ${message}. Repli sur la voix du navigateur.` });
      if (my !== speakSeq) return;
    }
  }
  return speakBrowser(text, opts, my);
}

function playBlob(blob: Blob, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = getAudio();
    const url = URL.createObjectURL(blob);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error('lecture audio impossible'));
    };
    audio.src = url;
    audio.playbackRate = Math.max(0.5, Math.min(2, rate));
    audio.play().catch((err: Error) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error(err?.name === 'NotAllowedError' ? 'le navigateur bloque le son tant que tu n\'as pas cliqué dans la page' : err?.message || 'lecture impossible'));
    });
  });
}

/** Découpe en phrases courtes : Chrome coupe les longues lectures après ~15 s. */
export function splitSentences(text: string, max = 180): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function speakBrowser(text: string, opts: SpeakOptions, my: number): Promise<void> {
  return new Promise((resolve) => {
    if (!supported()) {
      setStatus({ state: 'error', message: 'Ce navigateur ne propose pas de synthèse vocale.' });
      opts.onEnd?.();
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const voice = pickVoice(opts.voiceName ?? prefs.voiceName);
    const chunks = splitSentences(text);
    current = [];
    let remaining = chunks.length;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (my === speakSeq) setStatus({ state: 'idle' });
      opts.onEnd?.();
      resolve();
    };
    // Petit délai après cancel() : sans lui, Chrome perd parfois l'énoncé suivant.
    setTimeout(() => {
      if (my !== speakSeq) return finish();
      setStatus({ state: 'speaking', engine: 'browser' });
      for (const chunk of chunks) {
        const u = new SpeechSynthesisUtterance(chunk);
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? 'fr-FR';
        u.rate = opts.rate ?? prefs.rate;
        u.pitch = opts.pitch ?? 1;
        u.onend = () => {
          if (--remaining <= 0) finish();
        };
        u.onerror = (ev) => {
          if (ev.error !== 'interrupted' && ev.error !== 'canceled') setStatus({ state: 'error', message: `Voix du navigateur : ${ev.error}` });
          if (--remaining <= 0) finish();
        };
        current.push(u); // garder une référence : sinon Chrome peut arrêter la lecture (ramasse-miettes)
        synth.speak(u);
      }
      // Sécurité : si le navigateur n'émet jamais onend, on libère au bout d'un délai raisonnable.
      setTimeout(finish, 1500 + text.length * 90);
    }, 60);
  });
}

export function stopSpeaking(): void {
  speakSeq++;
  if (supported()) window.speechSynthesis.cancel();
  current = [];
  if (sharedAudio && !sharedAudio.paused) {
    sharedAudio.pause();
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
  }
  if (status.state !== 'error') setStatus({ state: 'idle' });
}

export function isSpeaking(): boolean {
  return (supported() && window.speechSynthesis.speaking) || (sharedAudio !== null && !sharedAudio.paused && !sharedAudio.ended);
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
