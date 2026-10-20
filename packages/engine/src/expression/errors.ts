/**
 * Erreur d'analyse d'une formule, en français, avec la position fautive.
 * `position` compte les caractères à partir de 1, comme un humain les compte.
 */
export class ExpressionError extends Error {
  constructor(
    readonly reason: string,
    readonly position: number,
  ) {
    super(`${reason} (caractère ${position})`);
    this.name = 'ExpressionError';
  }
}

/**
 * Erreur pendant l'évaluation d'une formule valide : variable inconnue, types incompatibles,
 * division par zéro, plafond d'étapes… Même forme qu'une `ExpressionError`.
 */
export class EvaluationError extends Error {
  constructor(
    readonly reason: string,
    readonly position: number,
  ) {
    super(`${reason} (caractère ${position})`);
    this.name = 'EvaluationError';
  }
}

/** Erreur dans un bloc `vars` : précise la variable en cause. */
export class VarsError extends Error {
  constructor(
    readonly variable: string,
    readonly reason: string,
  ) {
    super(`variable « ${variable} » : ${reason}`);
    this.name = 'VarsError';
  }
}

/** Position humaine (base 1) d'un index de chaîne, comptée en caractères et non en unités UTF-16. */
export function characterPosition(source: string, index: number): number {
  return Array.from(source.slice(0, index)).length + 1;
}
