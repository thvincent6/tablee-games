import fs from 'node:fs';
import path from 'node:path';

import { checkGameFile } from '../../cli/check';
import { parseGameDefinition } from '../../definition';

import { computeCounterTotals, createGame, endGoal, isFinished, ScoringError } from '..';

const file = path.join(__dirname, '../../../../../games/compteur/1.0.0.json');
const text = fs.readFileSync(file, 'utf8');
const parsed = parseGameDefinition(text);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
const counter = parsed.definition;
const change = (participant: number, delta: number) => ({ change: { participant, delta } });

describe('compteur', () => {
  const game = createGame(counter, { players: 3 });

  it('additionne les changements de chaque joueur', () => {
    expect(computeCounterTotals(game, [])).toEqual([0, 0, 0]);
    expect(
      computeCounterTotals(game, [change(0, 1), change(2, 10), change(0, 1), change(2, -15)]),
    ).toEqual([2, 0, -5]);
  });

  it('refuse un changement invalide', () => {
    for (const bad of [change(3, 1), change(-1, 1), change(0.5, 1), change(0, NaN), {}]) {
      expect(() => computeCounterTotals(game, [bad])).toThrow(
        new ScoringError('change', 'changement de compteur invalide'),
      );
    }
  });

  it('fin manuelle par défaut, au seuil quand le réglage l’active', () => {
    expect(endGoal(game)).toBeNull();
    expect(isFinished(game, { totals: [500, 0, 0], rounds: 0 })).toBe(false);

    const at21 = createGame(counter, { players: 2, options: { target: 21 } });
    expect(endGoal(at21)).toEqual({ kind: 'points', target: 21 });
    expect(isFinished(at21, { totals: [20, 3], rounds: 0 })).toBe(false);
    expect(isFinished(at21, { totals: [21, 3], rounds: 0 })).toBe(true);
  });

  it('games:check accepte un compteur sans cas de test', () => {
    const check = checkGameFile('compteur/1.0.0.json', text);
    expect(check).toMatchObject({ ok: true, results: [] });
    expect(check.lines[1]).toBe('  (compteur : aucun calcul à tester)');
  });
});
