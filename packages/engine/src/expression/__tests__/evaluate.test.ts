import {
  clearCompileCache,
  compile,
  COMPILE_CACHE_SIZE,
  evaluate,
  EvaluationError,
  ExpressionError,
  MAX_STEPS,
  StepBudget,
  type Environment,
  type Value,
} from '..';

const env: Environment = {
  points: 12,
  finisher: true,
  belote: 'taker',
  contract: 80,
  round: 3,
  totals: [40, 95, 12],
  others: { points: [8, -2], finisher: [false, false] },
  all: { points: [12, 8, -2], finisher: [true, false, false] },
  opt: { threshold: 100, double: true },
};

const run = (source: string, environment: Environment = env) => evaluate(source, environment);

function failure(source: string, environment: Environment = env): EvaluationError {
  try {
    evaluate(source, environment);
  } catch (error) {
    if (error instanceof EvaluationError) return error;
    throw error;
  }
  throw new Error(`« ${source} » aurait dû échouer`);
}

describe('valeurs et contexte', () => {
  it.each<[string, Value]>([
    ['42', 42],
    ['2.5', 2.5],
    ['true', true],
    ["'taker'", 'taker'],
    ['points', 12],
    ['opt.threshold', 100],
    ['others.points', [8, -2]],
    ['totals', [40, 95, 12]],
    ['round', 3],
  ])('%s → %p', (source, expected) => {
    expect(run(source)).toEqual(expected);
  });

  it('nomme une variable inconnue', () => {
    expect(failure('points + bonus').message).toBe('variable inconnue « bonus » (caractère 10)');
    expect(failure('opt.seuil * 2').message).toBe('variable inconnue « opt.seuil » (caractère 1)');
    expect(failure('others.mise').reason).toBe('variable inconnue « others.mise »');
  });

  it('refuse un groupe utilisé comme valeur, ou un champ d’une valeur', () => {
    expect(failure('opt + 1').reason).toBe(
      '« opt » est un groupe : préciser un champ (threshold, double)',
    );
    expect(failure('points.x').reason).toBe('« points » n’a pas de champ « x »');
    expect(failure('a', { a: {} }).reason).toBe('« a » est un groupe : préciser un champ');
  });

  it('ignore les propriétés héritées des objets JavaScript', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(failure(name).reason).toBe(`variable inconnue « ${name} »`);
      expect(failure(`opt.${name}`).reason).toBe(`variable inconnue « opt.${name} »`);
    }
  });

  it('ne modifie jamais le contexte', () => {
    const frozen = Object.freeze({ points: 3, opt: Object.freeze({ threshold: 10 }) });
    expect(run('points * 2 + opt.threshold', frozen)).toBe(16);
  });
});

describe('opérateurs', () => {
  it.each<[string, Value]>([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 - 4 - 3', 3],
    ['7 / 2', 3.5],
    ['7 % 3', 1],
    ['-7 % 3', -1],
    ['-points', -12],
    ['- -points', 12],
    ['points > 10', true],
    ['points >= 12', true],
    ['points < 12', false],
    ['points <= 11', false],
    ['points == 12', true],
    ['points != 12', false],
    ["belote == 'taker'", true],
    ["belote != 'defense'", true],
    ["contract == 'capot'", false],
    ['finisher == true', true],
    ['not finisher', false],
    ['finisher and points > 0', true],
    ['not finisher or points > 100', false],
    ['points > 0 ? points * 2 : points', 24],
    ["contract == 'capot' ? 0 : contract", 80],
    ['0.1 + 0.2 == 0.30000000000000004', true],
  ])('%s → %p', (source, expected) => {
    expect(run(source)).toEqual(expected);
  });

  it('court-circuite and et or', () => {
    // La partie droite échouerait si elle était évaluée.
    expect(run('false and inconnue > 0')).toBe(false);
    expect(run('true or inconnue > 0')).toBe(true);
    expect(run('true ? 1 : inconnue')).toBe(1);
  });

  it.each([
    ['points + true', '« + » attend un nombre, reçu un booléen (caractère 10)'],
    ["'a' + 1", '« + » attend un nombre, reçu un texte (caractère 1)'],
    ['totals * 2', '« * » attend un nombre, reçu une liste (caractère 1)'],
    ["points < 'x'", '« < » attend un nombre, reçu un texte (caractère 10)'],
    ['-finisher', '« - » attend un nombre, reçu un booléen (caractère 2)'],
    ['not points', '« not » attend un booléen, reçu un nombre (caractère 5)'],
    ['points and true', '« and » attend un booléen, reçu un nombre (caractère 1)'],
    ['finisher and 1', '« and » attend un booléen, reçu un nombre (caractère 14)'],
    ['false or 1', '« or » attend un booléen, reçu un nombre (caractère 10)'],
    ['points ? 1 : 2', 'la condition du ternaire attend un booléen, reçu un nombre (caractère 1)'],
    ['totals == totals', '« == » ne compare pas une liste (caractère 1)'],
    ['1 != totals', '« != » ne compare pas une liste (caractère 6)'],
    ['points / 0', 'division par zéro (caractère 10)'],
    ['points % (2 - 2)', 'division par zéro (caractère 11)'],
    ['1e3', 'nombre mal formé'],
  ])('%s → %s', (source, message) => {
    if (message === 'nombre mal formé') {
      expect(() => run(source)).toThrow(ExpressionError);
      return;
    }
    expect(failure(source).message).toBe(message);
  });

  it('ne renvoie jamais Infinity ni NaN', () => {
    const big = '9'.repeat(300);
    expect(failure(`${big} * ${big}`).reason).toBe('résultat hors limites');
    expect(failure(`${big} * ${big} - ${big} * ${big}`).reason).toBe('résultat hors limites');
  });
});

