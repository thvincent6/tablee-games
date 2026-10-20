import type { GameDefinition, InputField, Scope } from './schema';

/**
 * Noms disponibles dans une formule : une valeur (`null`) ou un groupe et ses champs
 * (`opt` → `threshold`, `double`). Partagé avec le moteur de partie, qui construit les mêmes contextes.
 */
export type Names = ReadonlyMap<string, ReadonlySet<string> | null>;

/** Noms fournis par l'app, interdits comme clé de saisie, de case ou de variable. */
export const RESERVED_NAMES = ['opt', 'others', 'all', 'round', 'totals'] as const;

export const scopeOf = (definition: GameDefinition): Scope => definition.scoring?.scope ?? 'player';

const keysOf = (fields: readonly InputField[] | undefined) => (fields ?? []).map((f) => f.key);

/** Clés des saisies propres à la portée (joueur ou équipe) : celles de `others.` et `all.`. */
export function scopeFieldsOf(definition: GameDefinition): InputField[] {
  if (definition.archetype === 'grid') return definition.cells ?? [];
  const scope = scopeOf(definition);
  if (scope === 'player') return definition.inputs?.player ?? [];
  if (scope === 'team') return definition.inputs?.team ?? [];
  return [];
}

/** `opt`, `round`, `totals` : disponibles partout. */
function baseNames(definition: GameDefinition): Map<string, ReadonlySet<string> | null> {
  return new Map<string, ReadonlySet<string> | null>([
    ['opt', new Set((definition.options ?? []).map((o) => o.key))],
    ['round', null],
    ['totals', null],
  ]);
}

/** Noms des formules de score (`score`, `taker`, `defense`) et du bloc `vars`. */
export function scoringNames(definition: GameDefinition): Names {
  const names = baseNames(definition);
  const own = keysOf(scopeFieldsOf(definition));
  for (const key of own) names.set(key, null);
  if (definition.archetype !== 'grid') {
    for (const key of keysOf(definition.inputs?.round)) names.set(key, null);
    if (scopeOf(definition) !== 'role') {
      names.set('others', new Set(own));
      names.set('all', new Set(own));
    }
  }
  for (const name of Object.keys(definition.scoring?.vars ?? {})) names.set(name, null);
  return names;
}

/** Noms de la formule de fin : totaux, numéro de manche, options. */
export function endNames(definition: GameDefinition): Names {
  return baseNames(definition);
}

/** Noms des règles `validate` : saisies de la manche et listes `all.<clé>` de tous les joueurs ou équipes. */
export function validateNames(definition: GameDefinition): Names {
  const names = baseNames(definition);
  for (const key of keysOf(definition.inputs?.round)) names.set(key, null);
  names.set(
    'all',
    new Set([...keysOf(definition.inputs?.player), ...keysOf(definition.inputs?.team)]),
  );
  return names;
}
