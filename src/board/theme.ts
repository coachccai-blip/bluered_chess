// Toute la logique de couleur passe ici : le code interne reste w/b, l'affichage traduit en Bleu/Rouge.
import type { Color } from '../chess/types';

export interface Palette {
  name: string;
  light: string;
  dark: string;
  w: { piece: string; overlay: string; label: string; ring: string };
  b: { piece: string; overlay: string; label: string; ring: string };
}

export const PALETTES: Record<'bluered' | 'colorblind', Palette> = {
  bluered: {
    name: 'Bleu / Rouge',
    light: '#EEEED2',
    dark: '#769656',
    w: { piece: '#1E5AA8', overlay: '#1E5AA8', label: 'Bleu', ring: '#3B82F6' },
    b: { piece: '#B3261E', overlay: '#B3261E', label: 'Rouge', ring: '#EF4444' },
  },
  colorblind: {
    name: 'Bleu / Orange (daltonisme)',
    light: '#EFEFEF',
    dark: '#9A9A9A',
    w: { piece: '#0072B2', overlay: '#0072B2', label: 'Bleu', ring: '#56B4E9' },
    b: { piece: '#E69F00', overlay: '#E69F00', label: 'Orange', ring: '#F0C040' },
  },
};

/** Opacité du calque selon le nombre d'attaquants (section 5). */
export function overlayOpacity(count: number, intensity = 1): number {
  const base = count <= 0 ? 0 : count === 1 ? 0.25 : count === 2 ? 0.45 : count === 3 ? 0.65 : 0.85;
  return Math.min(0.95, base * intensity);
}

export function colorLabel(c: Color, palette: Palette = PALETTES.bluered): string {
  return palette[c].label;
}

export function sideName(c: Color): 'blue' | 'red' {
  return c === 'w' ? 'blue' : 'red';
}

export function fromSideName(s: 'blue' | 'red'): Color {
  return s === 'blue' ? 'w' : 'b';
}
