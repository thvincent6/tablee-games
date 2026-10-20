import {
  compile,
  evaluate,
  printExpression,
  type BinaryOperator,
  type ExpressionNode,
} from '../expression';
import type { Game } from './types';

/**
 * Objectif de fin lu dans la formule `end`, pour la barre de progression :
 * - `points` : `max(totals) >= seuil` (ou `>`), la partie s'arrête quand un total atteint `target` ;
 * - `rounds` : `round >= n` (ou `>`), la partie compte `target` manches.
 * Toute autre forme (ou une fin manuelle) ne donne pas d'objectif.
 */
export type EndGoal = { kind: 'points'; target: number } | { kind: 'rounds'; target: number };

const mirrored: Partial<Record<BinaryOperator, BinaryOperator>> = { '<=': '>=', '<': '>' };

const isMaxTotals = (node: ExpressionNode) =>
  node.kind === 'call' &&
  node.callee === 'max' &&
  node.args.length === 1 &&
  node.args[0].kind === 'identifier' &&
  node.args[0].path.join('.') === 'totals';

const isRound = (node: ExpressionNode) =>
  node.kind === 'identifier' && node.path.join('.') === 'round';

/** Le seuil ne doit dépendre que des options : il est le même pendant toute la partie. */
function constant(game: Game, node: ExpressionNode): number | boolean | null {
  const formula = compile(printExpression(node));
  if ([...formula.references].some((name) => name !== 'opt')) return null;
  try {
    const value = evaluate(formula, { opt: game.options });
    if (typeof value === 'boolean') return value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function endGoal(game: Game): EndGoal | null {
  const { end } = game.definition;
  if (!end || end === 'grid_complete') return null;
  let { ast } = compile(end);
  // `réglage and seuil` : un réglage qui active la fin (« opt.target > 0 and max(totals) >= … »).
  while (ast.kind === 'binary' && ast.operator === 'and' && constant(game, ast.left) !== null) {
    if (!constant(game, ast.left)) return null;
    ast = ast.right;
  }
  if (ast.kind !== 'binary') return null;

  // `seuil <= max(totals)` se lit comme `max(totals) >= seuil`.
  let { operator, left, right } = ast;
  if (mirrored[operator]) [operator, left, right] = [mirrored[operator]!, right, left];
  if (operator !== '>=' && operator !== '>') return null;

  const limit = constant(game, right);
  if (typeof limit !== 'number') return null;
  // Manches et scores sont entiers : `> n` s'atteint à n + 1.
  const target = operator === '>' ? limit + 1 : limit;
  if (isMaxTotals(left)) return { kind: 'points', target };
  if (isRound(left)) return { kind: 'rounds', target };
  return null;
}
