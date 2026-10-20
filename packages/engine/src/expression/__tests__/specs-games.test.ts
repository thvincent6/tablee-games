import { specExample } from '../../__fixtures__/specs';

import { compile, compileVars, evaluate, evaluateVars, type Environment, type Value } from '..';

// Rejoue les cas de test des exemples des specs avec l'évaluateur seul.
// Le contexte est construit à la main ici ; le moteur de partie (S2.4) le fera pour de vrai.

type Test<I, E> = { name: string; options?: Record<string, Value>; inputs: I; expect: E };

describe('Coinche (portée par rôle)', () => {
  const coinche = specExample('Coinche');
  const scoring = coinche.scoring as {
    vars: Record<string, string>;
    taker: string;
    defense: string;
  };
  const tests = coinche.tests as Test<Record<string, Value>, { taker: number; defense: number }>[];
  const vars = compileVars(scoring.vars);

  it('a les deux cas de test des specs', () => {
    expect(tests.map((t) => t.expect)).toEqual([
      { taker: 190, defense: 50 },
      { taker: 0, defense: 250 },
    ]);
  });

  it.each(tests.map((t) => [t.name, t]))('%s', (_name, test) => {
    const scope = evaluateVars(vars, test.inputs);
    expect({
      taker: evaluate(scoring.taker, scope),
      defense: evaluate(scoring.defense, scope),
    }).toEqual(test.expect);
  });
});

describe('Skyjo (portée par joueur)', () => {
  const skyjo = specExample('Skyjo');
  const options = skyjo.options as { key: string; default: Value }[];
  const scoring = skyjo.scoring as {
    vars: Record<string, string>;
    score: string;
    marks: { when: string; label: string }[];
  };
  const vars = compileVars(scoring.vars);
  const tests = skyjo.tests as Test<Record<string, Value>[], number[]>[];

  /** Contexte du joueur `index` : ses saisies, celles des autres, celles de tous, les options. */
  function playerEnvironment(
    inputs: Record<string, Value>[],
    index: number,
    opt: Record<string, Value>,
  ): Environment {
    const keys = Object.keys(inputs[0]);
    const column = (rows: Record<string, Value>[]) =>
      Object.fromEntries(keys.map((key) => [key, rows.map((row) => row[key])]));
    return {
      ...inputs[index],
      others: column(inputs.filter((_, i) => i !== index)),
      all: column(inputs),
      opt,
    };
  }

  it.each(tests.map((t) => [t.name, t]))('%s', (_name, test) => {
    const opt = {
      ...Object.fromEntries(options.map((o) => [o.key, o.default])),
      ...test.options,
    };
    const scopes = test.inputs.map((_, i) =>
      evaluateVars(vars, playerEnvironment(test.inputs, i, opt)),
    );
    expect(scopes.map((scope) => evaluate(scoring.score, scope))).toEqual(test.expect);
    // La marque « ×2 » accompagne exactement les scores doublés.
    expect(scopes.map((scope) => evaluate(scoring.marks[0].when, scope))).toEqual(
      test.inputs.map((input, i) => test.expect[i] !== input.points),
    );
  });

  it('détecte la fin de partie', () => {
    const end = compile(skyjo.end as string);
    expect(evaluate(end, { totals: [80, 104], opt: { threshold: 100 } })).toBe(true);
    expect(evaluate(end, { totals: [80, 99], opt: { threshold: 100 } })).toBe(false);
  });
});

describe('Yams (grille)', () => {
  const yams = specExample('Yams');
  const yamsScoring = yams.scoring as { vars: Record<string, string>; score: string };
  const vars = compileVars(yamsScoring.vars);
  const grid = {
    ones: 3,
    twos: 6,
    threes: 9,
    fours: 12,
    fives: 15,
    sixes: 18,
    brelan: 20,
    carre: 0,
    full: 25,
    small: 15,
    large: 0,
    yams: 50,
    chance: 22,
  };

  it('ajoute le bonus de 35 à partir de 63 points en haut', () => {
    const scope = evaluateVars(vars, grid);
    expect(scope.upper).toBe(63);
    expect(scope.bonus).toBe(35);
    expect(evaluate(yamsScoring.score, scope)).toBe(63 + 35 + 20 + 25 + 15 + 50 + 22);
    expect(evaluateVars(vars, { ...grid, sixes: 12 }).bonus).toBe(0);
  });
});
