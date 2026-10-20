import { specExample, specGames, type SpecExample } from '../../__fixtures__/specs';

import { parse } from '..';

/** Mots réservés de `end` qui ne sont pas des formules. */
const endKeywords = ['grid_complete'];

type Formula = { game: string; where: string; source: string };

function formulasOf(example: SpecExample, game: string): Formula[] {
  const found: Formula[] = [];
  const add = (where: string, value: unknown) => {
    if (typeof value === 'string') found.push({ game, where, source: value });
  };
  const addAll = (where: string, record: unknown) => {
    if (record && typeof record === 'object') {
      for (const [key, value] of Object.entries(record)) add(`${where}.${key}`, value);
    }
  };

  const scoring = (example.scoring ?? {}) as Record<string, unknown>;
  const { scope: _scope, vars, marks, ...roles } = scoring;
  addAll('vars', example.vars);
  addAll('scoring.vars', vars);
  addAll('scoring', roles);
  for (const [i, mark] of ((marks ?? []) as { when: string }[]).entries()) {
    add(`scoring.marks[${i}].when`, mark.when);
  }
  add('score', example.score);
  if (!endKeywords.includes(example.end as string)) add('end', example.end);
  for (const [i, rule] of ((example.validate ?? []) as { rule: string }[]).entries()) {
    add(`validate[${i}]`, rule.rule);
  }
  return found;
}

const formulas = specGames.flatMap((game) => formulasOf(specExample(game), game));

describe('formules des specs', () => {
  it('trouve les formules des trois jeux', () => {
    const count = (game: string) => formulas.filter((f) => f.game === game).length;
    expect(count('Skyjo')).toBe(4); // vars doubled, score, marks[0].when, end
    expect(count('Yams')).toBe(3); // scoring.vars upper, bonus, score
    expect(count('Coinche')).toBe(8); // 6 vars, taker, defense
  });

  it.each(formulas.map((f) => [f.game, f.where, f.source]))(
    '%s, %s : s’analyse sans erreur',
    (_game, _where, source) => {
      expect(() => parse(source)).not.toThrow();
    },
  );
});
