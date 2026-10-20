import type { GameOption, InputField } from './schema';

// Contrôle d'une valeur saisie ou d'une option, partagé par la validation des définitions
// (cas de test) et celle des manches (moteur de partie).

export type Bounds = { min?: number; max?: number };

/** Borne dynamique d'une saisie : le numéro de la manche (Skull King : n cartes à la manche n). */
export const ROUND_BOUND = '$round';
export type Bound = number | typeof ROUND_BOUND;

/** Bornes effectives d'une saisie pour la manche `round` (1 par défaut). */
export function resolveBounds({ min, max }: { min?: Bound; max?: Bound }, round = 1): Bounds {
  const resolve = (b?: Bound) => (b === ROUND_BOUND ? round : b);
  return { min: resolve(min), max: resolve(max) };
}

export function inBounds(value: number, { min, max }: Bounds): boolean {
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

export function describeBounds({ min, max }: Bounds): string {
  return `[${min ?? '−∞'} ; ${max ?? '+∞'}]`;
}

export function describeField(field: InputField, round = 1): string {
  switch (field.type) {
    case 'int':
      return `entier dans ${describeBounds(resolveBounds(field, round))} attendu`;
    case 'bool':
      return 'true ou false attendu';
    case 'enum':
    case 'pick':
      return `une valeur parmi ${field.values.map((v) => JSON.stringify(v)).join(', ')} attendue`;
  }
}

/** `round` : numéro de la manche saisie, pour les bornes `"$round"`. */
export function acceptsInput(field: InputField, value: unknown, round = 1): boolean {
  switch (field.type) {
    case 'int':
      return Number.isInteger(value) && inBounds(value as number, resolveBounds(field, round));
    case 'bool':
      return typeof value === 'boolean';
    case 'enum':
    case 'pick':
      return (field.values as unknown[]).includes(value);
  }
}

export function acceptsOption(option: GameOption, value: unknown): boolean {
  switch (option.type) {
    case 'int':
      return Number.isInteger(value) && inBounds(value as number, option);
    case 'bool':
      return typeof value === 'boolean';
    case 'enum':
      return (option.values as unknown[]).includes(value);
  }
}
