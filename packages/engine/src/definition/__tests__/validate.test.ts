import { specExample } from '../../__fixtures__/specs';

import {
  MAX_DEFINITION_BYTES,
  parseGameDefinition,
  validateGameDefinition,
  type DefinitionIssue,
} from '..';
import { ENGINE_VERSION } from '../../version';

type Json = Record<string, any>;

const clone = (game: 'Skyjo' | 'Yams' | 'Coinche'): Json => structuredClone(specExample(game));

/** Erreurs d'une définition modifiée ; [] si elle est valide. */
function errorsOf(game: 'Skyjo' | 'Yams' | 'Coinche', mutate: (def: Json) => void) {
  const def = clone(game);
  mutate(def);
  const result = validateGameDefinition(def);
  return result.ok ? [] : result.errors;
}

const issue = (code: DefinitionIssue['code'], path: string, message: string) => ({
  code,
  path,
  message,
});

describe('version du moteur', () => {
  it('refuse un moteur plus récent avec le code ENGINE_TOO_OLD, avant tout autre contrôle', () => {
    const errors = errorsOf('Skyjo', (d) => {
      d.engine = ENGINE_VERSION + 1;
      d.nouveauChamp = { inconnu: true };
    });
    expect(errors).toEqual([
      issue(
        'ENGINE_TOO_OLD',
        'engine',
        `ce jeu demande la version ${ENGINE_VERSION + 1} du moteur, l’app connaît la version ${ENGINE_VERSION} : mets l’app à jour`,
      ),
    ]);
  });

  it('refuse un moteur invalide', () => {
    expect(errorsOf('Skyjo', (d) => (d.engine = 0))).toEqual([
      issue('SCHEMA', 'engine', 'Trop petit : nombre doit être >=1'),
    ]);
  });
});

