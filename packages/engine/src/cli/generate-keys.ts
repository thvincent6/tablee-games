// Génère la paire de clés principale et la paire de secours du catalogue. À lancer une seule fois,
// en local : les clés privées ne sont jamais affichées, seulement écrites hors du dépôt.
// Usage : npm run keys:generate [-- --dir ~/.tablee-keys]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateKeyPair } from '../catalog';
import { KEYS_FILE, takeOption } from './options';

function main(args: string[]): number {
  const { value: dirOption, rest } = takeOption(args, 'dir');
  const { value: keysOption } = takeOption(rest, 'keys-file');
  const dir = dirOption ?? path.join(os.homedir(), '.tablee-keys');
  const keysFile = keysOption ?? KEYS_FILE;
  const primaryFile = path.join(dir, 'catalog-primary.key');
  const backupFile = path.join(dir, 'catalog-backup.key');

  // Changer de clé est un acte délibéré : on n'écrase jamais une clé existante.
  for (const file of [keysFile, primaryFile, backupFile]) {
    if (fs.existsSync(file)) {
      console.error(`${file} existe déjà : rien n'a été généré.`);
      return 2;
    }
  }

  const primary = generateKeyPair();
  const backup = generateKeyPair();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(primaryFile, primary.privateKey + '\n', { mode: 0o600 });
  fs.writeFileSync(backupFile, backup.privateKey + '\n', { mode: 0o600 });
  fs.mkdirSync(path.dirname(keysFile), { recursive: true });
  fs.writeFileSync(
    keysFile,
    JSON.stringify({ primary: primary.publicKey, backup: backup.publicKey }, null, 2) + '\n',
  );

  console.log(
    [
      'Clés du catalogue générées.',
      '',
      `  Clés publiques : ${keysFile} (à committer)`,
      `  Clé privée principale : ${primaryFile}`,
      `  Clé privée de secours : ${backupFile}`,
      '',
      'Ensuite :',
      '  1. Copie les deux clés privées dans ton gestionnaire de mots de passe.',
      '  2. Enregistre la clé principale en secret de l’environnement « release » :',
      `       gh secret set CATALOG_SIGNING_KEY --env release --repo thvincent6/tablee-games < ${primaryFile}`,
      '  3. Garde la clé de secours hors ligne (clé USB, papier) : elle ne va jamais sur GitHub.',
      `  4. Efface les fichiers privés : shred -u ${primaryFile} ${backupFile}`,
    ].join('\n'),
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
