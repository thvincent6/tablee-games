import { definition } from '../../__fixtures__/games';
import { specExample } from '../../__fixtures__/specs';
import { validateGameDefinition } from '../../definition';
import { parseTemplate } from '../../expression';

import { createGame, describeRound, ScoringError } from '..';

/** Tarot simplifié, avec contrats nommés et phrases de résultat. */
const tarot = (describe: unknown[]) =>
  definition({
    id: 'tarot-phrases',
    name: 'Tarot (phrases)',
    version: '1.0.0',
    engine: 1,
    archetype: 'contract',
    players: { min: 4, max: 4 },
    winner: 'highest',
    inputs: {
      round: [
        {
          key: 'contract',
          label: 'Contrat',
          type: 'enum',
          values: [1, 2, 4, 6],
          labels: ['Prise', 'Garde', 'Garde sans', 'Garde contre'],
        },
        { key: 'bouts', label: 'Bouts', type: 'pick', values: [0, 1, 2, 3] },
        { key: 'points', label: 'Points du preneur', type: 'int', min: 0, max: 91 },
        { key: 'chelem', label: 'Chelem', type: 'bool' },
      ],
    },
    scoring: {
      scope: 'role',
      vars: {
        threshold: 'bouts == 3 ? 36 : bouts == 2 ? 41 : bouts == 1 ? 51 : 56',
        margin: 'abs(points - threshold)',
        made: 'points >= threshold',
        score: '(25 + margin) * contract * (made ? 1 : -1)',
      },
      taker: '3 * score',
      defense: '-score',
      describe,
    },
  });

const sentences = [
  { when: 'made', text: '{contract} réussie de {margin}' },
  { when: 'not made', text: '{contract} chutée de {margin} ({points} / {threshold})' },
];
const round = (contract: number, bouts: number, points: number) => ({
  round: { contract, bouts, points, chelem: false },
  taker: 0,
});

describe('phrases de résultat', () => {
  const game = createGame(tarot(sentences), { players: 4 });

  it('prend la première phrase dont la condition est vraie', () => {
    expect(describeRound(game, round(2, 2, 47), [0, 0, 0, 0], 1)).toBe('Garde réussie de 6');
    expect(describeRound(game, round(4, 1, 40), [0, 0, 0, 0], 1)).toBe(
      'Garde sans chutée de 11 (40 / 51)',
    );
  });

  it('rien sans phrase, ou si aucune ne s’applique', () => {
    expect(
      describeRound(createGame(tarot([]), { players: 4 }), round(2, 2, 47), [0, 0, 0, 0], 1),
    ).toBeNull();
    const only = createGame(tarot([{ when: 'made', text: 'Réussi' }]), { players: 4 });
    expect(describeRound(only, round(1, 0, 10), [0, 0, 0, 0], 1)).toBeNull();
  });

  it('affiche booléens, listes et valeurs sans libellé', () => {
    const game = createGame(tarot([{ when: 'true', text: '{chelem} · {bouts} · {totals}' }]), {
      players: 4,
    });
    expect(describeRound(game, round(2, 3, 50), [1, 2, 3, 4], 1)).toBe('non · 3 · 1, 2, 3, 4');
  });

  it('signale une condition qui ne donne pas vrai ou faux, ou une formule en erreur', () => {
    const notBool = createGame(tarot([{ when: 'points', text: 'x' }]), { players: 4 });
    expect(() => describeRound(notBool, round(2, 2, 47), [0, 0, 0, 0], 1)).toThrow(
      new ScoringError('scoring.describe[0].when', 'la formule doit donner vrai ou faux'),
    );
    const broken = createGame(tarot([{ when: 'true', text: '{1 / (points - 47)}' }]), {
      players: 4,
    });
    expect(() => describeRound(broken, round(2, 2, 47), [0, 0, 0, 0], 1)).toThrow(ScoringError);
  });

  it('signale une variable en erreur', () => {
    const json = structuredClone(tarot(sentences)) as Record<string, any>;
    json.scoring.vars.ratio = '10 / (points - 47)';
    const game = createGame(definition(json), { players: 4 });
    expect(() => describeRound(game, round(2, 2, 47), [0, 0, 0, 0], 1)).toThrow(
      expect.objectContaining({ formula: 'scoring.vars.ratio' }),
    );
  });
});

describe('découpage des phrases', () => {
  it('sépare le texte et les formules', () => {
    expect(parseTemplate('{a} et {b + 1}!')).toEqual([
      { formula: 'a', position: 1 },
      { text: ' et ' },
      { formula: 'b + 1', position: 8 },
      { text: '!' },
    ]);
    expect(parseTemplate('Sans formule')).toEqual([{ text: 'Sans formule' }]);
  });

  it('refuse les accolades mal formées', () => {
    expect(() => parseTemplate('{a')).toThrow('accolade ouvrante sans fermante (caractère 1)');
    expect(() => parseTemplate('a}')).toThrow('accolade fermante sans ouvrante (caractère 2)');
    expect(() => parseTemplate('x { }')).toThrow('formule vide entre accolades (caractère 3)');
  });
});

describe('validation des définitions', () => {
  const errors = (mutate: (d: Record<string, any>) => void, base = tarot(sentences)) => {
    const json = structuredClone(base) as Record<string, any>;
    mutate(json);
    const result = validateGameDefinition(json);
    return result.ok ? [] : result.errors;
  };

  it('vérifie les formules des phrases', () => {
    expect(errors(() => {})).toEqual([]);
    expect(
      errors((d) => (d.scoring.describe = [{ when: 'made', text: '{contrat} réussie' }])),
    ).toEqual([
      {
        code: 'UNKNOWN_VARIABLE',
        path: 'scoring.describe[0].text',
        message: 'variable inconnue « contrat » (caractère 1)',
      },
    ]);
    expect(errors((d) => (d.scoring.describe = [{ when: 'made', text: '{margin' }]))).toEqual([
      {
        code: 'FORMULA',
        path: 'scoring.describe[0].text',
        message: 'accolade ouvrante sans fermante (caractère 1)',
      },
    ]);
    expect(errors((d) => (d.scoring.describe = [{ when: 'reussi', text: 'x' }]))).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_VARIABLE', path: 'scoring.describe[0].when' }),
    ]);
  });

  it('réserve les phrases à la portée role', () => {
    expect(
      errors(
        (d) => (d.scoring.describe = [{ when: 'true', text: 'x' }]),
        specExample('Skyjo') as never,
      ),
    ).toEqual([
      {
        code: 'INCONSISTENT',
        path: 'scoring.describe',
        message: 'les phrases de résultat n’existent que pour la portée role (jeux à contrat)',
      },
    ]);
  });

  it('vérifie la saisie complémentaire', () => {
    const coinche = specExample('Coinche') as Record<string, any>;
    const withComplement = (field: string) =>
      errors((d) => (d.inputs.round[2].complement = { field, total: 162 }), coinche as never);
    expect(withComplement('defensePts')).toEqual([]);
    const message = (key: string) => [
      {
        code: 'INCONSISTENT',
        path: 'inputs.round[2].complement.field',
        message: `« ${key} » doit être une autre saisie entière du même groupe`,
      },
    ];
    expect(withComplement('belote')).toEqual(message('belote'));
    expect(withComplement('inconnu')).toEqual(message('inconnu'));
    expect(withComplement('takerPts')).toEqual(message('takerPts'));
  });
});
