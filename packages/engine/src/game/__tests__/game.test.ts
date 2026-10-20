import {
  definition,
  lateBonus,
  skullKingLike,
  specDefinition,
  tarotLike,
  teamGame,
} from '../../__fixtures__/games';

import {
  computeGridTotals,
  computeTotals,
  createGame,
  diffRanking,
  GameSetupError,
  isFinished,
  isGridComplete,
  participantOf,
  rank,
  ScoringError,
  scoreRound,
  type RoundInputs,
} from '..';

const skyjoRound = (...players: [number, boolean][]): RoundInputs => ({
  players: players.map(([points, finisher]) => ({ points, finisher })),
});

describe('createGame', () => {
  it('complète les options par leurs valeurs par défaut', () => {
    const game = createGame(specDefinition('Skyjo'), { players: 3, options: { threshold: 150 } });
    expect(game).toMatchObject({ options: { threshold: 150, double: true }, participants: 3 });
    expect(Object.isFrozen(game)).toBe(true);
  });

  it.each<[string, () => unknown, string]>([
    [
      'trop de joueurs',
      () => createGame(specDefinition('Skyjo'), { players: 9 }),
      '9 joueurs : ce jeu se joue de 2 à 8',
    ],
    [
      'option inconnue',
      () => createGame(specDefinition('Skyjo'), { players: 2, options: { seuil: 1 } }),
      'option inconnue « seuil »',
    ],
    [
      'option invalide',
      () => createGame(specDefinition('Skyjo'), { players: 2, options: { double: 'oui' } }),
      'valeur "oui" invalide pour l’option « Doubler le score du finisseur »',
    ],
    [
      'équipes absentes',
      () => createGame(specDefinition('Coinche'), { players: 4 }),
      'indiquer l’équipe de chaque joueur',
    ],
    [
      'équipe déséquilibrée',
      () => createGame(specDefinition('Coinche'), { players: 4, teamOfPlayer: [0, 0, 0, 1] }),
      'l’équipe 1 compte 3 joueurs au lieu de 2',
    ],
    [
      'équipe inconnue',
      () => createGame(specDefinition('Coinche'), { players: 4, teamOfPlayer: [0, 1, 2, 1] }),
      'équipe inconnue : 2 équipes numérotées de 0 à 1',
    ],
  ])('refuse : %s', (_label, create, message) => {
    expect(create).toThrow(GameSetupError);
    expect(create).toThrow(message);
  });

  it('associe chaque joueur à son participant', () => {
    const coinche = createGame(specDefinition('Coinche'), {
      players: 4,
      teamOfPlayer: [0, 1, 0, 1],
    });
    expect(coinche.participants).toBe(2);
    expect([0, 1, 2, 3].map((p) => participantOf(coinche, p))).toEqual([0, 1, 0, 1]);
    const skyjo = createGame(specDefinition('Skyjo'), { players: 3 });
    expect(participantOf(skyjo, 2)).toBe(2);
  });
});

describe('portée joueur (Skyjo)', () => {
  const game = createGame(specDefinition('Skyjo'), { players: 3 });

  it('double le finisseur qui n’a pas strictement le plus bas', () => {
    expect(scoreRound(game, skyjoRound([10, true], [8, false], [12, false]), [0, 0, 0], 1)).toEqual(
      [20, 8, 12],
    );
    expect(scoreRound(game, skyjoRound([5, true], [8, false], [12, false]), [0, 0, 0], 1)).toEqual([
      5, 8, 12,
    ]);
  });

  it('respecte l’option de doublement', () => {
    const plain = createGame(specDefinition('Skyjo'), { players: 3, options: { double: false } });
    expect(
      scoreRound(plain, skyjoRound([10, true], [8, false], [12, false]), [0, 0, 0], 1),
    ).toEqual([10, 8, 12]);
  });

  it('additionne les manches et détecte la fin au seuil', () => {
    const rounds = [
      skyjoRound([40, false], [10, true], [20, false]),
      skyjoRound([45, false], [30, true], [5, false]),
      skyjoRound([20, true], [12, false], [30, false]),
    ];
    const standings = computeTotals(game, rounds);
    expect(standings.rounds).toEqual([
      [40, 10, 20],
      [45, 60, 5],
      [40, 12, 30],
    ]);
    expect(standings.running).toEqual([
      [40, 10, 20],
      [85, 70, 25],
      [125, 82, 55],
    ]);
    expect(standings.totals).toEqual([125, 82, 55]);
    expect(isFinished(game, { totals: standings.running[1], rounds: 2 })).toBe(false);
    expect(isFinished(game, { totals: standings.totals, rounds: 3 })).toBe(true);
    expect(rank(game, standings.totals)).toEqual([3, 2, 1]);
  });

  it('commence à zéro sans manche', () => {
    expect(computeTotals(game, [])).toEqual({ rounds: [], running: [], totals: [0, 0, 0] });
  });
});

