import { compile, EvaluationError, evaluate, StepBudget } from '../expression';
import { baseContext } from './context';
import { isGridComplete, ScoringError } from './score';
import type { Game, Grid } from './types';

export type GameState = {
  /** Totaux actuels, par participant. */
  readonly totals: readonly number[];
  /** Nombre de manches jouées. */
  readonly rounds: number;
  /** Grilles des joueurs (archétype grille). */
  readonly grids?: readonly Grid[];
};

/**
 * La partie est-elle terminée selon la règle `end` ? Formule évaluée sur les totaux,
 * `grid_complete` pour une grille, et jamais si la fin est manuelle (pas de `end`).
 */
export function isFinished(game: Game, state: GameState): boolean {
  const { end } = game.definition;
  if (!end) return false;
  if (end === 'grid_complete') return isGridComplete(game, state.grids ?? []);

  let value;
  try {
    value = evaluate(compile(end), baseContext(game, state.rounds, state.totals), {
      budget: new StepBudget(),
    });
  } catch (error) {
    if (error instanceof EvaluationError) throw new ScoringError('end', error.message);
    throw error;
  }
  if (typeof value !== 'boolean')
    throw new ScoringError('end', 'la formule doit donner vrai ou faux');
  return value;
}
