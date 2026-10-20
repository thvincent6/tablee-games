import fs from 'node:fs';
import path from 'node:path';

import { definition } from '../../__fixtures__/games';
import { specExample } from '../../__fixtures__/specs';
import { parseGameDefinition, validateGameDefinition } from '../../definition';
import { runDefinitionTests } from '../../testing';

import { createGame, describeRound, scoreRound, ScoringError } from '..';

const tarotFile = path.join(__dirname, '../../../../../games/tarot-4/1.0.0.json');
const parsed = parseGameDefinition(fs.readFileSync(tarotFile, 'utf8'));
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
const tarot = createGame(parsed.definition, { players: 4 });

describe('somme nulle', () => {
  it('Tarot à 4 : chaque donne possible s’annule, quel que soit le preneur', () => {
    let checked = 0;
    for (const contract of [1, 2, 4, 6])
      for (const bouts of [0, 1, 2, 3])
        for (let points = 0; points <= 91; points += 3)
          for (const petit of ['none', 'taker', 'defense'])
            for (const poignee of [0, 20, 30, 40])
              for (const chelem of ['none', 'announced', 'unannounced', 'failed']) {
                const taker = checked % 4;
                const scores = scoreRound(
                  tarot,
                  { round: { contract, bouts, points, petit, poignee, chelem }, taker },
                  [0, 0, 0, 0],
                  1,
                );
                expect(scores.reduce((a, b) => a + b, 0)).toBe(0);
                checked++;
              }
    expect(checked).toBeGreaterThan(20000);
  });

  it('décrit la donne', () => {
    const round = { contract: 2, bouts: 2, points: 47, petit: 'none', poignee: 0, chelem: 'none' };
    expect(describeRound(tarot, { round, taker: 1 }, [0, 0, 0, 0], 1)).toBe('Garde réussie de 6');
  });

  it('refuse une donne dont les scores ne s’annulent pas', () => {
    const json = structuredClone(parsed.ok && parsed.definition) as Record<string, any>;
    json.scoring.defense = '-share + 1';
    delete json.tests;
    const broken = createGame(definition(json), { players: 4 });
    const round = { contract: 1, bouts: 0, points: 56, petit: 'none', poignee: 0, chelem: 'none' };
    expect(() => scoreRound(broken, { round, taker: 0 }, [0, 0, 0, 0], 1)).toThrow(
      new ScoringError('scoring.zeroSum', 'la somme des scores vaut 3 au lieu de 0'),
    );
  });

  it('games:check signale un cas de test qui ne s’annule pas', () => {
    const json = structuredClone(specExample('Skyjo')) as Record<string, any>;
    json.scoring.zeroSum = true;
    const [result] = runDefinitionTests(definition(json));
    expect(result).toMatchObject({
      status: 'error',
      reason: expect.stringContaining('la somme des scores vaut 28 au lieu de 0'),
    });
  });

  it('interdit la somme nulle à une grille', () => {
    const json = structuredClone(specExample('Yams')) as Record<string, any>;
    json.scoring.zeroSum = true;
    const result = validateGameDefinition(json);
    expect(result.ok ? [] : result.errors).toEqual([
      {
        code: 'INCONSISTENT',
        path: 'scoring.zeroSum',
        message: 'une grille ne peut pas être à somme nulle',
      },
    ]);
  });
});

describe('valeur par défaut d’une saisie', () => {
  it('doit faire partie des valeurs', () => {
    const json = structuredClone(parsed.ok && parsed.definition) as Record<string, any>;
    json.inputs.round[4].default = 25;
    json.inputs.round[1].default = 7;
    const result = validateGameDefinition(json);
    expect(result.ok ? [] : result.errors).toEqual([
      {
        code: 'INCONSISTENT',
        path: 'inputs.round[1].default',
        message: 'valeur par défaut absente de values',
      },
      {
        code: 'INCONSISTENT',
        path: 'inputs.round[4].default',
        message: 'valeur par défaut absente de values',
      },
    ]);
  });
});
