// Base64 standard (avec `=`), sans Buffer ni atob : le moteur tourne aussi dans React Native.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.ceil((Math.min(3, bytes.length - i) * 8) / 6);
    for (let c = 0; c < 4; c++) out += c < chars ? ALPHABET[(n >> (18 - 6 * c)) & 63] : '=';
  }
  return out;
}

/** Octets d'un texte base64 (espaces et retours à la ligne ignorés) ; null s'il est invalide. */
export function fromBase64(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, '');
  if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((clean.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    let n = 0;
    for (let c = 0; c < 4; c++) {
      const char = clean[i + c];
      n = (n << 6) | (char === '=' ? 0 : ALPHABET.indexOf(char));
    }
    for (let b = 0; b < 3 && o < bytes.length; b++) bytes[o++] = (n >> (16 - 8 * b)) & 0xff;
  }
  return bytes;
}
