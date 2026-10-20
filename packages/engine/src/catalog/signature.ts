import { ed25519 } from '@noble/curves/ed25519.js';

import { fromBase64, toBase64 } from './base64';

// Signature Ed25519 du catalogue : la CI signe `index.json` avec la clé privée (secret de
// l'environnement « release »), l'app vérifie avec les clés publiques qu'elle embarque.

/** Clés publiques du catalogue (base64) : la principale et celle de secours. */
export type CatalogKeys = { primary: string; backup: string };

export type KeyPair = { privateKey: string; publicKey: string };

const encoder = new TextEncoder();

/** Nouvelle paire de clés, en base64 (32 octets chacune). */
export function generateKeyPair(): KeyPair {
  const { secretKey, publicKey } = ed25519.keygen();
  return { privateKey: toBase64(secretKey), publicKey: toBase64(publicKey) };
}

/** Clé publique d'une clé privée ; null si la clé privée est invalide. */
export function publicKeyOf(privateKey: string): string | null {
  const secret = fromBase64(privateKey);
  if (!secret || secret.length !== 32) return null;
  return toBase64(ed25519.getPublicKey(secret));
}

/** Signature (base64) du texte exact, encodé en UTF-8. */
export function signCatalog(text: string, privateKey: string): string {
  const secret = fromBase64(privateKey);
  if (!secret || secret.length !== 32) throw new Error('clé privée invalide : 32 octets en base64');
  return toBase64(ed25519.sign(encoder.encode(text), secret));
}

/**
 * Vrai si `signature` est celle de `text` par l'une des clés publiques. Ne lève jamais :
 * une signature, une clé ou un texte abîmé donne simplement faux.
 */
export function verifyCatalog(
  text: string,
  signature: string,
  publicKeys: readonly string[],
): boolean {
  const sig = fromBase64(signature);
  if (!sig || sig.length !== 64) return false;
  const message = encoder.encode(text);
  return publicKeys.some((key) => {
    const publicKey = fromBase64(key);
    if (!publicKey || publicKey.length !== 32) return false;
    try {
      return ed25519.verify(sig, message, publicKey);
    } catch {
      return false;
    }
  });
}
