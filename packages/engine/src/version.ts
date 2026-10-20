// Version du langage de formules (champ `engine` des définitions de jeu).
// Une définition qui exige une version plus récente est refusée proprement.
export const ENGINE_VERSION = 1;

export function isEngineSupported(required: number): boolean {
  return Number.isInteger(required) && required >= 1 && required <= ENGINE_VERSION;
}
