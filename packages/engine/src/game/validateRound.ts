import { acceptsInput, describeField, scopeOf, type InputField } from '../definition';
import { compile, EvaluationError, evaluate, StepBudget } from '../expression';
import { baseContext, validateContext } from './context';
import type { Entry, Game, RoundInputs } from './types';

export type RoundIssue = {
  /** Saisie en cause : `players[1].points`, `round.contract`, `taker`, `validate[0]`… */
  readonly path: string;
  /** Message à afficher, en français. */
  readonly message: string;
};

export type RoundCheck = { ok: true } | { ok: false; errors: RoundIssue[] };

/**
 * Vérifie les saisies d'une manche avant de la valider : forme, valeurs autorisées,
 * case `unique` cochée une seule fois, puis règles `validate` de la définition
 * (Belote : total de 162 ; Skull King : somme des plis = numéro de manche).
 * `round` : numéro de la manche saisie ; `previousTotals` : totaux avant elle.
 */
export function validateRound(
  game: Game,
  inputs: RoundInputs,
  round: number,
  previousTotals: readonly number[] = Array(game.participants).fill(0),
): RoundCheck {
  const errors: RoundIssue[] = [];
  const add = (path: string, message: string) => errors.push({ path, message });
  const { definition } = game;
  const scope = scopeOf(definition);

  checkEntry(add, 'round', inputs.round ?? {}, definition.inputs?.round ?? [], round);

  if (scope === 'role') {
    const taker = inputs.taker;
    if (
      taker === undefined ||
      !Number.isInteger(taker) ||
      taker < 0 ||
      taker >= game.participants
    ) {
      add('taker', 'choisir qui prend');
    }
  } else {
    const group = scope === 'team' ? 'teams' : 'players';
    const fields = (scope === 'team' ? definition.inputs?.team : definition.inputs?.player) ?? [];
    const entries = inputs[group] ?? [];
    if (entries.length !== game.participants) {
      add(group, `${game.participants} entrées attendues, ${entries.length} reçues`);
    }
    entries.forEach((entry, i) => checkEntry(add, `${group}[${i}]`, entry, fields, round));
    for (const field of fields) {
      if (
        field.type === 'bool' &&
        field.unique &&
        entries.filter((e) => e[field.key] === true).length > 1
      ) {
        add(
          group,
          `« ${field.label} » ne peut être coché que pour un seul ${scope === 'team' ? 'camp' : 'joueur'}`,
        );
      }
    }
  }

  // Les règles ne s'évaluent que sur des saisies complètes et valides.
  if (errors.length > 0) return { ok: false, errors };

  const context = validateContext(game, inputs, baseContext(game, round, previousTotals));
  const budget = new StepBudget();
  for (const [i, { rule, message }] of (definition.validate ?? []).entries()) {
    let passed;
    try {
      passed = evaluate(compile(rule), context, { budget });
    } catch (error) {
      if (!(error instanceof EvaluationError)) throw error;
      add(`validate[${i}]`, `règle impossible à vérifier : ${error.message}`);
      continue;
    }
    if (passed !== true) add(`validate[${i}]`, message);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

function checkEntry(
  add: (path: string, message: string) => void,
  path: string,
  entry: Entry,
  fields: readonly InputField[],
  round: number,
) {
  for (const field of fields) {
    if (entry[field.key] === undefined) add(`${path}.${field.key}`, `« ${field.label} » à remplir`);
    else if (!acceptsInput(field, entry[field.key], round)) {
      add(`${path}.${field.key}`, `« ${field.label} » : ${describeField(field, round)}`);
    }
  }
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(entry)) {
    if (!known.has(key)) add(`${path}.${key}`, `saisie inconnue « ${key} »`);
  }
}
