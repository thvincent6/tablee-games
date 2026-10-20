import type { InputField } from '../definition';
import {
  compile,
  EvaluationError,
  parseTemplate,
  evaluate,
  evaluateVars,
  StepBudget,
  VarsError,
  type Environment,
  type Value,
} from '../expression';
import { baseContext, roleContext } from './context';
import { ScoringError, varsOf } from './score';
import type { Game, RoundInputs } from './types';

/** Texte d'une valeur : le libellé d'une valeur d'énumération quand la formule est cette saisie. */
function show(value: Value, formula: string, fields: readonly InputField[]): string {
  const field = fields.find((f) => f.key === formula);
  if (field?.type === 'enum' && field.labels) {
    const index = (field.values as Value[]).indexOf(value);
    if (index >= 0) return field.labels[index];
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Résultat lisible d'une donne (portée role) : la première phrase de `scoring.describe`
 * dont la condition est vraie, formules remplacées ; null si aucune ne s'applique.
 */
export function describeRound(
  game: Game,
  inputs: RoundInputs,
  previousTotals: readonly number[],
  round: number,
): string | null {
  const sentences = game.definition.scoring?.describe ?? [];
  if (sentences.length === 0) return null;
  const budget = new StepBudget();
  const fields = game.definition.inputs?.round ?? [];

  let scope: Environment;
  try {
    scope = evaluateVars(
      varsOf(game),
      roleContext(inputs, baseContext(game, round, previousTotals)),
      { budget },
    );
  } catch (error) {
    if (error instanceof VarsError) {
      throw new ScoringError(`scoring.vars.${error.variable}`, error.reason);
    }
    throw error;
  }

  for (const [i, { when, text }] of sentences.entries()) {
    const run = (path: string, source: string) => {
      try {
        return evaluate(compile(source), scope, { budget });
      } catch (error) {
        if (error instanceof EvaluationError) throw new ScoringError(path, error.message);
        throw error;
      }
    };
    const applies = run(`scoring.describe[${i}].when`, when);
    if (typeof applies !== 'boolean') {
      throw new ScoringError(`scoring.describe[${i}].when`, 'la formule doit donner vrai ou faux');
    }
    if (!applies) continue;
    return parseTemplate(text)
      .map((part) =>
        'text' in part
          ? part.text
          : show(run(`scoring.describe[${i}].text`, part.formula), part.formula, fields),
      )
      .join('');
  }
  return null;
}
