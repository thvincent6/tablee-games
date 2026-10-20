import type { BinaryNode, ExpressionNode } from './ast';
import { compile, type CompiledFormula } from './compile';
import { characterPosition, EvaluationError } from './errors';
import { FunctionError, functions } from './functions';
import { isList, isValue, typeName, type Environment, type Value } from './values';

/** Plafond d'étapes d'évaluation par défaut (nœuds visités + éléments de listes parcourus). */
export const MAX_STEPS = 10_000;

/**
 * Budget d'étapes partagé entre plusieurs évaluations (un bloc `vars` puis le score, par exemple),
 * pour qu'une définition ne puisse pas bloquer l'app.
 */
export class StepBudget {
  private used = 0;
  constructor(readonly max: number = MAX_STEPS) {}

  get spent(): number {
    return this.used;
  }

  /** Décompte des étapes ; faux si le plafond est dépassé. */
  spend(steps: number): boolean {
    this.used += steps;
    return this.used <= this.max;
  }
}

export type EvaluateOptions = {
  /** Budget partagé ; par défaut un budget neuf de `MAX_STEPS`. */
  budget?: StepBudget;
};

/**
 * Évalue une formule dans un contexte en lecture seule.
 * Lève une `ExpressionError` si elle est mal écrite, une `EvaluationError` si le calcul échoue :
 * jamais de `NaN`, d'`Infinity` ni de conversion implicite.
 */
export function evaluate(
  formula: string | CompiledFormula,
  environment: Environment,
  { budget = new StepBudget() }: EvaluateOptions = {},
): Value {
  const compiled = typeof formula === 'string' ? compile(formula) : formula;
  return new Evaluator(compiled.source, environment, budget).run(compiled.ast);
}

const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

class Evaluator {
  constructor(
    private readonly source: string,
    private readonly environment: Environment,
    private readonly budget: StepBudget,
  ) {}

  run(node: ExpressionNode): Value {
    this.charge(1, node);
    switch (node.kind) {
      case 'number':
      case 'boolean':
      case 'string':
        return node.value;
      case 'identifier':
        return this.lookup(node.path, node);
      case 'unary': {
        const operand = this.run(node.operand);
        if (node.operator === 'not') return !this.boolean(operand, '« not »', node.operand);
        return -this.number(operand, '« - »', node.operand);
      }
      case 'binary':
        return this.binary(node);
      case 'conditional': {
        const test = this.boolean(this.run(node.test), 'la condition du ternaire', node.test);
        return this.run(test ? node.consequent : node.alternate);
      }
      case 'call': {
        const args = node.args.map((arg) => this.run(arg));
        try {
          return functions[node.callee].call(args, (steps) => this.charge(steps, node));
        } catch (error) {
          if (error instanceof FunctionError) throw this.error(error.message, node);
          throw error;
        }
      }
    }
  }

  private binary(node: BinaryNode): Value {
    const { operator } = node;

    if (operator === 'and' || operator === 'or') {
      // Court-circuit : `askedCapot or contract > 100` n'évalue pas la droite si inutile.
      const left = this.boolean(this.run(node.left), `« ${operator} »`, node.left);
      if (operator === 'and' ? !left : left) return left;
      return this.boolean(this.run(node.right), `« ${operator} »`, node.right);
    }

    const left = this.run(node.left);
    const right = this.run(node.right);

    if (operator === '==' || operator === '!=') {
      for (const [value, side] of [
        [left, node.left],
        [right, node.right],
      ] as const) {
        if (isList(value)) throw this.error(`« ${operator} » ne compare pas une liste`, side);
      }
      // Types différents : simplement différents (`contract == 'capot'` avec contract = 80).
      return operator === '==' ? left === right : left !== right;
    }

    const a = this.number(left, `« ${operator} »`, node.left);
    const b = this.number(right, `« ${operator} »`, node.right);
    switch (operator) {
      case '<':
        return a < b;
      case '<=':
        return a <= b;
      case '>':
        return a > b;
      case '>=':
        return a >= b;
      case '/':
      case '%':
        if (b === 0) throw this.error('division par zéro', node.right);
        return this.finite(operator === '/' ? a / b : a % b, node);
      case '+':
        return this.finite(a + b, node);
      case '-':
        return this.finite(a - b, node);
      case '*':
        return this.finite(a * b, node);
    }
  }

  private lookup(path: readonly string[], node: ExpressionNode): Value {
    let scope: Value | Environment = this.environment;
    for (const [i, name] of path.entries()) {
      const reached = path.slice(0, i + 1).join('.');
      if (isValue(scope)) {
        throw this.error(`« ${path.slice(0, i).join('.')} » n’a pas de champ « ${name} »`, node);
      }
      if (!hasOwn(scope, name)) throw this.error(`variable inconnue « ${reached} »`, node);
      scope = scope[name];
    }
    if (!isValue(scope)) {
      const fields = Object.keys(scope).join(', ');
      throw this.error(
        `« ${path.join('.')} » est un groupe : préciser un champ${fields ? ` (${fields})` : ''}`,
        node,
      );
    }
    return scope;
  }

  private number(value: Value, user: string, node: ExpressionNode): number {
    if (typeof value !== 'number')
      throw this.error(`${user} attend un nombre, reçu ${typeName(value)}`, node);
    return value;
  }

  private boolean(value: Value, user: string, node: ExpressionNode): boolean {
    if (typeof value !== 'boolean')
      throw this.error(`${user} attend un booléen, reçu ${typeName(value)}`, node);
    return value;
  }

  private finite(value: number, node: ExpressionNode): number {
    if (!Number.isFinite(value)) throw this.error('résultat hors limites', node);
    return value;
  }

  private charge(steps: number, node: ExpressionNode) {
    if (!this.budget.spend(steps)) {
      throw this.error(`calcul trop long : plus de ${this.budget.max} étapes`, node);
    }
  }

  private error(reason: string, node: ExpressionNode): EvaluationError {
    return new EvaluationError(reason, characterPosition(this.source, node.pos));
  }
}
