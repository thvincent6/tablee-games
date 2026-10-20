import { scopeOf, type DefinitionTest, type GameDefinition } from '../definition';
import {
  computeGridTotals,
  createGame,
  GameSetupError,
  ScoringError,
  scoreRound,
  validateRound,
  type Entry,
  type Game,
  type Grid,
  type RoundInputs,
} from '../game';

/** Scores attendus ou obtenus : un total (grille), un score par entrée, ou preneur et défense. */
export type TestScores = DefinitionTest['expect'];

export type TestResult =
  | { name: string; status: 'passed'; expected: TestScores }
  | { name: string; status: 'failed'; expected: TestScores; actual: TestScores }
  /** Le cas n'a pas pu être calculé : saisies refusées, erreur de formule… */
  | { name: string; status: 'error'; expected: TestScores; reason: string };

/**
 * Rejoue chaque cas de `tests` d'une définition validée, comme une vraie manche :
 * saisies vérifiées par `validateRound`, puis score calculé et comparé à `expect`.
 */
export function runDefinitionTests(definition: GameDefinition): TestResult[] {
  return (definition.tests ?? []).map((test) => {
    const { name, expect: expected } = test;
    try {
      const actual = play(definition, test);
      return sameScores(expected, actual)
        ? { name, status: 'passed', expected }
        : { name, status: 'failed', expected, actual };
    } catch (error) {
      if (
        error instanceof TestInputError ||
        error instanceof GameSetupError ||
        error instanceof ScoringError
      ) {
        return { name, status: 'error', expected, reason: error.message };
      }
      throw error;
    }
  });
}

class TestInputError extends Error {}

/** Joueurs d'une partie de test : les équipes se remplissent à tour de rôle (0, 1, 0, 1…). */
function teamSetup(definition: GameDefinition) {
  const teams = definition.teams;
  if (!teams) return { players: definition.players.min };
  const players = teams.count * teams.size;
  return { players, teamOfPlayer: Array.from({ length: players }, (_, i) => i % teams.count) };
}

function pick(entry: Entry, keys: readonly string[], keep: boolean): Entry {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => keys.includes(key) === keep));
}

function play(definition: GameDefinition, test: DefinitionTest): TestScores {
  const options = test.options ?? {};
  const round = test.round ?? 1;

  if (definition.archetype === 'counter') {
    throw new TestInputError('un compteur n’a pas de calcul à tester');
  }

  if (definition.archetype === 'grid') {
    const game = createGame(definition, { players: definition.players.min, options });
    return computeGridTotals(game, [test.inputs as Grid])[0];
  }

  if (scopeOf(definition) === 'role') {
    const game = createGame(definition, { ...teamSetup(definition), options });
    // Le premier camp prend : `taker` est son score, `defense` celui d'un défenseur.
    const scores = scoreChecked(game, { round: test.inputs as Entry, taker: 0 }, round);
    return { taker: scores[0], defense: scores[1] };
  }

  // Portée joueur ou équipe : une entrée par participant, saisies de manche répétées dans chacune.
  const entries = test.inputs as Entry[];
  const roundKeys = (definition.inputs?.round ?? []).map((f) => f.key);
  const inputs: RoundInputs = {
    round: pick(entries[0], roundKeys, true),
    [scopeOf(definition) === 'team' ? 'teams' : 'players']: entries.map((e) =>
      pick(e, roundKeys, false),
    ),
  };
  const setup =
    scopeOf(definition) === 'team' ? teamSetup(definition) : { players: entries.length };
  return scoreChecked(createGame(definition, { ...setup, options }), inputs, round);
}

function scoreChecked(game: Game, inputs: RoundInputs, round: number): number[] {
  const totals = Array(game.participants).fill(0);
  const check = validateRound(game, inputs, round, totals);
  if (!check.ok) {
    throw new TestInputError(
      `saisies refusées : ${check.errors.map((e) => `${e.path} : ${e.message}`).join(' ; ')}`,
    );
  }
  return scoreRound(game, inputs, totals, round);
}

function sameScores(a: TestScores, b: TestScores): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
