export { participantContext, roleContext, gridContext, validateContext } from './context';
export { describeRound } from './describe';
export { isFinished, type GameState } from './finish';
export { endGoal, type EndGoal } from './progress';
export { diffRanking, rank, type RankChange } from './rank';
export {
  computeCounterTotals,
  computeGridSubtotals,
  computeGridTotals,
  computeMarks,
  computeTotals,
  isGridComplete,
  markRound,
  ScoringError,
  scoreRound,
  subtotalPositions,
  type Standings,
} from './score';
export { createGame, GameSetupError, participantOf, resolveOptions, type GameSetup } from './setup';
export type { CounterChange, Entry, Game, Grid, Options, RoundInputs } from './types';
export { validateRound, type RoundCheck, type RoundIssue } from './validateRound';
