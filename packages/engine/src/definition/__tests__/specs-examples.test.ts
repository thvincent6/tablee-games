import { specExample, specGames } from '../../__fixtures__/specs';

import { validateGameDefinition } from '..';

describe('exemples des specs', () => {
  it.each(specGames)('%s est une définition valide', (game) => {
    const result = validateGameDefinition(specExample(game));
    expect(result.ok ? [] : result.errors).toEqual([]);
  });
});
