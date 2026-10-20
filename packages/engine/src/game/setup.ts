import { acceptsOption, type GameDefinition } from '../definition';
import type { Game, Options } from './types';

/** Partie impossible à créer (nombre de joueurs, équipes, options). */
export class GameSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameSetupError';
  }
}

export type GameSetup = {
  /** Options choisies ; les autres prennent leur valeur par défaut. */
  options?: Options;
  /** Nombre de joueurs. */
  players: number;
  /** Équipe (0, 1…) de chaque joueur, obligatoire pour un jeu en équipes. */
  teamOfPlayer?: readonly number[];
};

/** Prépare une partie à partir d'une définition validée (`validateGameDefinition`). */
export function createGame(definition: GameDefinition, setup: GameSetup): Game {
  const { min, max } = definition.players;
  if (!Number.isInteger(setup.players) || setup.players < min || setup.players > max) {
    throw new GameSetupError(`${setup.players} joueurs : ce jeu se joue de ${min} à ${max}`);
  }

  let participants = setup.players;
  if (definition.teams) {
    const { count, size } = definition.teams;
    const teams = setup.teamOfPlayer;
    if (!teams || teams.length !== setup.players) {
      throw new GameSetupError('indiquer l’équipe de chaque joueur');
    }
    if (teams.some((t) => !Number.isInteger(t) || t < 0 || t >= count)) {
      throw new GameSetupError(`équipe inconnue : ${count} équipes numérotées de 0 à ${count - 1}`);
    }
    for (let team = 0; team < count; team++) {
      const members = teams.filter((t) => t === team).length;
      if (members !== size) {
        throw new GameSetupError(
          `l’équipe ${team + 1} compte ${members} joueurs au lieu de ${size}`,
        );
      }
    }
    participants = count;
  }

  return Object.freeze({
    definition,
    options: resolveOptions(definition, setup.options ?? {}),
    players: setup.players,
    teamOfPlayer: setup.teamOfPlayer && Object.freeze([...setup.teamOfPlayer]),
    participants,
  });
}

/** Options de la partie : valeurs par défaut, remplacées par celles choisies (vérifiées). */
export function resolveOptions(definition: GameDefinition, chosen: Options): Options {
  const declared = new Map((definition.options ?? []).map((o) => [o.key, o]));
  for (const [key, value] of Object.entries(chosen)) {
    const option = declared.get(key);
    if (!option) throw new GameSetupError(`option inconnue « ${key} »`);
    if (!acceptsOption(option, value)) {
      throw new GameSetupError(
        `valeur ${JSON.stringify(value)} invalide pour l’option « ${option.label} »`,
      );
    }
  }
  return Object.freeze(
    Object.fromEntries([...declared.values()].map((o) => [o.key, chosen[o.key] ?? o.default])),
  );
}

/** Participant (équipe ou joueur) auquel appartient un joueur. */
export function participantOf(game: Game, player: number): number {
  return game.teamOfPlayer ? game.teamOfPlayer[player] : player;
}
