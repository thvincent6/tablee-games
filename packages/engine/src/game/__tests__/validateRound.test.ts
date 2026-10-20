import { definition, skullKingLike, specDefinition, teamGame } from '../../__fixtures__/games';

import { createGame, validateRound, type RoundInputs } from '..';

describe('validateRound', () => {
  const skull = createGame(skullKingLike(), { players: 3 });
  const entry = (bid: number, tricks: number, bonus = 0) => ({ bid, tricks, bonus });

  it('accepte une manche cohérente', () => {
    expect(validateRound(skull, { players: [entry(1, 1), entry(0, 0), entry(2, 2)] }, 3)).toEqual({
      ok: true,
    });
  });

  it('applique les règles validate (somme des plis = numéro de manche)', () => {
    expect(validateRound(skull, { players: [entry(1, 1), entry(0, 0), entry(2, 1)] }, 3)).toEqual({
      ok: false,
      errors: [
        { path: 'validate[0]', message: 'La somme des plis doit valoir le numéro de manche.' },
      ],
    });
  });

  it.each<[string, RoundInputs, { path: string; message: string }[]]>([
    [
      'saisie manquante',
      { players: [entry(1, 1), { bid: 0, tricks: 0 }, entry(2, 2)] },
      [{ path: 'players[1].bonus', message: '« Bonus » à remplir' }],
    ],
    [
      'valeur hors bornes',
      { players: [entry(1, 1), entry(0, 0), entry(11, 2)] },
      [{ path: 'players[2].bid', message: '« Mise » : entier dans [0 ; 10] attendu' }],
    ],
    [
      'saisie inconnue',
      { players: [entry(1, 1), entry(0, 0), { ...entry(2, 2), extra: 1 }] },
      [{ path: 'players[2].extra', message: 'saisie inconnue « extra »' }],
    ],
    [
      'joueur manquant',
      { players: [entry(1, 1), entry(2, 2)] },
      [{ path: 'players', message: '3 entrées attendues, 2 reçues' }],
    ],
    ['aucune saisie', {}, [{ path: 'players', message: '3 entrées attendues, 0 reçues' }]],
  ])('refuse : %s', (_label, inputs, errors) => {
    expect(validateRound(skull, inputs, 3)).toEqual({ ok: false, errors });
  });

  it('refuse une case unique cochée deux fois (Skyjo : un seul finisseur)', () => {
    const skyjo = createGame(specDefinition('Skyjo'), { players: 2 });
    const inputs = {
      players: [
        { points: 3, finisher: true },
        { points: 5, finisher: true },
      ],
    };
    expect(validateRound(skyjo, inputs, 1)).toEqual({
      ok: false,
      errors: [
        {
          path: 'players',
          message: '« A terminé la manche » ne peut être coché que pour un seul joueur',
        },
      ],
    });
  });

  it('vérifie les saisies de manche et d’équipe (total de 162)', () => {
    const game = createGame(teamGame(), { players: 4, teamOfPlayer: [0, 1, 0, 1] });
    expect(
      validateRound(game, { round: { capot: false }, teams: [{ pts: 100 }, { pts: 62 }] }, 1),
    ).toEqual({ ok: true });
    expect(
      validateRound(game, { round: { capot: false }, teams: [{ pts: 100 }, { pts: 60 }] }, 1),
    ).toEqual({
      ok: false,
      errors: [{ path: 'validate[0]', message: 'Le total des points doit faire 162.' }],
    });
    expect(
      validateRound(game, { round: { capot: 'oui' }, teams: [{ pts: 100 }, { pts: 62 }] }, 1),
    ).toEqual({
      ok: false,
      errors: [{ path: 'round.capot', message: '« Capot » : true ou false attendu' }],
    });
  });

  it('exige le camp preneur en portée rôle', () => {
    const game = createGame(specDefinition('Coinche'), { players: 4, teamOfPlayer: [0, 1, 0, 1] });
    const round = {
      contract: 'capot',
      coinche: 2,
      takerPts: 162,
      defensePts: 0,
      belote: 'taker',
      capot: true,
    };
    expect(validateRound(game, { round, taker: 1 }, 1)).toEqual({ ok: true });
    expect(validateRound(game, { round }, 1)).toEqual({
      ok: false,
      errors: [{ path: 'taker', message: 'choisir qui prend' }],
    });
    expect(validateRound(game, { round, taker: 2 }, 1)).toMatchObject({ ok: false });
    expect(validateRound(game, { round: { ...round, contract: 85 }, taker: 0 }, 1)).toEqual({
      ok: false,
      errors: [
        {
          path: 'round.contract',
          message:
            '« Contrat » : une valeur parmi 80, 90, 100, 110, 120, 130, 140, 150, 160, "capot" attendue',
        },
      ],
    });
  });

  it('signale une règle impossible à évaluer', () => {
    const def = { ...skullKingLike(), validate: [{ rule: 'max(totals) / 0 > 1', message: 'x' }] };
    const game = createGame(def, { players: 3 });
    const result = validateRound(game, { players: [entry(1, 1), entry(0, 0), entry(2, 2)] }, 3);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          path: 'validate[0]',
          message: 'règle impossible à vérifier : division par zéro (caractère 15)',
        },
      ],
    });
  });
});

describe('bornes dynamiques $round', () => {
  const json = (bidMax: number | '$round') =>
    definition({
      id: 'cartes',
      name: 'Cartes',
      version: '1.0.0',
      engine: 1,
      archetype: 'rounds',
      players: { min: 2, max: 4 },
      winner: 'highest',
      inputs: {
        player: [
          { key: 'bid', label: 'Mise', type: 'int', min: 0, max: bidMax },
          { key: 'tricks', label: 'Plis', type: 'int', min: 0, max: '$round' },
        ],
      },
      scoring: { score: 'bid == tricks ? 20 * bid : 0' },
    });

  it('borne la saisie au numéro de la manche', () => {
    const game = createGame(json('$round'), { players: 2 });
    const round = (bid: number) => ({
      players: [
        { bid, tricks: 0 },
        { bid: 0, tricks: 0 },
      ],
    });
    expect(validateRound(game, round(3), 3)).toEqual({ ok: true });
    expect(validateRound(game, round(4), 3)).toEqual({
      ok: false,
      errors: [{ path: 'players[0].bid', message: '« Mise » : entier dans [0 ; 3] attendu' }],
    });
  });

  it('se combine avec une borne fixe', () => {
    const game = createGame(json(5), { players: 2 });
    const inputs = {
      players: [
        { bid: 5, tricks: 7 },
        { bid: 0, tricks: 0 },
      ],
    };
    expect(validateRound(game, inputs, 7)).toEqual({ ok: true });
    expect(validateRound(game, inputs, 6)).toMatchObject({
      errors: [{ path: 'players[0].tricks', message: '« Plis » : entier dans [0 ; 6] attendu' }],
    });
  });
});
