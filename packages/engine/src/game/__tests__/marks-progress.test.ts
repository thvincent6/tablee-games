import { definition, skullKingLike, specDefinition, tarotLike } from '../../__fixtures__/games';
import { specExample } from '../../__fixtures__/specs';

import {
  computeMarks,
  computeTotals,
  createGame,
  endGoal,
  markRound,
  ScoringError,
  type RoundInputs,
} from '..';

const skyjoRound = (...players: [number, boolean][]): RoundInputs => ({
  players: players.map(([points, finisher]) => ({ points, finisher })),
});

/** Skyjo des specs, avec la marque « ×2 » du finisseur doublé. */
function skyjoWithMarks(marks?: unknown, end?: string) {
  const json = structuredClone(specExample('Skyjo')) as Record<string, any>;
  json.scoring.vars = {
    doubled: 'opt.double and finisher and points > 0 and points >= min(others.points)',
  };
  json.scoring.score = 'doubled ? points * 2 : points';
  json.scoring.marks = marks ?? [{ when: 'doubled', label: '×2' }];
  if (end !== undefined) json.end = end;
  return definition(json);
}

describe('marques', () => {
  it('marque le finisseur doublé, et lui seul', () => {
    const game = createGame(skyjoWithMarks(), { players: 3 });
    expect(markRound(game, skyjoRound([10, true], [5, false], [30, false]), [0, 0, 0], 1)).toEqual([
      ['×2'],
      [],
      [],
    ]);
    expect(markRound(game, skyjoRound([2, true], [5, false], [30, false]), [0, 0, 0], 1)).toEqual([
      [],
      [],
      [],
    ]);
  });

  it('évalue toutes les marques, dans l’ordre du JSON', () => {
    const game = createGame(
      skyjoWithMarks([
        { when: 'points >= 30', label: 'Lourd' },
        { when: 'doubled', label: '×2' },
      ]),
      { players: 2 },
    );
    expect(markRound(game, skyjoRound([40, true], [5, false]), [0, 0], 1)).toEqual([
      ['Lourd', '×2'],
      [],
    ]);
  });

  it('suit les totaux de chaque manche', () => {
    const game = createGame(skyjoWithMarks([{ when: 'max(totals) >= 20', label: 'Tard' }]), {
      players: 2,
    });
    const rounds = [skyjoRound([25, true], [5, false]), skyjoRound([1, true], [5, false])];
    expect(computeMarks(game, rounds, computeTotals(game, rounds))).toEqual([
      [[], []],
      [['Tard'], ['Tard']],
    ]);
  });

  it('aucune marque sans scoring.marks', () => {
    const game = createGame(skullKingLike(), { players: 2 });
    const round = {
      players: [
        { bid: 1, tricks: 1, bonus: 0 },
        { bid: 0, tricks: 0, bonus: 0 },
      ],
    };
    expect(markRound(game, round, [0, 0], 1)).toEqual([[], []]);
    expect(computeMarks(game, [], computeTotals(game, []))).toEqual([]);
  });

  it('signale une marque qui ne donne pas vrai ou faux', () => {
    const game = createGame(skyjoWithMarks([{ when: 'points', label: '?' }]), { players: 2 });
    expect(() => markRound(game, skyjoRound([3, true], [5, false]), [0, 0], 1)).toThrow(
      new ScoringError('scoring.marks[0].when', 'la formule doit donner vrai ou faux', 0),
    );
  });

  it('signale une erreur d’évaluation, dans la marque ou ses variables', () => {
    const division = createGame(skyjoWithMarks([{ when: '1 / (points - 3) > 0', label: '?' }]), {
      players: 2,
    });
    expect(() => markRound(division, skyjoRound([3, true], [5, false]), [0, 0], 1)).toThrow(
      ScoringError,
    );

    const json = structuredClone(specExample('Skyjo')) as Record<string, any>;
    json.scoring.vars = { ratio: '10 / points' };
    json.scoring.score = 'points';
    json.scoring.marks = [{ when: 'ratio > 1', label: '?' }];
    const vars = createGame(definition(json), { players: 2 });
    expect(() => markRound(vars, skyjoRound([0, true], [5, false]), [0, 0], 1)).toThrow(
      expect.objectContaining({ formula: 'scoring.vars.ratio', participant: 0 }),
    );
  });
});

describe('objectif de fin', () => {
  const goal = (end: string, options = {}) =>
    endGoal(createGame(skyjoWithMarks(undefined, end), { players: 2, options }));

  it('lit un seuil de points, options comprises', () => {
    expect(goal('max(totals) >= opt.threshold')).toEqual({ kind: 'points', target: 100 });
    expect(goal('max(totals) >= opt.threshold', { threshold: 150 })).toEqual({
      kind: 'points',
      target: 150,
    });
    expect(goal('opt.threshold <= max(totals)')).toEqual({ kind: 'points', target: 100 });
    expect(goal('max(totals) > 99')).toEqual({ kind: 'points', target: 100 });
  });

  it('lit un nombre de manches', () => {
    expect(goal('round >= 10')).toEqual({ kind: 'rounds', target: 10 });
    expect(goal('round > 4 * 2')).toEqual({ kind: 'rounds', target: 9 });
    expect(goal('12 < round')).toEqual({ kind: 'rounds', target: 13 });
  });

  it('ne devine rien d’une autre forme de fin', () => {
    for (const end of [
      'min(totals) >= 100',
      'max(totals) >= round * 10',
      'max(totals) == 100',
      'round >= 10 or max(totals) >= 100',
      'max(totals) >= 1 / 0',
      'max(totals, 3) >= 100',
      'max(round) >= 100',
      'sum(totals) >= 100',
    ]) {
      expect(goal(end)).toBeNull();
    }
  });

  it('rien pour une fin manuelle ou une grille', () => {
    expect(endGoal(createGame(tarotLike(), { players: 4 }))).toBeNull();
    expect(endGoal(createGame(specDefinition('Yams'), { players: 2 }))).toBeNull();
  });
});
