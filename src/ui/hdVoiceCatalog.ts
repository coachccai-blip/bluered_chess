// Catalogue des voix HD françaises (modèles Piper, licence MIT, hébergés sur Hugging Face).
export interface HdVoice {
  id: string;
  label: string;
  description: string;
  sizeMb: number;
  quality: 'HD' | 'légère';
}

export const HD_VOICES: HdVoice[] = [
  { id: 'fr_FR-siwis-medium', label: 'Siwis', description: 'Voix féminine, claire et naturelle (recommandée)', sizeMb: 63, quality: 'HD' },
  { id: 'fr_FR-tom-medium', label: 'Tom', description: 'Voix masculine, posée', sizeMb: 64, quality: 'HD' },
  { id: 'fr_FR-upmc-medium', label: 'Jessica', description: 'Voix féminine, ton radio', sizeMb: 77, quality: 'HD' },
  { id: 'fr_FR-siwis-low', label: 'Siwis (légère)', description: 'Même voix, modèle plus petit et plus rapide', sizeMb: 28, quality: 'légère' },
];

/** Taille approximative des fichiers moteur (ONNX Runtime + phonémiseur) téléchargés au premier usage. */
export const HD_RUNTIME_MB = 33;

export function hdVoice(id: string | undefined): HdVoice | undefined {
  return HD_VOICES.find((v) => v.id === id);
}

export function formatProgress(loaded: number, total: number): string {
  if (!total) return `${(loaded / 1e6).toFixed(0)} Mo`;
  return `${Math.round((loaded / total) * 100)} % (${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} Mo)`;
}
