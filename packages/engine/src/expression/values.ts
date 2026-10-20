/** Valeur manipulée par une formule. Les listes viennent du contexte (`others.points`, `totals`). */
export type Value = number | boolean | string | readonly Value[];

/**
 * Contexte d'évaluation, en lecture seule : noms simples (`points`, `round`) et groupes
 * accessibles par point (`opt.threshold`, `others.points`).
 */
export type Environment = { readonly [name: string]: Value | Environment };

export function isList(value: unknown): value is readonly Value[] {
  return Array.isArray(value);
}

export function isValue(value: unknown): value is Value {
  return (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    isList(value)
  );
}

/** Nom du type d'une valeur, pour les messages d'erreur. */
export function typeName(value: Value): string {
  if (isList(value)) return 'une liste';
  if (typeof value === 'number') return 'un nombre';
  if (typeof value === 'boolean') return 'un booléen';
  return 'un texte';
}
