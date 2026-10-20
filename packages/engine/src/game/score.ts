import { scopeOf, type GameDefinition } from '../definition';
import {
  compile,
  compileVars,
  EvaluationError,
  evaluate,
  evaluateVars,
  StepBudget,
  VarsError,
  type CompiledVars,
  type Environment,
  type Value,
} from '../expression';
import { baseContext, gridContext, participantContext, roleContext } from './context';
import type { Game, Grid, RoundInputs } from './types';

/** Échec d'un calcul de score : précise la formule et le participant en cause. */
export class ScoringError extends Error {
  constructor(
    readonly formula: string,
    readonly reason: string,
    readonly participant?: number,
  ) {
    super(
      `${formula}${participant === undefined ? '' : ` (participant ${participant + 1})`} : ${reason}`,
    );
    this.name = 'ScoringError';
  }
}

const varsCache = new WeakMap<object, CompiledVars>();

/** Bloc `vars` compilé une fois par définition. */
export function varsOf(game: Game): CompiledVars {
  const vars = game.definition.scoring?.vars ?? {};
  let compiled = varsCache.get(vars);
  if (!compiled) {
    compiled = compileVars(vars);
    varsCache.set(vars, compiled);
  }
  return compiled;
}

type Role = 'score' | 'taker' | 'defense';

/** Évalue `vars` puis la formule `scoring.<role>`, qui doit donner un nombre. */
function scoreWith(
  game: Game,
  role: Role,
  context: Environment,
  budget: StepBudget,
  participant?: number,
): number {
  const path = `scoring.${role}`;
  let value: Value;
  try {
    const scope = evaluateVars(varsOf(game), context, { budget });
    value = evaluate(compile(game.definition.scoring?.[role] ?? ''), scope, { budget });
  } catch (error) {
    if (error instanceof VarsError) {
      throw new ScoringError(`scoring.vars.${error.variable}`, error.reason, participant);
    }
    if (error instanceof EvaluationError) throw new ScoringError(path, error.message, participant);
    throw error;
  }
  if (typeof value !== 'number') {
    throw new ScoringError(path, 'la formule doit donner un nombre', participant);
  }
  return value;
}

/**
 * Scores d'une manche, un par participant.
 * `previousTotals` : totaux avant cette manche (`totals` dans les formules) ; `round` : son numéro (1, 2…).
 * Les saisies doivent avoir été vérifiées par `validateRound`.
 */
export function scoreRound(
  game: Game,
  inputs: RoundInputs,
  previousTotals: readonly number[],
  round: number,
): number[] {
  const scores = scoresOf(game, inputs, previousTotals, round);
  if (game.definition.scoring?.zeroSum) {
    const sum = tidy(scores.reduce((a, b) => a + b, 0));
    if (sum !== 0) {
      throw new ScoringError('scoring.zeroSum', `la somme des scores vaut ${sum} au lieu de 0`);
    }
  }
  return scores;
}

function scoresOf(
  game: Game,
  inputs: RoundInputs,
  previousTotals: readonly number[],
  round: number,
): number[] {
  const budget = new StepBudget();
  const base = baseContext(game, round, previousTotals);
  const scope = scopeOf(game.definition);

  if (scope === 'role') {
    const context = roleContext(inputs, base);
    const taker = scoreWith(game, 'taker', context, budget);
    const defense = scoreWith(game, 'defense', context, budget);
    return Array.from({ length: game.participants }, (_, i) =>
      i === inputs.taker ? taker : defense,
    );
  }

  return Array.from({ length: game.participants }, (_, i) =>
    scoreWith(game, 'score', participantContext(game, inputs, i, base), budget, i),
  );
}

export type Standings = {
  /** Scores de chaque manche, par participant. */
  readonly rounds: readonly (readonly number[])[];
  /** Totaux après chaque manche (cumul). */
  readonly running: readonly (readonly number[])[];
  /** Totaux finaux. */
  readonly totals: readonly number[];
};

/**
 * Recalcule toute une partie à partir des saisies brutes des manches, dans l'ordre.
 * Fonction pure : mêmes manches, même résultat ; modifier une manche recalcule les suivantes.
 */
export function computeTotals(game: Game, rounds: readonly RoundInputs[]): Standings {
  let totals: readonly number[] = Array(game.participants).fill(0);
  const scores: number[][] = [];
  const running: number[][] = [];
  rounds.forEach((inputs, index) => {
    const round = scoreRound(game, inputs, totals, index + 1);
    totals = totals.map((total, i) => tidy(total + round[i]));
    scores.push(round);
    running.push([...totals]);
  });
  return { rounds: scores, running, totals };
}

/**
 * Marques de chaque participant pour une manche (`scoring.marks` dont `when` est vraie),
 * dans le même contexte que `score`.
 */