describe('structure (schéma)', () => {
  it.each<[string, (d: Json) => void, ReturnType<typeof issue>]>([
    [
      'champ obligatoire manquant',
      (d) => delete d.name,
      issue('SCHEMA', 'name', 'Entrée invalide : chaîne de caractères attendu, indéfini reçu'),
    ],
    [
      'clé inconnue (faute de frappe)',
      (d) => (d.winer = 'lowest'),
      issue('SCHEMA', '', 'Clé non reconnue : "winer"'),
    ],
    [
      'identifiant mal formé',
      (d) => (d.id = 'Sky Jo'),
      issue('SCHEMA', 'id', 'identifiant invalide : minuscules, chiffres et tirets'),
    ],
    [
      'version non semver',
      (d) => (d.version = '1.0'),
      issue('SCHEMA', 'version', 'version invalide : format semver attendu (ex. 1.0.0)'),
    ],
    [
      'archétype inconnu',
      (d) => (d.archetype = 'manches'),
      issue(
        'SCHEMA',
        'archetype',
        'Option invalide : une valeur parmi "rounds"|"contract"|"grid"|"counter" attendue',
      ),
    ],
    [
      'type de saisie inconnu',
      (d) => (d.inputs.player[0].type = 'integer'),
      issue('SCHEMA', 'inputs.player[0].type', 'type inconnu : int, bool, enum ou pick attendu'),
    ],
    [
      'borne non entière',
      (d) => (d.inputs.player[0].min = -24.5),
      issue('SCHEMA', 'inputs.player[0].min', 'entier ou "$round" attendu'),
    ],
    [
      'clé de saisie invalide',
      (d) => (d.inputs.player[0].key = '2points'),
      issue(
        'SCHEMA',
        'inputs.player[0].key',
        'clé invalide : lettres, chiffres et _ uniquement, sans commencer par un chiffre',
      ),
    ],
    [
      'lien non https',
      (d) => (d.source = 'http://example.com'),
      issue('SCHEMA', 'source', 'lien https attendu'),
    ],
    [
      'formule vide',
      (d) => (d.scoring.score = ''),
      issue(
        'SCHEMA',
        'scoring.score',
        'Trop petit : chaîne de caractères doit avoir >=1 caractères',
      ),
    ],
  ])('%s', (_label, mutate, expected) => {
    expect(errorsOf('Skyjo', mutate)).toEqual([expected]);
  });

  it('explique un type d’option inconnu', () => {
    expect(errorsOf('Skyjo', (d) => (d.options[1].type = 'boolean'))).toEqual([
      issue('SCHEMA', 'options[1].type', 'type d’option inconnu : int, bool ou enum attendu'),
    ]);
  });

  it('accepte un lien $schema pour l’éditeur', () => {
    expect(errorsOf('Skyjo', (d) => (d.$schema = '../../schema/game.schema.json'))).toEqual([]);
  });

  it('refuse autre chose qu’un objet', () => {
    const result = validateGameDefinition([1, 2]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatchObject({ code: 'SCHEMA', path: '' });
  });
});

describe('cohérence', () => {
  it.each<['Skyjo' | 'Yams' | 'Coinche', string, (d: Json) => void, ReturnType<typeof issue>]>([
    [
      'Skyjo',
      'joueurs min > max',
      (d) => (d.players = { min: 5, max: 2 }),
      issue('INCONSISTENT', 'players', 'min (5) dépasse max (2)'),
    ],
    [
      'Coinche',
      'équipes incompatibles avec players',
      (d) => (d.teams = { count: 3, size: 2 }),
      issue('INCONSISTENT', 'teams', '3 équipes de 2 font 6 joueurs, hors de players (4 à 4)'),
    ],
    [
      'Skyjo',
      'option en double',
      (d) => d.options.push({ ...d.options[0] }),
      issue('INCONSISTENT', 'options[2].key', 'option « threshold » en double'),
    ],
    [
      'Skyjo',
      'défaut hors bornes',
      (d) => Object.assign(d.options[0], { min: 50, max: 90 }),
      issue('INCONSISTENT', 'options[0].default', 'valeur par défaut hors de [50 ; 90]'),
    ],
    [
      'Skyjo',
      'saisie en double',
      (d) => d.inputs.player.push({ key: 'points', label: 'Encore', type: 'bool' }),
      issue(
        'INCONSISTENT',
        'inputs.player[2].key',
        'clé « points » déjà utilisée par inputs.player[0]',
      ),
    ],
    [
      'Skyjo',
      'nom réservé',
      (d) => d.inputs.player.push({ key: 'round', label: 'Manche', type: 'int' }),
      issue('INCONSISTENT', 'inputs.player[2].key', '« round » est un nom réservé'),
    ],
    [
      'Skyjo',
      'min > max d’une saisie',
      (d) => (d.inputs.player[0].min = 200),
      issue('INCONSISTENT', 'inputs.player[0]', 'min (200) dépasse max (144)'),
    ],
    [
      'Coinche',
      'libellés en nombre différent',
      (d) => d.inputs.round[1].labels.pop(),
      issue('INCONSISTENT', 'inputs.round[1].labels', '2 libellés pour 3 valeurs'),
    ],
    [
      'Skyjo',
      'score manquant',
      (d) => delete d.scoring.score,
      issue('INCONSISTENT', 'scoring.score', 'formule de score manquante'),
    ],
    [
      'Coinche',
      'formule de défense manquante',
      (d) => delete d.scoring.defense,
      issue('INCONSISTENT', 'scoring.defense', 'formule de la défense manquante'),
    ],
    [
      'Skyjo',
      'portée équipe sans équipes',
      (d) => (d.scoring.scope = 'team'),
      issue('INCONSISTENT', 'scoring.scope', 'la portée team demande un bloc teams'),
    ],
    [
      'Skyjo',
      'cases hors grille',
      (d) => (d.cells = [{ key: 'a', label: 'A', type: 'bool' }]),
      issue('INCONSISTENT', 'cells', 'cells est réservé à l’archétype grid'),
    ],
    [
      'Skyjo',
      'grid_complete hors grille',
      (d) => (d.end = 'grid_complete'),
      issue('INCONSISTENT', 'end', 'grid_complete est réservé à l’archétype grid'),
    ],
    [
      'Yams',
      'grille sans cases',
      (d) => delete d.cells,
      issue('INCONSISTENT', 'cells', 'une grille doit définir ses cases'),
    ],
    [
      'Yams',
      'variable qui porte le nom d’une case',
      (d) => (d.scoring.vars.chance = '1'),
      issue(
        'INCONSISTENT',
        'scoring.vars.chance',
        'la variable « chance » porte le nom d’une saisie',
      ),
    ],
  ])('%s : %s', (game, _label, mutate, expected) => {
    expect(errorsOf(game, mutate)).toEqual([expected]);
  });

  it('accepte un compteur sans formule ni saisie', () => {
    const counter = {
      id: 'compteur',
      name: 'Compteur',
      version: '1.0.0',
      engine: 1,
      archetype: 'counter',
      players: { min: 1, max: 8 },
      winner: 'highest',
    };
    expect(validateGameDefinition(counter)).toMatchObject({ ok: true });
    expect(validateGameDefinition({ ...counter, scoring: { score: '1' } })).toEqual({
      ok: false,
      errors: [issue('INCONSISTENT', 'scoring', 'un compteur n’a pas de formule de score')],
    });
  });
});

describe('formules et variables', () => {
  it.each<['Skyjo' | 'Yams' | 'Coinche', string, (d: Json) => void, ReturnType<typeof issue>]>([
    [
      'Skyjo',
      'formule mal écrite',
      (d) => (d.scoring.score = 'points * (2'),
      issue('FORMULA', 'scoring.score', 'parenthèse fermante attendue (caractère 12)'),
    ],
    [
      'Skyjo',
      'fonction inconnue',
      (d) => (d.end = 'maxi(totals) >= 100'),
      issue(
        'FORMULA',
        'end',
        'fonction inconnue « maxi » (autorisées : min, max, abs, floor, ceil, sum, count, round) (caractère 1)',
      ),
    ],
    [
      'Skyjo',
      'variable inconnue',
      (d) => (d.scoring.score = 'point * 2'),
      issue('UNKNOWN_VARIABLE', 'scoring.score', 'variable inconnue « point » (caractère 1)'),
    ],
    [
      'Skyjo',
      'option inconnue',
      (d) => (d.end = 'max(totals) >= opt.seuil'),
      issue('UNKNOWN_VARIABLE', 'end', 'variable inconnue « opt.seuil » (caractère 16)'),
    ],
    [
      'Skyjo',
      'saisie inconnue des autres',
      (d) => (d.scoring.score = 'points - min(others.mise)'),
      issue(
        'UNKNOWN_VARIABLE',
        'scoring.score',
        'variable inconnue « others.mise » (caractère 14)',
      ),
    ],
    [
      'Skyjo',
      'groupe utilisé seul',
      (d) => (d.scoring.score = 'opt'),
      issue(
        'UNKNOWN_VARIABLE',
        'scoring.score',
        '« opt » est un groupe : préciser un champ (threshold, double) (caractère 1)',
      ),
    ],
    [
      'Skyjo',
      'champ d’une valeur',
      (d) => (d.scoring.score = 'points.max'),
      issue(
        'UNKNOWN_VARIABLE',
        'scoring.score',
        '« points » n’a pas de champ « max » (caractère 1)',
      ),
    ],
    [
      'Skyjo',
      'saisie dans la fin de partie',
      (d) => (d.end = 'points > 100'),
      issue('UNKNOWN_VARIABLE', 'end', 'variable inconnue « points » (caractère 1)'),
    ],
    [
      'Coinche',
      'référence en avant dans vars',
      (d) => (d.scoring.vars = { pot: 'c * 2', ...d.scoring.vars }),
      issue(
        'FORMULA',
        'scoring.vars.pot',
        'elle utilise « c », déclarée plus loin : déplacer « c » avant',
      ),
    ],
    [
      'Coinche',
      'others en portée rôle',
      (d) => (d.scoring.taker = 'sum(others.takerPts)'),
      issue('UNKNOWN_VARIABLE', 'scoring.taker', 'variable inconnue « others » (caractère 5)'),
    ],
    [
      'Yams',
      'case inconnue',
      (d) => (d.scoring.score = d.scoring.score.replace('chance', 'chanse')),
      issue('UNKNOWN_VARIABLE', 'scoring.score', 'variable inconnue « chanse » (caractère 64)'),
    ],
  ])('%s : %s', (game, _label, mutate, expected) => {
    expect(errorsOf(game, mutate)).toEqual([expected]);
  });

  it('vérifie les règles validate', () => {
    expect(
      errorsOf('Skyjo', (d) => {
        d.validate = [
          { rule: 'count(all.finisher) <= 1', message: 'Un seul finisseur' },
          { rule: 'sum(all.mise) == round', message: 'Mises' },
        ];
      }),
    ).toEqual([
      issue('UNKNOWN_VARIABLE', 'validate[1].rule', 'variable inconnue « all.mise » (caractère 5)'),
    ]);
  });

  it('s’arrête à la cohérence avant de vérifier les formules', () => {
    const errors = errorsOf('Yams', (d) => delete d.cells);
    expect(errors).toEqual([issue('INCONSISTENT', 'cells', 'une grille doit définir ses cases')]);
  });

  it('renvoie toutes les erreurs d’une même étape', () => {
    const errors = errorsOf('Skyjo', (d) => {
      d.scoring.score = 'point';
      d.end = 'max(totaux)';
    });
    expect(errors.map((e) => e.path)).toEqual(['scoring.score', 'end']);
  });
});

describe('cas de test', () => {
  it.each<['Skyjo' | 'Yams' | 'Coinche', string, (d: Json) => void, ReturnType<typeof issue>]>([
    [
      'Skyjo',
      'option inconnue',
      (d) => (d.tests[0].options = { seuil: 100 }),
      issue('INVALID_TEST', 'tests[0].options.seuil', 'option inconnue « seuil »'),
    ],
    [
      'Skyjo',
      'option de mauvais type',
      (d) => (d.tests[0].options = { double: 1 }),
      issue('INVALID_TEST', 'tests[0].options.double', 'valeur 1 invalide pour cette option'),
    ],
    [
      'Skyjo',
      'saisie manquante',
      (d) => delete d.tests[0].inputs[1].finisher,
      issue('INVALID_TEST', 'tests[0].inputs[1]', 'saisie « finisher » manquante'),
    ],
    [
      'Skyjo',
      'saisie inconnue',
      (d) => (d.tests[0].inputs[0].bonus = 3),
      issue('INVALID_TEST', 'tests[0].inputs[0].bonus', 'saisie inconnue « bonus »'),
    ],
    [
      'Skyjo',
      'valeur hors bornes',
      (d) => (d.tests[0].inputs[0].points = 200),
      issue(
        'INVALID_TEST',
        'tests[0].inputs[0].points',
        'valeur 200 invalide : entier dans [-24 ; 144] attendu',
      ),
    ],
    [
      'Skyjo',
      'unique coché deux fois',
      (d) => (d.tests[0].inputs[1].finisher = true),
      issue(
        'INVALID_TEST',
        'tests[0].inputs',
        '« finisher » ne peut être vrai que pour une seule entrée',
      ),
    ],
    [
      'Skyjo',
      'trop de joueurs',
      (d) => {
        d.tests[0].inputs = Array(9).fill({ points: 1, finisher: false });
        d.tests[0].expect = Array(9).fill(1);
      },
      issue('INVALID_TEST', 'tests[0].inputs', '9 joueurs, hors de players (2 à 8)'),
    ],
    [
      'Skyjo',
      'scores attendus en nombre différent',
      (d) => d.tests[0].expect.pop(),
      issue('INVALID_TEST', 'tests[0].expect', 'une liste de 2 scores est attendue'),
    ],
    [
      'Skyjo',
      'objet au lieu d’une liste',
      (d) => (d.tests[0].inputs = { points: 1, finisher: true }),
      issue(
        'INVALID_TEST',
        'tests[0].inputs',
        'une liste est attendue : une entrée par joueur ou équipe',
      ),
    ],
    [
      'Coinche',
      'valeur hors de enum',
      (d) => (d.tests[0].inputs.contract = 85),
      issue(
        'INVALID_TEST',
        'tests[0].inputs.contract',
        'valeur 85 invalide : une valeur parmi 80, 90, 100, 110, 120, 130, 140, 150, 160, "capot" attendue',
      ),
    ],
    [
      'Coinche',
      'attendu au mauvais format',
      (d) => (d.tests[0].expect = [190, 50]),
      issue('INVALID_TEST', 'tests[0].expect', '{ "taker", "defense" } attendu'),
    ],
    [
      'Coinche',
      'liste au lieu d’un objet',
      (d) => (d.tests[0].inputs = [d.tests[0].inputs]),
      issue('INVALID_TEST', 'tests[0].inputs', 'un objet de saisies est attendu, pas une liste'),
    ],
    [
      'Yams',
      'valeur absente de pick',
      (d) => (d.tests[0].inputs.full = 20),
      issue(
        'INVALID_TEST',
        'tests[0].inputs.full',
        'valeur 20 invalide : une valeur parmi 0, 25 attendue',
      ),
    ],
    [
      'Yams',
      'total attendu au mauvais format',
      (d) => (d.tests[0].expect = [230]),
      issue('INVALID_TEST', 'tests[0].expect', 'un nombre (total du joueur) attendu'),
    ],
  ])('%s : %s', (game, _label, mutate, expected) => {
    expect(errorsOf(game, mutate)).toEqual([expected]);
  });
});

describe('fichier', () => {
  it('valide le texte d’un fichier', () => {
    expect(parseGameDefinition(JSON.stringify(specExample('Skyjo')))).toMatchObject({ ok: true });
  });

  it('refuse un JSON mal formé', () => {
    const result = parseGameDefinition('{ "id": "skyjo", }');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatchObject({ code: 'INVALID_JSON', path: '' });
    expect(!result.ok && result.errors[0].message).toMatch(/^JSON invalide : /);
  });

  it('refuse un fichier de plus de 200 Ko, octets accentués compris', () => {
    const def = clone('Skyjo');
    def.summary = 'é'.repeat(250);
    const bytes = new TextEncoder().encode(JSON.stringify(def)).length;
    const padding = ' '.repeat(MAX_DEFINITION_BYTES - bytes);
    const atLimit = JSON.stringify(def) + padding;
    expect(new TextEncoder().encode(atLimit).length).toBe(MAX_DEFINITION_BYTES);
    expect(parseGameDefinition(atLimit)).toMatchObject({ ok: true });
    expect(parseGameDefinition(atLimit + ' ')).toEqual({
      ok: false,
      errors: [issue('TOO_LARGE', '', 'fichier trop gros : 201 Ko, 200 Ko au plus')],
    });
  });
});

describe('portées équipe et rôle', () => {
  /** Jeu en équipes minimal : points par équipe, belote annoncée pour la manche. */
  const teamGame = (): Json => ({
    id: 'equipes',
    name: 'Jeu en équipes',
    version: '1.0.0',
    engine: 1,
    archetype: 'rounds',
    players: { min: 4, max: 4 },
    teams: { count: 2, size: 2 },
    winner: 'highest',
    options: [{ key: 'mode', label: 'Mode', type: 'enum', values: ['a', 'b'], default: 'a' }],
    inputs: {
      team: [
        { key: 'pts', label: 'Points', type: 'int', min: 0, max: 162 },
        { key: 'won', label: 'Gagne', type: 'bool', unique: true },
      ],
      round: [{ key: 'bonus', label: 'Bonus', type: 'int', min: 0, max: 20 }],
    },
    scoring: { scope: 'team', score: "pts + (won ? bonus : 0) + (opt.mode == 'b' ? 1 : 0)" },
    end: 'max(totals) >= 1000',
    validate: [{ rule: 'sum(all.pts) == 162', message: 'Le total fait 162' }],
    tests: [
      {
        name: 'Une manche',
        options: { mode: 'b' },
        inputs: [
          { pts: 100, won: true, bonus: 20 },
          { pts: 62, won: false, bonus: 20 },
        ],
        expect: [121, 63],
      },
    ],
  });

  const check = (mutate: (d: Json) => void) => {
    const def = teamGame();
    mutate(def);
    const result = validateGameDefinition(def);
    return result.ok ? [] : result.errors;
  };

  it('accepte un jeu en équipes avec saisies de manche', () => {
    expect(check(() => {})).toEqual([]);
  });

  it.each<[string, (d: Json) => void, ReturnType<typeof issue>]>([
    [
      'nombre d’équipes du test',
      (d) => {
        d.tests[0].inputs.push({ pts: 0, won: false, bonus: 20 });
        d.tests[0].expect.push(0);
      },
      issue('INVALID_TEST', 'tests[0].inputs', '2 équipes attendues, 3 reçues'),
    ],
    [
      'saisie de manche différente selon l’entrée',
      (d) => (d.tests[0].inputs[1].bonus = 10),
      issue(
        'INVALID_TEST',
        'tests[0].inputs',
        'la saisie de manche « bonus » doit être identique dans chaque entrée',
      ),
    ],
    [
      'option enum hors valeurs',
      (d) => (d.tests[0].options.mode = 'c'),
      issue('INVALID_TEST', 'tests[0].options.mode', 'valeur "c" invalide pour cette option'),
    ],
    [
      'défaut d’option enum absent',
      (d) => (d.options[0].default = 'c'),
      issue('INCONSISTENT', 'options[0].default', 'valeur par défaut absente de values'),
    ],
    [
      'unique sur une saisie de manche',
      (d) => (d.inputs.round[0] = { key: 'bonus', label: 'B', type: 'bool', unique: true }),
      issue(
        'INCONSISTENT',
        'inputs.round[0].unique',
        'unique n’a de sens que pour une saisie par joueur ou par équipe',
      ),
    ],
    [
      'saisies d’équipe sans équipes',
      (d) => {
        delete d.teams;
        d.scoring.scope = 'player';
      },
      issue('INCONSISTENT', 'inputs.team', 'des saisies par équipe demandent un bloc teams'),
    ],
    [
      'taker hors portée rôle',
      (d) => (d.scoring.taker = '1'),
      issue('INCONSISTENT', 'scoring.taker', 'taker n’existe que pour la portée role'),
    ],
    [
      'score en portée rôle',
      (d) => Object.assign(d.scoring, { scope: 'role', taker: '1', defense: '0' }),
      issue('INCONSISTENT', 'scoring.score', 'la portée role utilise taker et defense, pas score'),
    ],
    [
      'manches sans scoring',
      (d) => delete d.scoring,
      issue('INCONSISTENT', 'scoring', 'l’archétype rounds demande un bloc scoring'),
    ],
    [
      'valeur booléenne attendue',
      (d) => (d.tests[0].inputs[0].won = 1),
      issue('INVALID_TEST', 'tests[0].inputs[0].won', 'valeur 1 invalide : true ou false attendu'),
    ],
    [
      'entier attendu',
      (d) => (d.tests[0].inputs[0].pts = 1.5),
      issue(
        'INVALID_TEST',
        'tests[0].inputs[0].pts',
        'valeur 1.5 invalide : entier dans [0 ; 162] attendu',
      ),
    ],
    [
      'validate sur saisie inconnue',
      (d) => (d.validate[0].rule = 'sum(all.points) == 162'),
      issue(
        'UNKNOWN_VARIABLE',
        'validate[0].rule',
        'variable inconnue « all.points » (caractère 5)',
      ),
    ],
    [
      'champ en trop',
      (d) => (d.scoring.score = 'opt.mode.x'),
      issue(
        'UNKNOWN_VARIABLE',
        'scoring.score',
        '« opt.mode » n’a pas de champ « x » (caractère 1)',
      ),
    ],
  ])('%s', (_label, mutate, expected) => {
    expect(check(mutate)).toEqual([expected]);
  });

  it('refuse les saisies et les formules d’un compteur', () => {
    const errors = check((d) => (d.archetype = 'counter'));
    expect(errors).toEqual([
      issue('INCONSISTENT', 'scoring', 'un compteur n’a pas de formule de score'),
      issue('INCONSISTENT', 'inputs', 'un compteur n’a pas de saisies'),
    ]);
  });

  it('refuse une grille en portée équipe et des saisies dans une grille', () => {
    const errors = errorsOf('Yams', (d) => {
      d.scoring.scope = 'team';
      d.inputs = { player: [] };
    });
    expect(errors).toEqual([
      issue('INCONSISTENT', 'inputs', 'une grille se saisit par cases : utiliser cells'),
      issue('INCONSISTENT', 'scoring.scope', 'une grille se calcule par joueur'),
      issue('INCONSISTENT', 'scoring.scope', 'la portée team demande un bloc teams'),
    ]);
  });
});

describe('marques', () => {
  const marks = [{ when: 'points > 50', label: 'Lourd' }];

  it('accepte des marques en portée joueur', () => {
    expect(errorsOf('Skyjo', (d) => (d.scoring.marks = marks))).toEqual([]);
  });

  it('vérifie les noms de la formule when', () => {
    expect(
      errorsOf('Skyjo', (d) => (d.scoring.marks = [{ when: 'pts > 50', label: 'Lourd' }])),
    ).toEqual([
      issue('UNKNOWN_VARIABLE', 'scoring.marks[0].when', 'variable inconnue « pts » (caractère 1)'),
    ]);
  });

  it('refuse les marques d’un contrat ou d’une grille', () => {
    const message = 'les marques n’existent que pour un score par joueur ou par équipe, en manches';
    expect(
      errorsOf('Coinche', (d) => (d.scoring.marks = [{ when: 'capot', label: 'Capot' }])),
    ).toEqual([issue('INCONSISTENT', 'scoring.marks', message)]);
    expect(
      errorsOf('Yams', (d) => (d.scoring.marks = [{ when: 'yams > 0', label: 'Yams' }])),
    ).toEqual([issue('INCONSISTENT', 'scoring.marks', message)]);
  });

  it('limite la longueur d’une marque', () => {
    const errors = errorsOf(
      'Skyjo',
      (d) => (d.scoring.marks = [{ when: 'true', label: 'x'.repeat(13) }]),
    );
    expect(errors).toEqual([
      expect.objectContaining({ code: 'SCHEMA', path: 'scoring.marks[0].label' }),
    ]);
  });
});

describe('bornes dynamiques $round', () => {
  const withBid = (d: Json, max: unknown) => {
    d.inputs.player.push({ key: 'bid', label: 'Mise', type: 'int', min: 0, max });
    for (const test of d.tests) for (const entry of test.inputs) entry.bid = 0;
  };

  it('accepte "$round" comme borne d’une saisie', () => {
    expect(errorsOf('Skyjo', (d) => withBid(d, '$round'))).toEqual([]);
  });

  it('refuse une autre chaîne', () => {
    expect(errorsOf('Skyjo', (d) => withBid(d, '$manche'))).toEqual([
      expect.objectContaining({ code: 'SCHEMA', path: 'inputs.player[2].max' }),
    ]);
  });

  it('refuse "$round" dans une grille', () => {
    expect(errorsOf('Yams', (d) => (d.cells[6].max = '$round'))).toEqual([
      issue(
        'INCONSISTENT',
        'cells[6]',
        '$round n’existe que pour les saisies d’une manche, pas pour une grille',
      ),
    ]);
  });

  it('vérifie les cas de test avec leur numéro de manche', () => {
    const errors = errorsOf('Skyjo', (d) => {
      withBid(d, '$round');
      d.tests[0].inputs[0].bid = 2;
    });
    expect(errors).toEqual([
      issue(
        'INVALID_TEST',
        'tests[0].inputs[0].bid',
        'valeur 2 invalide : entier dans [0 ; 1] attendu',
      ),
    ]);
    expect(
      errorsOf('Skyjo', (d) => {
        withBid(d, '$round');
        d.tests[0].inputs[0].bid = 2;
        d.tests[0].round = 2;
      }),
    ).toEqual([]);
  });
});
