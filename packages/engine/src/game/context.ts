import { scopeFieldsOf, scopeOf } from '../definition';
import type { Environment, Value } from '../expression';
import type { Entry, Game, Grid, RoundInputs } from './types';

// Contextes d'évaluation, alignés sur les noms autorisés par `definition/names.ts`.

/** `opt`, `round`, `totals` : communs à toutes les formules. */
export function baseContext(game: Game, round: number, totals: readonly number[]): Environment {
  return { opt: game.options, round, totals };
}

/** Entrées de la portée (joueurs ou équipes) d'une manche. */
export function scopeEntries(game: Game, inputs: RoundInputs): readonly Entry[] {
  return (scopeOf(game.definition) === 'team' ? inputs.teams : inputs.players) ?? [];
}

/** Liste des valeurs d'une saisie, une par entrée. */
function columns(entries: readonly Entry[], keys: readonly string[]): Record<string, Value[]> {
  return Object.fromEntries(keys.map((key) => [key, entries.map((entry) => entry[key])]));
}

/** Contexte du participant `index` (portées joueur et équipe). */
export function participantContext(
  game: Game,
  inputs: RoundInputs,
  index: number,
  base: Environment,
): Environment {
  const entries = scopeEntries(game, inputs);
  const keys = scopeFieldsOf(game.definition).map((f) => f.key);
  return {
    ...base,
    ...inputs.round,
    ...entries[index],
    others: columns(
      entries.filter((_, i) => i !== index),
      keys,
    ),
    all: columns(entries, keys),
  };
}

/** Contexte de la portée rôle : saisies de la manche seulement. */
export function roleContext(inputs: RoundInputs, base: Environment): Environment {
  return { ...base, ...inputs.round };
}

/** Contexte d'une grille : les cases du joueur, 0 pour une case pas encore remplie. */
export function gridContext(game: Game, grid: Grid, base: Environment): Environment {
  const cells = Object.fromEntries(
    (game.definition.cells ?? []).map((c) => [c.key, grid[c.key] ?? 0]),
  );
  return { ...base, ...cells };
}

/** Contexte des règles `validate` : saisies de la manche et `all.<clé>` des joueurs et des équipes. */
export function validateContext(game: Game, inputs: RoundInputs, base: Environment): Environment {
  const playerKeys = (game.definition.inputs?.player ?? []).map((f) => f.key);
  const teamKeys = (game.definition.inputs?.team ?? []).map((f) => f.key);
  return {
    ...base,
    ...inputs.round,
    all: {
      ...columns(inputs.players ?? [], playerKeys),
      ...columns(inputs.teams ?? [], teamKeys),
    },
  };
}
