import fs from 'node:fs';

import type { CatalogKeys } from '../catalog';

/** Fichier des clés publiques du catalogue, à la racine du dépôt. */
export const KEYS_FILE = 'keys/catalog-keys.json';

/** Valeur d'une option `--nom valeur`, et les arguments restants. */
export function takeOption(
  args: string[],
  name: string,
): { value: string | undefined; rest: string[] } {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return { value: undefined, rest: args };
  return { value: args[index + 1], rest: args.filter((_, i) => i !== index && i !== index + 1) };
}

/** Clés publiques du catalogue ; null si le fichier manque ou est mal formé. */
export function readKeys(file: string): CatalogKeys | null {
  try {
    const keys = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<CatalogKeys>;
    return typeof keys.primary === 'string' && typeof keys.backup === 'string'
      ? { primary: keys.primary, backup: keys.backup }
      : null;
  } catch {
    return null;
  }
}
