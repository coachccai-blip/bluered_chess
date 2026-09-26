// Sons légers générés par WebAudio (aucun fichier à télécharger).
let ctx: AudioContext | null = null;

function beep(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.08) {
  try {
    ctx = ctx ?? new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    o.stop(ctx.currentTime + duration);
  } catch {
    /* audio indisponible */
  }
}

export const sounds = {
  move: () => beep(440, 0.08, 'triangle'),
  capture: () => beep(220, 0.15, 'square', 0.06),
  check: () => beep(660, 0.2, 'sawtooth', 0.05),
  end: () => {
    beep(523, 0.2);
    setTimeout(() => beep(659, 0.25), 150);
  },
};
