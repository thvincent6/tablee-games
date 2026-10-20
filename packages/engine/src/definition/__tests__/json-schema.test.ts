import fs from 'node:fs';
import path from 'node:path';

import { gameDefinitionJsonSchema } from '../jsonSchema';

// `schema/game.schema.json` doit refléter le schéma Zod. Pour le régénérer : `npm run schema:export`.

const file = path.join(__dirname, '../../../../../schema/game.schema.json');
const generated = JSON.stringify(gameDefinitionJsonSchema(), null, 2) + '\n';

if (process.env.UPDATE_SCHEMA) fs.writeFileSync(file, generated);

it('schema/game.schema.json est à jour (sinon : npm run schema:export)', () => {
  expect(fs.readFileSync(file, 'utf8')).toBe(generated);
});

it('décrit les champs principaux', () => {
  const schema = gameDefinitionJsonSchema() as {
    required: string[];
    additionalProperties: boolean;
  };
  expect(schema.required).toEqual(
    expect.arrayContaining(['id', 'name', 'version', 'engine', 'archetype', 'players', 'winner']),
  );
  expect(schema.additionalProperties).toBe(false);
});
