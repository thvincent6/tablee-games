import {
  ExpressionError,
  MAX_EXPRESSION_LENGTH,
  MAX_NESTING_DEPTH,
  parse,
  printExpression,
  tokenize,
} from '..';

/** Forme entièrement parenthésée de la formule analysée. */
const shape = (source: string) => printExpression(parse(source));

/** Message complet de l'erreur levée par l'analyse. */
function errorOf(source: string): ExpressionError {
  try {
    parse(source);
  } catch (error) {
    if (error instanceof ExpressionError) return error;
    throw error;
  }
  throw new Error(`« ${source} » aurait dû être refusée`);
}

describe('valeurs', () => {
  it('lit nombres, booléens, chaînes et identifiants', () => {
    expect(parse('42')).toEqual({ kind: 'number', value: 42, pos: 0 });
    expect(parse('  3.25')).toEqual({ kind: 'number', value: 3.25, pos: 2 });
    expect(parse('true')).toEqual({ kind: 'boolean', value: true, pos: 0 });
    expect(parse('false')).toEqual({ kind: 'boolean', value: false, pos: 0 });
    expect(parse("'défense'")).toEqual({ kind: 'string', value: 'défense', pos: 0 });
    expect(parse("''")).toEqual({ kind: 'string', value: '', pos: 0 });
    expect(parse('points')).toEqual({ kind: 'identifier', path: ['points'], pos: 0 });
  });

  it('lit les accès par point', () => {
    expect(parse('opt.threshold')).toEqual({
      kind: 'identifier',
      path: ['opt', 'threshold'],
      pos: 0,
    });
    expect(shape('others.points + all.points')).toBe('(others.points + all.points)');
  });

  it('lit les appels de fonction', () => {
    expect(shape('min(others.points)')).toBe('min(others.points)');
    expect(shape('round(takerPts + 5, 10)')).toBe('round((takerPts + 5), 10)');
    expect(shape('count()')).toBe('count()');
    expect(shape('max(1, min(2, 3), abs(-4))')).toBe('max(1, min(2, 3), abs((-4)))');
    // `round` est aussi le numéro de manche : sans parenthèse, c'est un identifiant.
    expect(shape('round + 1')).toBe('(round + 1)');
  });

  it('ignore les espaces, tabulations et retours à la ligne', () => {
    expect(shape(' a\n+\tb ')).toBe('(a + b)');
  });
});

describe('priorités', () => {
  it.each([
    ['1 + 2 * 3', '(1 + (2 * 3))'],
    ['(1 + 2) * 3', '((1 + 2) * 3)'],
    ['1 - 2 - 3', '((1 - 2) - 3)'],
    ['8 / 4 / 2', '((8 / 4) / 2)'],
    ['7 % 3 * 2', '((7 % 3) * 2)'],
    ['-a * b', '((-a) * b)'],
    ['- -a', '(-(-a))'],
    ['a - -b', '(a - (-b))'],
    ['a or b and c', '(a or (b and c))'],
    ['a and b or c and d', '((a and b) or (c and d))'],
    ['not a and b', '((not a) and b)'],
    ['not a == b', '(not (a == b))'],
    ['not not a', '(not (not a))'],
    ['a + 1 > b * 2', '((a + 1) > (b * 2))'],
    ['a < b == c < d', '((a < b) == (c < d))'],
    ['a > 0 and b <= 3 or c != 2', '(((a > 0) and (b <= 3)) or (c != 2))'],
    ['x + y >= c and x > d', '(((x + y) >= c) and (x > d))'],
  ])('%s → %s', (source, expected) => {
    expect(shape(source)).toBe(expected);
  });

  describe('ternaire', () => {
    it.each([
      ['a ? b : c', '(a ? b : c)'],
      ['a ? b : c ? d : e', '(a ? b : (c ? d : e))'],
      ['a ? b ? c : d : e', '(a ? (b ? c : d) : e)'],
      ['a ? b : c ? d : e ? f : g', '(a ? b : (c ? d : (e ? f : g)))'],
      ['a or b ? 1 + 2 : 3', '((a or b) ? (1 + 2) : 3)'],
      ['(a ? b : c) + 1', '((a ? b : c) + 1)'],
      ['a ? (b ? c : d) : e', '(a ? (b ? c : d) : e)'],
    ])('%s → %s', (source, expected) => {
      expect(shape(source)).toBe(expected);
    });
  });

  it('garde la position du début de chaque nœud', () => {
    expect(parse('a + b * c')).toMatchObject({
      kind: 'binary',
      pos: 0,
      right: { kind: 'binary', pos: 4, left: { pos: 4 }, right: { pos: 8 } },
    });
  });
});

