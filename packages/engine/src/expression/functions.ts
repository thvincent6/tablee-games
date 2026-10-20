import { isList, typeName, type Value } from './values';

/** Échec d'une fonction : le message est complété par l'évaluateur (position). */
export class FunctionError extends Error {}

type Arity = { min: number; max: number };

export type FormulaFunction = {
  arity: Arity;
  /** `charge(n)` décompte n étapes du budget (parcours d'une liste). */
  call: (args: Value[], charge: (steps: number) => void) => Value;
};

const one: Arity = { min: 1, max: 1 };
const many: Arity = { min: 1, max: Infinity };

/** Aplatit les listes d'un niveau : `max(a, others.points)` compare tout. */
function flatten(args: Value[], charge: (steps: number) => void): Value[] {
  const items = args.flatMap((arg) => (isList(arg) ? [...arg] : [arg]));
  charge(items.length);
  return items;
}

function numbers(name: string, items: Value[]): number[] {
  return items.map((item) => {
    if (typeof item !== 'number') {
      throw new FunctionError(`${name}() attend des nombres, reçu ${typeName(item)}`);
    }
    return item;
  });
}

function number(name: string, value: Value, label = 'un nombre'): number {
  if (typeof value !== 'number') {
    throw new FunctionError(`${name}() attend ${label}, reçu ${typeName(value)}`);
  }
  return value;
}

function extremum(name: 'min' | 'max', pick: (values: number[]) => number): FormulaFunction {
  return {
    arity: many,
    call(args, charge) {
      const values = numbers(name, flatten(args, charge));
      if (values.length === 0) throw new FunctionError(`${name}() d’une liste vide`);
      return pick(values);
    },
  };
}

/** Supprime le bruit des flottants (`0.1 * 3`) sans toucher aux entiers. */
const tidy = (n: number) => Number(n.toPrecision(12));

/** Fonctions autorisées dans les formules, et aucune autre. */
export const functions: Readonly<Record<string, FormulaFunction>> = {
  min: extremum('min', (values) => Math.min(...values)),
  max: extremum('max', (values) => Math.max(...values)),
  abs: { arity: one, call: ([x]) => Math.abs(number('abs', x)) },
  floor: { arity: one, call: ([x]) => Math.floor(number('floor', x)) },
  ceil: { arity: one, call: ([x]) => Math.ceil(number('ceil', x)) },
  sum: {
    arity: many,
    call: (args, charge) => tidy(numbers('sum', flatten(args, charge)).reduce((a, b) => a + b, 0)),
  },
  /** Nombre de `true` dans une liste de booléens ; sinon, nombre d'éléments. */
  count: {
    arity: many,
    call: (args, charge) => flatten(args, charge).filter((item) => item !== false).length,
  },
  /** `round(x, pas)` : multiple de `pas` le plus proche, 5 arrondi vers le haut (45 → 50, −45 → −40). */
  round: {
    arity: { min: 1, max: 2 },
    call([x, step = 1]) {
      const value = number('round', x);
      const unit = number('round', step, 'un pas numérique');
      if (unit <= 0) throw new FunctionError('round() attend un pas positif');
      return tidy(Math.floor(tidy(value / unit) + 0.5) * unit);
    },
  },
};

export function isAllowedFunction(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(functions, name);
}
