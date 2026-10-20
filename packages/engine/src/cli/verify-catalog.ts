// Vérifie un catalogue et sa signature avec les clés publiques du dépôt (principale ou secours).
// Usage : npm run catalog:verify -- <index.json> <index.json.sig> [--keys-file keys/catalog-keys.json]
// Code de sortie : 0 si la signature est valide, 1 sinon, 2 si un fichier manque.

import fs from 'node:fs';

import { parseCatalog, verifyCatalog } from '../catalog';
import { KEYS_FILE, readKeys, takeOption } from './options';

function main(args: string[]): number {
  const { value: keysOption, rest } = takeOption(args, 'keys-file');
  const [indexFile, signatureFile] = rest;
  if (!indexFile || !signatureFile) {
    console.error('Usage : npm run catalog:verify -- <index.json> <index.json.sig>');
    return 2;
  }
  const keys = readKeys(keysOption ?? KEYS_FILE);
  if (!keys || !fs.existsSync(indexFile) || !fs.existsSync(signatureFile)) {
    console.error('Fichier introuvable : catalogue, signature ou clés publiques.');
    return 2;
  }

  const text = fs.readFileSync(indexFile, 'utf8');
  const signature = fs.readFileSync(signatureFile, 'utf8');
  if (!verifyCatalog(text, signature, [keys.primary, keys.backup])) {
    console.error(
      '✗ Signature invalide : ce catalogue ne vient pas de tablee-games ou a été modifié.',
    );
    return 1;
  }
  const catalog = parseCatalog(text);
  if (!catalog) {
    console.error('✗ Signature valide, mais le catalogue n’est pas au bon format.');
    return 1;
  }
  const key = verifyCatalog(text, signature, [keys.primary]) ? 'principale' : 'de secours';
  console.log(
    `✓ Signature valide (clé ${key}) : catalogue version ${catalog.version}, ${catalog.games.length} fichier(s) de jeu.`,
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
