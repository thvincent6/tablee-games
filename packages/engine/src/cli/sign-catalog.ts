// Signe index.json avec la clé privée du secret CATALOG_SIGNING_KEY (environnement « release »,
// après approbation) et écrit index.json.sig. Lancé par la CI.
// Usage : CATALOG_SIGNING_KEY=… npm run catalog:sign -- <index.json> [--keys-file keys/catalog-keys.json]

import fs from 'node:fs';

import { publicKeyOf, signCatalog } from '../catalog';
import { KEYS_FILE, readKeys, takeOption } from './options';

function main(args: string[]): number {
  const { value: keysOption, rest } = takeOption(args, 'keys-file');
  const [indexFile] = rest;
  if (!indexFile) {
    console.error('Usage : npm run catalog:sign -- <index.json>');
    return 2;
  }
  const privateKey = process.env.CATALOG_SIGNING_KEY?.trim();
  if (!privateKey) {
    console.error('Secret CATALOG_SIGNING_KEY absent : rien n’a été signé.');
    return 1;
  }
  const keys = readKeys(keysOption ?? KEYS_FILE);
  if (!keys) {
    console.error(`Clés publiques introuvables (${keysOption ?? KEYS_FILE}).`);
    return 1;
  }
  // Une signature que l'app ne saurait pas vérifier ne doit jamais être publiée.
  if (publicKeyOf(privateKey) !== keys.primary) {
    console.error('La clé du secret ne correspond pas à la clé publique principale.');
    return 1;
  }

  const text = fs.readFileSync(indexFile, 'utf8');
  fs.writeFileSync(`${indexFile}.sig`, signCatalog(text, privateKey) + '\n');
  console.log(`Signature écrite : ${indexFile}.sig`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
