// Vérifie toutes les définitions de jeu d'un dossier : validation, puis rejeu des cas de test.
// Usage : npm run games:check -- <dossier>
// Code de sortie : 0 si tout passe, 1 si un jeu échoue, 2 si le dossier est introuvable.
// Sert tel quel dans la CI de l'app (dossier games/) et dans celle du dépôt public des jeux.

import fs from 'node:fs';
import path from 'node:path';

import { checkGameFile, summarize, type FileCheck } from './check';

function jsonFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function main(args: string[]): number {
  const dir = args[0];
  if (!dir) {
    console.error('Usage : npm run games:check -- <dossier>');
    return 2;
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Dossier introuvable : ${dir}`);
    return 2;
  }

  const files = jsonFiles(dir);
  if (files.length === 0) {
    console.log(`Aucun fichier JSON dans ${dir} : rien à vérifier.`);
    return 0;
  }

  const checks: FileCheck[] = files.map((file) =>
    checkGameFile(
      path.relative(dir, file),
      fs.readFileSync(file, 'utf8'),
      path.relative('.', file),
    ),
  );
  for (const check of checks) console.log([...check.lines, ''].join('\n'));
  const summary = summarize(checks);
  console.log(summary.line);
  return summary.ok ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
