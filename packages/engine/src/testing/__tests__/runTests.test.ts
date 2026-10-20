import {
  definition,
  skullKingLike,
  specDefinition,
  tarotLike,
  teamGame,
} from '../../__fixtures__/games';
import { specGames } from '../../__fixtures__/specs';

import { formatScores, formatTestResults, runDefinitionTests } from '..';
import type { GameDefinition } from '../../definition';

/** Remplace les cas de test d'une définition, puis la revalide. */
const withTests = (def: GameDefinition, tests: unknown[]) => definition({ ...def, tests });

describe('runDefinitionTests', () => {
  it.each(specGames)('%s : les cas des specs passent', (game) => {
    const results = runDefinitionTests(specDefinition(game));
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => r.status !== 'passed')).toEqual([]);
  });

  it('signale un cas faux avec l’attendu et l’obtenu', () => {
    const coinche = specDefinition('Coinche');
    const tests = structuredClone(coinche.tests!);
    tests[1].expect = { taker: 0, defense: 260 };
    expect(runDefinitionTests(withTests(coinche, tests))).toEqual([
      { name: '80 demandé, 110 faits', status: 'passed', expected: { taker: 190, defense: 50 } },
      {
        name: 'Chute : défense devant',
        status: 'failed',
        expected: { taker: 0, defense: 260 },
        actual: { taker: 0, defense: 250 },
      },
    ]);
  });

  it('utilise le numéro de manche et les options du cas', () => {
    const skull = withTests(skullKingLike(), [
      {
        name: 'Mise zéro réussie en manche 3',
        round: 3,
        inputs: [
          { bid: 0, tricks: 0, bonus: 0 },
          { bid: 2, tricks: 3, bonus: 0 },
        ],
        expect: [30, -10],
      },
    ]);
    expect(runDefinitionTests(skull)).toMatchObject([{ status: 'passed' }]);

    const skyjo = specDefinition('Skyjo');
    const plain = withTests(skyjo, [
      { ...skyjo.tests![0], options: { double: false }, expect: [10, 8] },
    ]);
    expect(runDefinitionTests(plain)).toMatchObject([{ status: 'passed' }]);
  });

  it('refuse un cas dont les saisies violent une règle validate', () => {
    const skull = withTests(skullKingLike(), [
      {
        name: 'Plis incohérents',
        inputs: [
          { bid: 1, tricks: 1, bonus: 0 },
          { bid: 1, tricks: 1, bonus: 0 },
        ],
        expect: [20, 20],
      },
    ]);
    expect(runDefinitionTests(skull)).toEqual([
      {
        name: 'Plis incohérents',
        status: 'error',
        expected: [20, 20],
        reason:
          'saisies refusées : validate[0] : La somme des plis doit valoir le numéro de manche.',
      },
    ]);
  });

  it('gère la portée équipe, avec les saisies de manche répétées dans chaque entrée', () => {
    const team = withTests(teamGame(), [
      {
        name: 'Capot',
        inputs: [
          { pts: 162, capot: true },
          { pts: 0, capot: true },
        ],
        expect: [250, 0],
      },
    ]);
    expect(runDefinitionTests(team)).toMatchObject([{ status: 'passed' }]);
  });

  it('gère la portée rôle sans équipes', () => {
    const tarot = withTests(tarotLike(), [
      {
        name: 'Prise réussie',
        inputs: { points: 61, threshold: 51 },
        expect: { taker: 105, defense: -35 },
      },
    ]);
    expect(runDefinitionTests(tarot)).toMatchObject([{ status: 'passed' }]);
  });

  it('signale une erreur de calcul au lieu de planter', () => {
    const skyjo = specDefinition('Skyjo');
    const broken = definition({ ...skyjo, scoring: { score: 'points / (points - 8)' } });
    expect(runDefinitionTests(broken)[0]).toMatchObject({
      status: 'error',
      reason: 'scoring.score (participant 2) : division par zéro (caractère 11)',
    });
  });

  it('refuse des cas de test pour un compteur', () => {
    const counter = definition({
      id: 'compteur',
      name: 'Compteur',
      version: '1.0.0',
      engine: 1,
      archetype: 'counter',
      players: { min: 1, max: 4 },
      winner: 'highest',
      tests: [{ name: 'x', inputs: [{}], expect: [0] }],
    });
    expect(runDefinitionTests(counter)[0]).toMatchObject({
      status: 'error',
      reason: 'un compteur n’a pas de calcul à tester',
    });
  });

  it('ne renvoie rien sans cas de test', () => {
    expect(runDefinitionTests(withTests(specDefinition('Skyjo'), []))).toEqual([]);
  });
});

describe('rapport', () => {
  it('formate les scores', () => {
    expect(formatScores(230)).toBe('230');
    expect(formatScores([10, -30])).toBe('10 · -30');
    expect(formatScores({ taker: 190, defense: 50 })).toBe('preneur 190 · défense 50');
  });

  it('détaille les cas en échec', () => {
    expect(
      formatTestResults([
        { name: 'A', status: 'passed', expected: 1 },
        { name: 'B', status: 'failed', expected: [1, 2], actual: [1, 3] },
        { name: 'C', status: 'error', expected: 5, reason: 'saisies refusées : x' },
      ]),
    ).toEqual([
      '  ✓ A',
      '  ✗ B',
      '      attendu : 1 · 2',
      '      obtenu  : 1 · 3',
      '  ✗ C',
      '      attendu : 5',
      '      erreur  : saisies refusées : x',
    ]);
  });
});
