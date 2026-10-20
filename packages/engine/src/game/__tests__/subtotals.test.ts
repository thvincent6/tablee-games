import fs from 'node:fs';
import path from 'node:path';

import { definition } from '../../__fixtures__/games';
import { specExample } from '../../__fixtures__/specs';
import { parseGameDefinition, validateGameDefinition } from '../../definition';

import { computeGridSubtotals, createGame, ScoringError, subtotalPositions } from '..';

const parsed = parseGameDefinition(
  fs.readFileSync(path.join(__dirname, '../../../../../games/yams/1.0.0.json'), 'utf8'),
);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
const yams = parsed.definition;

describe('sous-totaux d’une grille', () => {
  it('se placent après la dernière case dont ils dépendent, vars comprises', () => {
    // Sous-total et bonus dépendent des six cases du haut : après « Six » (index 5).
    expect(subtotalPositions(yams)).toEqual([5, 5]);
  });

  it('se calculent pour chaque joueur, cases vides comptées 0', () => {
    const game = createGame(yams, { players: 2 });
    const full = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    expect(computeGridSubtotals(game, [full, { ones: 2 }])).toEqual([
      [63, 35],
      [2, 0],
    ]);
  });

  it('rien sans sous-totaux ; une ligne sans case va en fin de grille', () => {
    const plain = createGame(definition(specExample('Yams')), { players: 1 });
    expect(computeGridSubtotals(plain, [{}])).toEqual([[]]);
    const json = structuredClone(yams) as Record<string, any>;
    json.scoring.subtotals = [{ label: 'Constante', value: '7' }];
    expect(subtotalPositions(definition(json))).toEqual([-1]);
  });

  it('signale une valeur qui n’est pas un nombre, ou une variable en erreur', () => {
    const json = structuredClone(yams) as Record<string, any>;
    json.scoring.subtotals = [{ label: 'Vrai ?', value: 'upper > 3' }];
    expect(() => computeGridSubtotals(createGame(definition(json), { players: 1 }), [{}])).toThrow(
      new ScoringError('scoring.subtotals[0].value', 'la formule doit donner un nombre', 0),
    );
    json.scoring.subtotals = [{ label: 'Ratio', value: '10 / upper' }];
    expect(() => computeGridSubtotals(createGame(definition(json), { players: 1 }), [{}])).toThrow(
      ScoringError,
    );
    json.scoring.vars.broken = '1 / ones';
    json.scoring.subtotals = [{ label: 'x', value: 'broken' }];
    expect(() => computeGridSubtotals(createGame(definition(json), { players: 1 }), [{}])).toThrow(
      expect.objectContaining({ formula: 'scoring.vars.broken' }),
    );
  });

  it('sont réservés aux grilles et vérifiés comme les autres formules', () => {
    const skyjo = structuredClone(specExample('Skyjo')) as Record<string, any>;
    skyjo.scoring.subtotals = [{ label: 'x', value: 'points' }];
    const notGrid = validateGameDefinition(skyjo);
    expect(notGrid.ok ? [] : notGrid.errors).toEqual([
      {
        code: 'INCONSISTENT',
        path: 'scoring.subtotals',
        message: 'les sous-totaux sont réservés aux grilles',
      },
    ]);
    const json = structuredClone(yams) as Record<string, any>;
    json.scoring.subtotals = [{ label: 'x', value: 'haut' }];
    const unknown = validateGameDefinition(json);
    expect(unknown.ok ? [] : unknown.errors).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_VARIABLE', path: 'scoring.subtotals[0].value' }),
    ]);
  });
});
