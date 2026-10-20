import { compile, type CompiledFormula } from './compile';
import { EvaluationError, ExpressionError, VarsError } from './errors';
import { evaluate, StepBudget } from './evaluate';
import { keywords } from './lexer';
import type { Environment, Value } from './values';

/** Bloc `vars` compilé, dans l'ordre de déclaration. */
export type CompiledVars = readonly { readonly name: string; readonly formula: CompiledFormula }[];

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Compile un bloc `vars` (formules nommées, évaluées dans l'ordre).
 * Chaque formule ne peut utiliser que les variables déclarées avant elle :
 * une référence en avant ou circulaire est refusée ici, avant toute partie.
 */
export function compileVars(vars: Readonly<Record<string, string>>): CompiledVars {
  const names = Object.keys(vars);
  return names.map((name, index) => {
    if (!identifier.test(name) || (keywords as readonly string[]).includes(name)) {
      throw new VarsError(
        name,
        'nom invalide : lettres, chiffres et _ uniquement, sans mot réservé',
      );
    }
    let formula: CompiledFormula;
    try {
      formula = compile(vars[name]);
    } catch (error) {
      if (error instanceof ExpressionError) throw new VarsError(name, error.message);
      throw error;
    }
    for (const reference of formula.references) {
      const position = names.indexOf(reference);
      if (position === index) throw new VarsError(name, 'elle se référence elle-même');
      if (position > index) {
        throw new VarsError(
          name,
          `elle utilise « ${reference} », déclarée plus loin : déplacer « ${reference} » avant`,
        );
      }
    }
    return { name, formula };
  });
}

/**
 * Évalue les variables dans l'ordre et renvoie un nouveau contexte qui les contient.
 * Le contexte reçu n'est jamais modifié.
 */
export function evaluateVars(
  vars: CompiledVars,
  environment: Environment,
  { budget = new StepBudget() }: { budget?: StepBudget } = {},
): Environment {
  const values: Record<string, Value> = {};
  let scope: Environment = environment;
  for (const { name, formula } of vars) {
    try {
      values[name] = evaluate(formula, scope, { budget });
    } catch (error) {
      if (error instanceof EvaluationError) throw new VarsError(name, error.message);
      throw error;
    }
    scope = { ...environment, ...values };
  }
  return Object.freeze(scope);
}
