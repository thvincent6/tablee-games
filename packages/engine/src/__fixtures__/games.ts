import { validateGameDefinition, type GameDefinition } from '../definition';
import { specExample, type SpecGame } from './specs';

/** Définition validée (les tests échouent tout de suite si la fixture est fausse). */
export function definition(data: unknown): GameDefinition {
  const result = validateGameDefinition(data);
  if (!result.ok) {
    throw new Error(result.errors.map((e) => `${e.path} : ${e.message}`).join('\n'));
  }
  return result.definition;
}

export const specDefinition = (game: SpecGame) => definition(specExample(game));

const identity = (id: string, name: string) => ({ id, name, version: '1.0.0', engine: 1 });

/** Manches calculées façon Skull King : mise, plis, bonus ; somme des plis = numéro de manche. */
export const skullKingLike = () =>
  definition({
    ...identity('skull-test', 'Skull King (test)'),
    archetype: 'rounds',
    players: { min: 2, max: 8 },
    winner: 'highest',
    inputs: {
      player: [
        { key: 'bid', label: 'Mise', type: 'int', min: 0, max: 10 },
        { key: 'tricks', label: 'Plis', type: 'int', min: 0, max: 10 },
        { key: 'bonus', label: 'Bonus', type: 'int', min: 0, max: 200 },
      ],
    },
    scoring: {
      vars: { made: 'bid == tricks' },
      score:
        'bid == 0 ? (made ? 10 * round : -10 * round) : made ? 20 * bid + bonus : -10 * abs(bid - tricks)',
    },
    end: 'round >= 10',
    validate: [
      {
        rule: 'sum(all.tricks) == round',
        message: 'La somme des plis doit valoir le numéro de manche.',
      },
    ],
  });

/** Score qui dépend des totaux précédents : +5 pour tous dès que quelqu'un a atteint 50. */
export const lateBonus = () =>
  definition({
    ...identity('bonus-tardif', 'Bonus tardif'),
    archetype: 'rounds',
    players: { min: 2, max: 4 },
    winner: 'highest',
    inputs: { player: [{ key: 'points', label: 'Points', type: 'int', min: 0, max: 100 }] },
    scoring: { score: 'points + (max(totals) >= 50 ? 5 : 0)' },
  });

/** Jeu en équipes : score partagé par les coéquipiers. */
export const teamGame = () =>
  definition({
    ...identity('equipes', 'Équipes'),
    archetype: 'rounds',
    players: { min: 4, max: 6 },
    teams: { count: 2, size: 2 },
    winner: 'highest',
    options: [
      {
        key: 'target',
        label: 'Objectif',
        type: 'int',
        default: 500,
        min: 100,
        max: 2000,
        step: 100,
      },
    ],
    inputs: {
      team: [{ key: 'pts', label: 'Points', type: 'int', min: 0, max: 162 }],
      round: [{ key: 'capot', label: 'Capot', type: 'bool' }],
    },
    scoring: { scope: 'team', score: 'capot ? (pts == 162 ? 250 : 0) : pts' },
    end: 'max(totals) >= opt.target',
    validate: [{ rule: 'sum(all.pts) == 162', message: 'Le total des points doit faire 162.' }],
  });

/** Contrat sans équipes, façon Tarot : le preneur marque 3 × score, chaque défenseur −score. */
export const tarotLike = () =>
  definition({
    ...identity('tarot-test', 'Tarot (test)'),
    archetype: 'contract',
    players: { min: 4, max: 4 },
    winner: 'highest',
    inputs: {
      round: [
        { key: 'points', label: 'Points du preneur', type: 'int', min: 0, max: 91 },
        { key: 'threshold', label: 'Seuil', type: 'pick', values: [36, 41, 51, 56] },
      ],
    },
    scoring: {
      scope: 'role',
      vars: { score: '(25 + abs(points - threshold)) * (points >= threshold ? 1 : -1)' },
      taker: '3 * score',
      defense: '-score',
    },
  });
