// Revue d'une pull request du catalogue, lancée par la CI (.github/workflows/pr-games.yml).
// Usage : npm run games:review -- <games publiés> <games de la PR> [--out rapport.md]
// Code de sortie : 0 si tout passe, 1 s'il faut corriger, 2 si un dossier est introuvable.

import fs from 'node:fs';
import path from 'node:path';

import { reviewChanges, type Catalog } from './review';

/** Tous les fichiers d'un dossier, chemins relatifs avec `/`. */
function readCatalog(dir: string): Catalog {
  return new Map(
    fs
      .readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = path.join(entry.parentPath, entry.name);
        return [path.relative(dir, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')];
      }),
  );
}

function main(args: string[]): number {
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const dirs = outIndex >= 0 ? args.filter((_, i) => i !== outIndex && i !== outIndex + 1) : args;
  const [baseDir, headDir] = dirs;
  if (!baseDir || !headDir || (outIndex >= 0 && !out)) {
    console.error(
      'Usage : npm run games:review -- <games publiés> <games de la PR> [--out rapport.md]',
    );
    return 2;
  }
  for (const dir of [baseDir, headDir]) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      console.error(`Dossier introuvable : ${dir}`);
      return 2;
    }
  }

  const review = reviewChanges(readCatalog(baseDir), readCatalog(headDir));
  console.log(review.lines.join('\n'));
  if (out) fs.writeFileSync(out, review.markdown);
  return review.ok ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
