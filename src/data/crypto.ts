// Chiffrement local (AES-GCM) de la clé API, avec une clé dérivée d'un secret stocké dans IndexedDB/localStorage.
// Protège contre une lecture triviale du fichier de sauvegarde ; la clé n'est jamais exportée.
const SECRET_KEY = 'bluered-local-secret';

async function getKey(): Promise<CryptoKey> {
  let secret = localStorage.getItem(SECRET_KEY);
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    secret = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(SECRET_KEY, secret);
  }
  const raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptText(text: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(text);
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(iv.length + enc.length);
  out.set(iv);
  out.set(enc, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptText(b64: string): Promise<string> {
  const key = await getKey();
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}