describe('fonctions', () => {
  it.each<[string, Value]>([
    ['min(3, 1, 2)', 1],
    ['max(3, 1, 2)', 3],
    ['min(others.points)', -2],
    ['max(points, others.points)', 12],
    ['max(totals) >= opt.threshold', false],
    ['abs(-4)', 4],
    ['floor(2.7)', 2],
    ['floor(-2.5)', -3],
    ['ceil(2.1)', 3],
    ['sum(all.points)', 18],
    ['sum(1, 2, others.points)', 9],
    ['sum(totals)', 147],
    ['count(all.finisher)', 1],
    ['count(others.finisher)', 0],
    ['count(all.points)', 3],
    ['round(190, 10)', 190],
    ['round(52, 10)', 50],
    ['round(45, 10)', 50],
    ['round(44.9, 10)', 40],
    ['round(-45, 10)', -40],
    ['round(2.5)', 3],
    ['round(0.15, 0.1)', 0.2],
    ['round(1234, 100)', 1200],
  ])('%s → %p', (source, expected) => {
    expect(run(source)).toEqual(expected);
  });

  it.each([
    ['min(totals, true)', 'min() attend des nombres, reçu un booléen (caractère 1)'],
    ['sum(all.finisher)', 'sum() attend des nombres, reçu un booléen (caractère 1)'],
    ["abs('x')", 'abs() attend un nombre, reçu un texte (caractère 1)'],
    ['floor(totals)', 'floor() attend un nombre, reçu une liste (caractère 1)'],
    ['round(3, true)', 'round() attend un pas numérique, reçu un booléen (caractère 1)'],
    ['round(3, 0)', 'round() attend un pas positif (caractère 1)'],
    ['min(empty)', 'min() d’une liste vide (caractère 1)'],
    ['max(empty)', 'max() d’une liste vide (caractère 1)'],
  ])('%s → %s', (source, message) => {
    expect(failure(source, { ...env, empty: [] }).message).toBe(message);
  });

  it('accepte sum et count sur une liste vide', () => {
    expect(run('sum(empty) + count(empty)', { empty: [] })).toBe(0);
  });

  it.each([
    [
      'foo(1)',
      /^fonction inconnue « foo » \(autorisées : min, max, abs, floor, ceil, sum, count, round\) \(caractère 1\)$/,
    ],
    ['eval(1)', /^fonction inconnue « eval »/],
    ['constructor(1)', /^fonction inconnue « constructor »/],
    ['abs()', /^abs\(\) attend 1 argument, reçu 0 \(caractère 1\)$/],
    ['abs(1, 2)', /^abs\(\) attend 1 argument, reçu 2/],
    ['min()', /^min\(\) attend au moins 1 arguments?, reçu 0/],
    ['round(1, 2, 3)', /^round\(\) attend 1 ou 2 arguments, reçu 3/],
  ])('refuse %s dès la compilation', (source, message) => {
    expect(() => compile(source)).toThrow(ExpressionError);
    expect(() => compile(source)).toThrow(message);
  });
});

describe('plafond d’étapes', () => {
  // La pire formule possible : 2 000 caractères de sommes de listes.
  const pathological = Array(132)
    .fill('sum(all.big)')
    .join('+')
    .slice(0, 2000)
    .replace(/\+?[^+]*$/, '');
  const big = { all: { big: Array.from({ length: 1000 }, (_, i) => i) } };

  it('arrête une expression pathologique au plafond', () => {
    expect(pathological.length).toBeLessThanOrEqual(2000);
    const error = failure(pathological, big);
    expect(error.reason).toBe(`calcul trop long : plus de ${MAX_STEPS} étapes`);
  });

  it('compte les nœuds visités et les éléments de listes parcourus', () => {
    const budget = new StepBudget();
    evaluate('1 + 2', {}, { budget });
    expect(budget.spent).toBe(3);
    evaluate('sum(all.big)', big, { budget });
    expect(budget.spent).toBe(3 + 2 + 1000);
  });

  it('partage un budget entre plusieurs évaluations', () => {
    const budget = new StepBudget(8);
    evaluate('1 + 2 + 3', {}, { budget }); // 5 étapes
    expect(() => evaluate('1 + 2 + 3', {}, { budget })).toThrow(
      'calcul trop long : plus de 8 étapes',
    );
  });
});

describe('compilation', () => {
  beforeEach(clearCompileCache);

  it('analyse une formule une seule fois', () => {
    const first = compile('points * 2');
    expect(compile('points * 2')).toBe(first);
    expect(evaluate(first, env)).toBe(24);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('liste les noms de premier niveau utilisés', () => {
    expect([
      ...compile('opt.double and min(others.points) < points ? round : 0').references,
    ]).toEqual(['opt', 'others', 'points', 'round']);
  });

  it('liste les identifiants complets avec leur position', () => {
    expect(
      compile('opt.threshold - others.points').identifiers.map((n) => [n.path.join('.'), n.pos]),
    ).toEqual([
      ['opt.threshold', 0],
      ['others.points', 16],
    ]);
  });

  it(`borne le cache à ${COMPILE_CACHE_SIZE} formules`, () => {
    const first = compile('0');
    for (let i = 1; i <= COMPILE_CACHE_SIZE; i++) compile(String(i));
    expect(compile('0')).not.toBe(first);
  });
});