describe('recalcul', () => {
  const game = createGame(lateBonus(), { players: 2 });
  const round = (a: number, b: number): RoundInputs => ({
    players: [{ points: a }, { points: b }],
  });
  const rounds = [round(30, 10), round(30, 10), round(10, 10), round(0, 20)];

  it('donne toujours le même résultat à partir des manches brutes', () => {
    const first = computeTotals(game, rounds);
    expect(computeTotals(game, rounds)).toEqual(first);
    expect(computeTotals(game, structuredClone(rounds))).toEqual(first);
    // Le bonus s'applique dès la manche qui suit le passage à 50.
    expect(first.rounds).toEqual([
      [30, 10],
      [30, 10],
      [15, 15],
      [5, 25],
    ]);
  });

  it('recalcule les manches suivantes quand on modifie une manche au milieu', () => {
    const edited = [...rounds];
    edited[1] = round(10, 10); // personne n'atteint plus 50 après la 2ᵉ manche…
    const after = computeTotals(game, edited);
    expect(after.running).toEqual([
      [30, 10],
      [40, 20],
      [50, 30], // … le bonus ne s'applique pas à la 3ᵉ…
      [55, 55], // … mais à la 4ᵉ, puisque 50 est atteint.
    ]);
    expect(after.rounds[0]).toEqual(computeTotals(game, rounds).rounds[0]);
  });

  it('supprimer une manche équivaut à recalculer sans elle', () => {
    const without = computeTotals(game, [rounds[0], rounds[2], rounds[3]]);
    expect(without.totals).toEqual([40 + 0, 20 + 20]);
  });

  it('évite le bruit des flottants dans les totaux', () => {
    const decimal = definition({
      ...specDefinition('Skyjo'),
      id: 'decimal',
      scoring: { score: 'points / 10' },
    });
    const g = createGame(decimal, { players: 2 });
    const r = skyjoRound([1, false], [2, false]);
    expect(computeTotals(g, [r, r, r]).totals).toEqual([0.3, 0.6]);
  });
});

describe('portée équipe', () => {
  const game = createGame(teamGame(), { players: 4, teamOfPlayer: [0, 1, 0, 1] });

  it('donne un score par équipe, partagé par les coéquipiers', () => {
    const inputs: RoundInputs = { round: { capot: false }, teams: [{ pts: 100 }, { pts: 62 }] };
    expect(scoreRound(game, inputs, [0, 0], 1)).toEqual([100, 62]);
    expect(
      scoreRound(game, { round: { capot: true }, teams: [{ pts: 162 }, { pts: 0 }] }, [0, 0], 1),
    ).toEqual([250, 0]);
  });

  it('utilise les options de la partie pour la fin', () => {
    expect(isFinished(game, { totals: [480, 300], rounds: 4 })).toBe(false);
    expect(isFinished(game, { totals: [510, 300], rounds: 5 })).toBe(true);
    const short = createGame(teamGame(), {
      players: 4,
      teamOfPlayer: [0, 1, 0, 1],
      options: { target: 300 },
    });
    expect(isFinished(short, { totals: [310, 300], rounds: 3 })).toBe(true);
  });
});

