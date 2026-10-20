import { compareVersions, parseGameDefinition } from '../definition';
import { catalogSchema, type Catalog, type CatalogEntry } from './schema';

/** Un fichier de jeu à publier : chemin depuis `games/`, texte exact et son SHA-256. */
export type CatalogFile = { path: string; text: string; sha256: string };

export class CatalogError extends Error {}

/** Entrée du catalogue d'un fichier `<id>/<version>.json` valide. */
export function catalogEntry({ path, text, sha256 }: CatalogFile): CatalogEntry {
  const parsed = parseGameDefinition(text);
  if (!parsed.ok) throw new CatalogError(`${path} : définition invalide`);
  const { definition } = parsed;
  if (path !== `${definition.id}/${definition.version}.json`) {
    throw new CatalogError(`${path} : doit s’appeler ${definition.id}/${definition.version}.json`);
  }
  return {
    id: definition.id,
    name: definition.name,
    version: definition.version,
    engine: definition.engine,
    path: `games/${path}`,
    sha256,
    players: [definition.players.min, definition.players.max],
    tags: definition.tags ?? [],
  };
}

/** Catalogue de tous les fichiers, triés par jeu puis par version. */
export function buildCatalog(
  files: readonly CatalogFile[],
  version: number,
  generatedAt: Date,
): Catalog {
  const games = files
    .map(catalogEntry)
    .sort((a, b) => a.id.localeCompare(b.id) || compareVersions(a.version, b.version));
  return catalogSchema.parse({ version, generatedAt: generatedAt.toISOString(), games });
}

/** Texte exact de `index.json` : c'est lui qui est signé, octet pour octet. */
export function serializeCatalog(catalog: Catalog): string {
  return JSON.stringify(catalog, null, 2) + '\n';
}

/** Lit un catalogue ; null s'il n'est pas au bon format. */
export function parseCatalog(text: string): Catalog | null {
  try {
    const result = catalogSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
