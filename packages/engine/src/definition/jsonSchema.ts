import { z } from 'zod';

import { gameDefinitionSchema } from './schema';

/**
 * Schéma des définitions au format JSON Schema, publié dans `schema/game.schema.json`
 * pour les contributeurs (autocomplétion dans l'éditeur via `"$schema"`).
 * Les contrôles de cohérence (formules, variables, tests) n'y figurent pas.
 */
export function gameDefinitionJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(gameDefinitionSchema, { target: 'draft-2020-12' });
}