describe('portée rôle', () => {
  it('Coinche : preneur et défense selon l’équipe qui prend', () => {
    const game = createGame(specDefinition('Coinche'), { players: 4, teamOfPlayer: [0, 1, 0, 1] });
    const round = {
      contract: 80,
      coinche: 1,
      takerPts: 110,
      defensePts: 52,
      belote: 'none',
      capot: false,
    };
    expect(scoreRound(game, { round, taker: 0 }, [0, 0], 1)).toEqual([190, 50]);
    expect(scoreRound(game, { round, taker: 1 }, [0, 0], 1)).toEqual([50, 190]);
    const fallen = { ...round, contract: 90, takerPts: 105, defensePts: 107 };
    expect(scoreRound(game, { round: fallen, taker: 0 }, [0, 0], 1)).toEqual([0, 250]);
  });

  it('sans équipes : chaque défenseur marque la formule de défense', () => {
    const game = createGame(tarotLike(), { players: 4 });
    const scores = scoreRound(
      game,
      { round: { points: 61, threshold: 51 }, taker: 2 },
      [0, 0, 0, 0],
      1,
    );
    expect(scores).toEqual([-35, -35, 105, -35]);
    expect(scores.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('grille (Yams)', () => {
  const game = createGame(specDefinition('Yams'), { players: 2 });
  const full = {
    ones: 3,
    twos: 6,
    threes: 9,
    fours: 12,
    fives: 15,
    sixes: 18,
    brelan: 20,
    carre: 0,
    full: 25,
    small: 15,
    large: 0,
    yams: 50,
    chance: 22,
  };

  it('calcule les totaux dérivés, cases vides comptées 0', () => {
    expect(computeGridTotals(game, [full, { yams: 50, sixes: 30 }])).toEqual([230, 80]);
  });

  it('se termine quand toutes les cases de tous les joueurs sont remplies', () => {
    const almost = { ...full } as Record<string, number>;
    delete almost.chance;
    expect(isGridComplete(game, [full, almost])).toBe(false);
    expect(isFinished(game, { totals: [0, 0], rounds: 0, grids: [full, almost] })).toBe(false);
    expect(isFinished(game, { totals: [0, 0], rounds: 0, grids: [full, full] })).toBe(true);
    expect(isGridComplete(game, [full])).toBe(false);
  });
});

describe('classement', () => {
  const highest = createGame(teamGame(), { players: 4, teamOfPlayer: [0, 1, 0, 1] });
  const lowest = createGame(specDefinition('Skyjo'), { players: 4 });

  it('les ex æquo partagent le même rang', () => {
    expect(rank(lowest, [10, 30, 10, 20])).toEqual([1, 4, 1, 3]);
    expect(rank(lowest, [5, 5, 5, 5])).toEqual([1, 1, 1, 1]);
    expect(rank(highest, [300, 300])).toEqual([1, 1]);
    expect(rank(highest, [100, 300])).toEqual([2, 1]);
  });

  it('décrit l’évolution du classement', () => {
    expect(diffRanking([1, 2, 3], [1, 3, 2])).toEqual([
      { before: 1, after: 1, gained: 0 },
      { before: 2, after: 3, gained: -1 },
      { before: 3, after: 2, gained: 1 },
    ]);
  });
});

describe('fin de partie', () => {
  it('fin manuelle quand end est absent', () => {
    const game = createGame(specDefinition('Coinche'), { players: 4, teamOfPlayer: [0, 1, 0, 1] });
    expect(isFinished(game, { totals: [5000, 0], rounds: 40 })).toBe(false);
  });

  it('peut dépendre du numéro de manche', () => {
    const game = createGame(skullKingLike(), { players: 3 });
    expect(isFinished(game, { totals: [0, 0, 0], rounds: 9 })).toBe(false);
    expect(isFinished(game, { totals: [0, 0, 0], rounds: 10 })).toBe(true);
  });
});

describe('erreurs de calcul', () => {
  const broken = (score: string, end?: string) =>
    createGame(
      definition({
        ...specDefinition('Skyjo'),
        id: 'casse',
        scoring: { score },
        ...(end && { end }),
      }),
      { players: 2 },
    );
  const inputs = skyjoRound([10, true], [0, false]);

  it('précise la formule et le participant', () => {
    const run = () => scoreRound(broken('100 / points'), inputs, [0, 0], 1);
    expect(run).toThrow(ScoringError);
    expect(run).toThrow('scoring.score (participant 2) : division par zéro (caractère 7)');
  });

  it('exige un nombre', () => {
    expect(() => scoreRound(broken('points > 3'), inputs, [0, 0], 1)).toThrow(
      'scoring.score (participant 1) : la formule doit donner un nombre',
    );
  });

  it('nomme la variable en cause', () => {
    const game = createGame(
      definition({
        ...specDefinition('Skyjo'),
        id: 'casse',
        scoring: { vars: { r: '1 / (points - 10)' }, score: 'r' },
      }),
      { players: 2 },
    );
    expect(() => scoreRound(game, inputs, [0, 0], 1)).toThrow(
      'scoring.vars.r (participant 1) : division par zéro (caractère 6)',
    );
  });

  it('exige un booléen pour la fin', () => {
    const game = broken('points', 'max(totals)');
    expect(() => isFinished(game, { totals: [1, 2], rounds: 1 })).toThrow(
      'end : la formule doit donner vrai ou faux',
    );
    const failing = broken('points', 'max(totals) / 0 > 1');
    expect(() => isFinished(failing, { totals: [1, 2], rounds: 1 })).toThrow(
      /^end : division par zéro/,
    );
  });
});
