import { compileVars, evaluateVars, StepBudget, VarsError } from '..';

describe('bloc vars', () => {
  it('évalue les variables dans l’ordre, chacune utilisant les précédentes', () => {
    const vars = compileVars({
      upper: 'ones + twos',
      bonus: 'upper >= 5 ? 35 : 0',
      total: 'upper + bonus',
    });
    expect(vars.map((v) => v.name)).toEqual(['upper', 'bonus', 'total']);
    const context = Object.freeze({ ones: 2, twos: 4 });
    const scope = evaluateVars(vars, context);
    expect(scope).toEqual({ ones: 2, twos: 4, upper: 6, bonus: 35, total: 41 });
    expect(context).toEqual({ ones: 2, twos: 4 });
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it('accepte un bloc vide', () => {
    expect(evaluateVars(compileVars({}), { a: 1 })).toEqual({ a: 1 });
  });

  it.each([
    [
      { a: 'b + 1', b: '2' },
      'variable « a » : elle utilise « b », déclarée plus loin : déplacer « b » avant',
    ],
    [{ a: 'a + 1' }, 'variable « a » : elle se référence elle-même'],
    [
      { a: 'b', b: 'a' },
      'variable « a » : elle utilise « b », déclarée plus loin : déplacer « b » avant',
    ],
    [{ a: '1 +' }, 'variable « a » : valeur attendue, fin de formule trouvé (caractère 4)'],
    [{ a: 'foo(1)' }, /^variable « a » : fonction inconnue « foo »/],
    [
      { 'mon total': '1' },
      'variable « mon total » : nom invalide : lettres, chiffres et _ uniquement, sans mot réservé',
    ],
    [
      { and: '1' },
      'variable « and » : nom invalide : lettres, chiffres et _ uniquement, sans mot réservé',
    ],
  ])('refuse %p à la compilation', (vars, message) => {
    expect(() => compileVars(vars)).toThrow(VarsError);
    expect(() => compileVars(vars)).toThrow(message);
  });

  it('précise la variable en cause quand une évaluation échoue', () => {
    const vars = compileVars({ ok: '1', ratio: 'points / ok', bad: 'inconnue * 2' });
    let error: unknown;
    try {
      evaluateVars(vars, { points: 4 });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VarsError);
    expect(error).toMatchObject({
      variable: 'bad',
      message: 'variable « bad » : variable inconnue « inconnue » (caractère 1)',
    });
  });

  it('décompte toutes les variables sur le même budget', () => {
    const vars = compileVars({ a: '1 + 1', b: 'a + 1' });
    expect(() => evaluateVars(vars, {}, { budget: new StepBudget(5) })).toThrow(
      'calcul trop long : plus de 5 étapes',
    );
  });
});
