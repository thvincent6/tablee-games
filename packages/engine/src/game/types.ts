import type { GameDefinition } from '../definition';
import type { Value } from '../expression';

/** Saisies d'une ligne : `{ points: 10, finisher: true }`. */
export type Entry = Readonly<Record<string, Value>>;

/**
 * Saisies brutes d'une manche, telles qu'enregistrées en base.
 * - `round` : saisies de la manche (contrat, belote…) ;
 * - `players` / `teams` : une entrée par joueur (portée joueur) ou par équipe (portée équipe), dans l'ordre ;
 * - `taker` : camp preneur (portée rôle), index de l'équipe si le jeu en a, sinon du joueur.
 */
export type RoundInputs = {
  readonly round?: Entry;
  readonly players?: readonly Entry[];
  readonly teams?: readonly Entry[];
  readonly taker?: number;
  /** Compteur : un changement de total (+1, −10…) pour un participant. */
  readonly change?: CounterChange;
};

/** Changement d'un compteur : `delta` ajouté au total du participant. */
export type CounterChange = { readonly participant: number; readonly delta: number };

/** Grille d'un joueur : valeur des cases déjà remplies. */
export type Grid = Readonly<Record<string, number>>;

/** Valeurs des options d'une partie. */
export type Options = Readonly<Record<string, number | boolean | string>>;

/**
 * Partie prête à être calculée : définition validée, options complétées par leurs valeurs
 * par défaut, et participants. Un participant est une équipe si le jeu en a, sinon un joueur :
 * les scores, totaux et rangs sont donnés par participant.
 */
export type Game = {
  readonly definition: GameDefinition;
  readonly options: Options;
  /** Nombre de joueurs. */
  readonly players: number;
  /** Équipe (index) de chaque joueur, pour les jeux en équipes. */
  readonly teamOfPlayer?: readonly number[];
  /** Nombre de participants : équipes ou joueurs. */
  readonly participants: number;
};
