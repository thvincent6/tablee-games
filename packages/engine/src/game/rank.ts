import type { Game } from './types';

/**
 * Rang de chaque participant (1 = premier), selon `winner` (le plus haut ou le plus bas gagne).
 * Les ex æquo partagent le même rang et le suivant est sauté : 1, 1, 3.
 */
export function rank(game: Game, totals: readonly number[]): number[] {
  const better =
    game.definition.winner === 'highest'
      ? (a: number, b: number) => a > b
      : (a: number, b: number) => a < b;
  return totals.map((total) => 1 + totals.filter((other) => better(other, total)).length);
}

export type RankChange = {
  readonly before: number;
  readonly after: number;
  /** Places gagnées (positif) ou perdues (négatif). */
  readonly gained: number;
};

/** Évolution du classement, pour l'aperçu « reste 1er » ou « gagne 2 places » avant de valider une manche. */
export function diffRanking(before: readonly number[], after: readonly number[]): RankChange[] {
  return after.map((rankAfter, i) => ({
    before: before[i],
    after: rankAfter,
    gained: before[i] - rankAfter,
  }));
}
