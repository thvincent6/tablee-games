import { z } from 'zod';

// Format de `index.json`, le catalogue signé publié sur GitHub Pages (specs, « Catalogue signé »).

const SHA256 = /^[0-9a-f]{64}$/;

export const catalogEntrySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  engine: z.number().int().min(1),
  /** Chemin du fichier sur le site, depuis la racine : `games/<id>/<version>.json`. */
  path: z.string().regex(/^games\/[a-z0-9-]+\/[^/]+\.json$/),
  /** SHA-256 hexadécimal du texte exact du fichier. */
  sha256: z.string().regex(SHA256),
  players: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  tags: z.array(z.string()),
});

export const catalogSchema = z.strictObject({
  /** Numéro croissant à chaque publication : l'app refuse un catalogue plus ancien que le sien. */
  version: z.number().int().min(1),
  generatedAt: z.iso.datetime(),
  games: z.array(catalogEntrySchema),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type Catalog = z.infer<typeof catalogSchema>;
