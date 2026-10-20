// Construit le site du catalogue : index.json (version suivante de celle publiée) et une copie
// exacte des fichiers de jeux. Lancé par la CI (.github/workflows/catalog.yml).
// Usage : npm run catalog:build -- <games> <site> [--previous index-publié.json]

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { buildCatalog, CatalogError, parseCatalog, serializeCatalog } from '../catalog';
import { takeOption } from './options';

function main(args: string[]): number {
  const { value: previousFile, rest } = takeOption(args, 'previous');
  const [gamesDir, siteDir] = rest;
  if (!gamesDir || !siteDir) {
    console.error('Usage : npm run catalog:build -- <games> <site> [--previous index.json]');
    return 2;
  }

  let version = 1;
  if (previousFile) {
    const previous = parseCatalog(fs.readFileSync(previousFile, 'utf8'));
    if (!previous) {
      console.error(`${previousFile} n'est pas un catalogue valide : publication annulée.`);
      return 1;
    }
    version = previous.version + 1;
  }

  const files = fs
    .readdirSync(gamesDir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      const text = fs.readFileSync(file, 'utf8');
      return {
        path: path.relative(gamesDir, file).split(path.sep).join('/'),
        text,
        sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      };
    });

  let index: string;
  try {
    index = serializeCatalog(buildCatalog(files, version, new Date()));
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error;
    console.error(error.message);
    return 1;
  }

  for (const file of files) {
    const target = path.join(siteDir, 'games', file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.text);
  }
  fs.writeFileSync(path.join(siteDir, 'index.json'), index);
  console.log(`Catalogue version ${version} : ${files.length} fichier(s) de jeu.`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