describe('erreurs', () => {
  it.each([
    // jetons inconnus
    ['a # b', 'jeton inconnu « # » (caractère 3)'],
    ['points × 2', 'jeton inconnu « × » (caractère 8)'],
    ['a && b', '« && » inconnu : écrire and (caractère 3)'],
    ['a || b', '« || » inconnu : écrire or (caractère 3)'],
    ['!a', '« ! » inconnu : écrire not (caractère 1)'],
    ['a = 1', '« = » inconnu : écrire == pour comparer (caractère 3)'],
    ['"taker"', "les chaînes s’écrivent entre apostrophes : 'texte' (caractère 1)"],
    ["belote == 'taker", 'chaîne non terminée : apostrophe fermante attendue (caractère 11)'],
    ['2x', 'nombre mal formé « 2x » (caractère 1)'],
    ['1.2.3', 'nombre mal formé « 1.2.3 » (caractère 1)'],
    // parenthèses
    ['(takerPts + belT', 'parenthèse fermante attendue (caractère 17)'],
    ['max(a, b', 'parenthèse fermante attendue (caractère 9)'],
    ['round(takerPts + 5 10)', 'parenthèse fermante attendue (caractère 20)'],
    ['a + b)', 'parenthèse fermante en trop (caractère 6)'],
    ['()', 'valeur attendue, « ) » trouvé (caractère 2)'],
    // structure
    ['', 'formule vide (caractère 1)'],
    ['   ', 'formule vide (caractère 4)'],
    ['1 +', 'valeur attendue, fin de formule trouvé (caractère 4)'],
    ['* 2', 'valeur attendue, « * » trouvé (caractère 1)'],
    ['a b', 'opérateur attendu avant « b » (caractère 3)'],
    ["a 'x'", "opérateur attendu avant « 'x' » (caractère 3)"],
    ['a ? b', '« : » attendu dans le ternaire, fin de formule trouvé (caractère 6)'],
    ['a ? b c', '« : » attendu dans le ternaire, « c » trouvé (caractère 7)'],
    ['opt.', 'nom attendu après « . », fin de formule trouvé (caractère 5)'],
    ['opt.2', 'nom attendu après « . », « 2 » trouvé (caractère 5)'],
    ['max(a,)', 'valeur attendue, « ) » trouvé (caractère 7)'],
    ['a and', 'valeur attendue, fin de formule trouvé (caractère 6)'],
    [
      'a < b < c',
      'comparaisons enchaînées : écrire par exemple a < b and b < c, ou ajouter des parenthèses (caractère 7)',
    ],
    [
      'a == b != c',
      'comparaisons enchaînées : écrire par exemple a < b and b < c, ou ajouter des parenthèses (caractère 8)',
    ],
  ])('« %s » → %s', (source, message) => {
    expect(errorOf(source).message).toBe(message);
  });

  it('expose la raison et la position séparément', () => {
    const error = errorOf('(a + b');
    expect(error.reason).toBe('parenthèse fermante attendue');
    expect(error.position).toBe(7);
    expect(error.name).toBe('ExpressionError');
  });

  it('compte les positions en caractères, accents et emojis compris', () => {
    expect(errorOf("'été' # 1").position).toBe(7);
    expect(errorOf("'🂡' # 1").position).toBe(5);
  });
});

describe('limites', () => {
  it(`accepte ${MAX_EXPRESSION_LENGTH} caractères et refuse au-delà`, () => {
    const atLimit = ('1' + ' + 1'.repeat(499)).padEnd(MAX_EXPRESSION_LENGTH);
    expect(atLimit).toHaveLength(MAX_EXPRESSION_LENGTH);
    expect(() => parse(atLimit)).not.toThrow();
    expect(errorOf(atLimit + '1').message).toBe(
      'formule trop longue : 2001 caractères, 2000 au plus (caractère 2001)',
    );
  });

  const parens = (n: number) => '('.repeat(n) + '1' + ')'.repeat(n);

  it(`accepte ${MAX_NESTING_DEPTH} niveaux d’imbrication et refuse au-delà`, () => {
    // La formule elle-même compte pour un niveau.
    expect(() => parse(parens(MAX_NESTING_DEPTH - 1))).not.toThrow();
    expect(errorOf(parens(MAX_NESTING_DEPTH)).message).toBe(
      `imbrication trop profonde : 32 niveaux au plus (caractère ${MAX_NESTING_DEPTH})`,
    );
  });

  it.each([
    ['appels', (n: number) => 'abs('.repeat(n) + '1' + ')'.repeat(n)],
    ['opposés', (n: number) => '-'.repeat(n) + '1'],
    ['négations', (n: number) => 'not '.repeat(n) + 'a'],
    ['ternaires', (n: number) => 'a ? '.repeat(n) + '1' + ' : 2'.repeat(n)],
  ])('compte aussi les %s', (_label, build) => {
    expect(() => parse(build(MAX_NESTING_DEPTH - 1))).not.toThrow();
    expect(errorOf(build(MAX_NESTING_DEPTH)).reason).toBe(
      'imbrication trop profonde : 32 niveaux au plus',
    );
  });

  it('refuse une imbrication démesurée sans dépasser la pile', () => {
    expect(errorOf(parens(900)).reason).toMatch(/^imbrication trop profonde/);
  });

  it('accepte une longue suite plate d’opérations', () => {
    const flat = Array(500).fill('a').join(' + ');
    expect(() => parse(flat)).not.toThrow();
  });
});

describe('tokenize', () => {
  it('distingue mots réservés, identifiants et opérateurs à deux caractères', () => {
    expect(tokenize('not x <= 2').map((t) => [t.type, t.text])).toEqual([
      ['keyword', 'not'],
      ['identifier', 'x'],
      ['operator', '<='],
      ['number', '2'],
      ['end', ''],
    ]);
  });
});