export function markRound(
  game: Game,
  inputs: RoundInputs,
  previousTotals: readonly number[],
  round: number,
): string[][] {
  const marks = game.definition.scoring?.marks ?? [];
  if (marks.length === 0) return Array.from({ length: game.participants }, () => []);

  const budget = new StepBudget();
  const base = baseContext(game, round, previousTotals);
  return Array.from({ length: game.participants }, (_, participant) => {
    const context = participantContext(game, inputs, participant, base);
    return marks.flatMap(({ when, label }, i) => {
      const path = `scoring.marks[${i}].when`;
      let value: Value;
      try {
        const scope = evaluateVars(varsOf(game), context, { budget });
        value = evaluate(compile(when), scope, { budget });
      } catch (error) {
        if (error instanceof VarsError) {
          throw new ScoringError(`scoring.vars.${error.variable}`, error.reason, participant);
        }
        if (error instanceof EvaluationError)
          throw new ScoringError(path, error.message, participant);
        throw error;
      }
      if (typeof value !== 'boolean') {
        throw new ScoringError(path, 'la formule doit donner vrai ou faux', participant);
      }
      return value ? [label] : [];
    });
  });
}

/** Marques de chaque manche (une liste par participant), à partir des totaux de `computeTotals`. */
export function computeMarks(
  game: Game,
  rounds: readonly RoundInputs[],
  standings: Standings,
): string[][][] {
  const start: readonly number[] = Array(game.participants).fill(0);
  return rounds.map((inputs, index) =>
    markRound(game, inputs, index === 0 ? start : standings.running[index - 1], index + 1),
  );
}

/** Totaux d'une grille, un par joueur (cases vides comptées 0). */
export function computeGridTotals(game: Game, grids: readonly Grid[]): number[] {
  const budget = new StepBudget();
  const totals = Array(game.participants).fill(0);
  return grids.map((grid, i) =>
    scoreWith(game, 'score', gridContext(game, grid, baseContext(game, 0, totals)), budget, i),
  );
}

/**
 * Lignes intermédiaires (`scoring.subtotals`) de chaque joueur : une liste par joueur,
 * dans l'ordre du JSON, cases vides comptées 0.
 */
export function computeGridSubtotals(game: Game, grids: readonly Grid[]): number[][] {
  const subtotals = game.definition.scoring?.subtotals ?? [];
  const budget = new StepBudget();
  const totals = Array(game.participants).fill(0);
  return grids.map((grid, player) => {
    if (subtotals.length === 0) return [];
    const context = gridContext(game, grid, baseContext(game, 0, totals));
    let scope: Environment;
    try {
      scope = evaluateVars(varsOf(game), context, { budget });
    } catch (error) {
      if (error instanceof VarsError) {
        throw new ScoringError(`scoring.vars.${error.variable}`, error.reason, player);
      }
      throw error;
    }
    return subtotals.map(({ value }, i) => {
      const path = `scoring.subtotals[${i}].value`;
      let result: Value;
      try {
        result = evaluate(compile(value), scope, { budget });
      } catch (error) {
        if (error instanceof EvaluationError) throw new ScoringError(path, error.message, player);
        throw error;
      }
      if (typeof result !== 'number') {
        throw new ScoringError(path, 'la formule doit donner un nombre', player);
      }
      return result;
    });
  });
}

/**
 * Place de chaque ligne intermédiaire : l'index de la dernière case dont elle dépend
 * (directement ou par les `vars`) ; la ligne s'affiche juste après. −1 : aucune case.
 */
export function subtotalPositions(definition: GameDefinition): number[] {
  const cells = (definition.cells ?? []).map((c) => c.key);
  const vars = definition.scoring?.vars ?? {};
  const lastCell = (source: string, seen: Set<string>): number =>
    Math.max(
      -1,
      ...[...compile(source).references].map((name) => {
        if (cells.includes(name)) return cells.indexOf(name);
        if (name in vars && !seen.has(name)) return lastCell(vars[name], new Set(seen).add(name));
        return -1;
      }),
    );
  return (definition.scoring?.subtotals ?? []).map(({ value }) => lastCell(value, new Set()));
}

/** Totaux d'un compteur : la somme des changements de chaque participant, dans l'ordre. */
export function computeCounterTotals(game: Game, changes: readonly RoundInputs[]): number[] {
  const totals: number[] = Array(game.participants).fill(0);
  for (const { change } of changes) {
    const valid =
      change !== undefined &&
      Number.isInteger(change.participant) &&
      change.participant >= 0 &&
      change.participant < totals.length &&
      Number.isFinite(change.delta);
    if (!valid) throw new ScoringError('change', 'changement de compteur invalide');
    totals[change.participant] = tidy(totals[change.participant] + change.delta);
  }
  return totals;
}

/** Grille entièrement remplie pour chaque joueur. */
export function isGridComplete(game: Game, grids: readonly Grid[]): boolean {
  const cells = game.definition.cells ?? [];
  return (
    grids.length === game.participants &&
    grids.every((grid) => cells.every((cell) => grid[cell.key] !== undefined))
  );
}

/** Évite d'accumuler le bruit des flottants (0,1 + 0,2) au fil des manches. */
const tidy = (n: number) => Number(n.toPrecision(12));
