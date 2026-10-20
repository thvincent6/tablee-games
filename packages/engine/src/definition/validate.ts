import { z } from 'zod';

import {
  compile,
  compileVars,
  ExpressionError,
  parseTemplate,
  VarsError,
  type CompiledFormula,
  type TemplatePart,
} from '../expression';
import { keywords } from '../expression/lexer';
import { ENGINE_VERSION } from '../version';
import {
  endNames,
  RESERVED_NAMES,
  scopeFieldsOf,
  scopeOf,
  scoringNames,
  validateNames,
  type Names,
} from './names';
import {
  acceptsInput,
  acceptsOption,
  describeBounds,
  describeField,
  inBounds,
  ROUND_BOUND,
  type Bound,
} from './fields';
import {
  gameDefinitionSchema,
  MAX_DEFINITION_BYTES,
  type GameDefinition,
  type InputField,
} from './schema';

export type DefinitionErrorCode =
  /** Le texte n'est pas du JSON. */
  | 'INVALID_JSON'
  /** Fichier de plus de 200 Ko. */
  | 'TOO_LARGE'
  /** Le jeu demande une version du moteur plus récente que celle de l'app. */
  | 'ENGINE_TOO_OLD'
  /** Structure non conforme au schéma (champ manquant, type, clé inconnue…). */
  | 'SCHEMA'
  /** Structure valide mais incohérente (portée, archétype, bornes, doublons…). */
  | 'INCONSISTENT'
  /** Formule mal écrite. */
  | 'FORMULA'
  /** Formule qui utilise un nom inexistant. */
  | 'UNKNOWN_VARIABLE'
  /** Cas de test mal formé. */
  | 'INVALID_TEST';

export type DefinitionIssue = {
  code: DefinitionErrorCode;
  /** Chemin dans le JSON : `scoring.vars.made`, `inputs.player[1].max`… ; vide pour la racine. */
  path: string;
  /** Raison, en français. */
  message: string;
};

export type ValidationResult =
  { ok: true; definition: GameDefinition } | { ok: false; errors: DefinitionIssue[] };

const french = z.locales.fr().localeError;

/** Valide le texte d'un fichier de définition : taille, JSON, puis `validateGameDefinition`. */
export function parseGameDefinition(json: string): ValidationResult {
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_DEFINITION_BYTES) {
    return fail(
      'TOO_LARGE',
      '',
      `fichier trop gros : ${Math.ceil(bytes / 1024)} Ko, ${MAX_DEFINITION_BYTES / 1024} Ko au plus`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    return fail('INVALID_JSON', '', `JSON invalide : ${(error as Error).message}`);
  }
  return validateGameDefinition(data);
}

/**
 * Valide une définition par étapes, chacune ne s'exécutant que si la précédente réussit :
 * 1. version du moteur (`ENGINE_TOO_OLD`) ;
 * 2. structure, avec le schéma Zod (`SCHEMA`) ;
 * 3. cohérence : joueurs, archétype, portée, bornes, doublons, noms réservés (`INCONSISTENT`) ;
 * 4. formules analysables, variables existantes, cas de test bien formés.
 * Toutes les erreurs d'une étape sont renvoyées, chacune avec son chemin.
 */
export function validateGameDefinition(data: unknown): ValidationResult {
  // Avant tout : un jeu pour un moteur plus récent peut contenir des champs que l'app ignore.
  const engine = (data as { engine?: unknown } | null)?.engine;
  if (typeof engine === 'number' && Number.isInteger(engine) && engine > ENGINE_VERSION) {
    return fail(
      'ENGINE_TOO_OLD',
      'engine',
      `ce jeu demande la version ${engine} du moteur, l’app connaît la version ${ENGINE_VERSION} : mets l’app à jour`,
    );
  }

  const parsed = gameDefinitionSchema.safeParse(data, { error: french });
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: 'SCHEMA',
        path: formatPath(issue.path),
        message: issue.message,
      })),
    };
  }

  const errors = new Checker(parsed.data).run();
  return errors.length > 0 ? { ok: false, errors } : { ok: true, definition: parsed.data };
}

function fail(code: DefinitionErrorCode, path: string, message: string): ValidationResult {
  return { ok: false, errors: [{ code, path, message }] };
}

/** `['inputs', 'player', 1, 'max']` → `inputs.player[1].max`. */
function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((part, i) =>
      typeof part === 'number' ? `[${part}]` : `${i > 0 ? '.' : ''}${String(part)}`,
    )
    .join('');
}

const reserved = new Set<string>([...RESERVED_NAMES, ...keywords]);

class Checker {
  private readonly errors: DefinitionIssue[] = [];

  constructor(private readonly def: GameDefinition) {}

  /**
   * D'abord la cohérence de la structure ; s'il y a un problème, on s'arrête là :
   * les formules et les tests en dépendent et ne produiraient que des erreurs en cascade.
   */
  run(): DefinitionIssue[] {
    this.checkPlayers();
    this.checkArchetype();
    this.checkOptions();
    this.checkFields();
    if (this.errors.length > 0) return this.errors;
    this.checkFormulas();
    this.checkTests();
    return this.errors;
  }

  private add(code: DefinitionErrorCode, path: string, message: string) {
    this.errors.push({ code, path, message });
  }

  // --- Joueurs et équipes --------------------------------------------------

  private checkPlayers() {
    const { players, teams } = this.def;
    if (players.min > players.max) {
      this.add('INCONSISTENT', 'players', `min (${players.min}) dépasse max (${players.max})`);
    }
    if (teams) {
      const seats = teams.count * teams.size;
      if (seats < players.min || seats > players.max) {
        this.add(
          'INCONSISTENT',
          'teams',
          `${teams.count} équipes de ${teams.size} font ${seats} joueurs, hors de players (${players.min} à ${players.max})`,
        );
      }
    }
  }

  // --- Archétype et portée -------------------------------------------------

  private checkArchetype() {
    const { archetype, scoring, inputs, cells, end, teams } = this.def;
    const scope = scopeOf(this.def);

    if (archetype === 'grid') {
      if (!cells) this.add('INCONSISTENT', 'cells', 'une grille doit définir ses cases');
      if (inputs)
        this.add('INCONSISTENT', 'inputs', 'une grille se saisit par cases : utiliser cells');
      if (scope !== 'player') {
        this.add('INCONSISTENT', 'scoring.scope', 'une grille se calcule par joueur');
      }
    } else {
      if (cells) this.add('INCONSISTENT', 'cells', 'cells est réservé à l’archétype grid');
      if (end === 'grid_complete') {
        this.add('INCONSISTENT', 'end', 'grid_complete est réservé à l’archétype grid');
      }
    }

    if (archetype === 'counter') {
      if (scoring) this.add('INCONSISTENT', 'scoring', 'un compteur n’a pas de formule de score');
      if (inputs) this.add('INCONSISTENT', 'inputs', 'un compteur n’a pas de saisies');
      return;
    }
    if (!scoring) {
      this.add('INCONSISTENT', 'scoring', `l’archétype ${archetype} demande un bloc scoring`);
      return;
    }

    if (scope === 'role') {
      if (!scoring.taker) this.add('INCONSISTENT', 'scoring.taker', 'formule du preneur manquante');
      if (!scoring.defense) {
        this.add('INCONSISTENT', 'scoring.defense', 'formule de la défense manquante');
      }
      if (scoring.score) {
        this.add(
          'INCONSISTENT',
          'scoring.score',
          'la portée role utilise taker et defense, pas score',
        );
      }
    } else {
      if (!scoring.score) this.add('INCONSISTENT', 'scoring.score', 'formule de score manquante');
      for (const role of ['taker', 'defense'] as const) {
        if (scoring[role]) {
          this.add('INCONSISTENT', `scoring.${role}`, `${role} n’existe que pour la portée role`);
        }
      }
    }
    if (scoring.marks && (scope === 'role' || archetype === 'grid')) {
      this.add(
        'INCONSISTENT',
        'scoring.marks',
        'les marques n’existent que pour un score par joueur ou par équipe, en manches',
      );
    }
    if (scoring.subtotals && archetype !== 'grid') {
      this.add('INCONSISTENT', 'scoring.subtotals', 'les sous-totaux sont réservés aux grilles');
    }
    if (scoring.zeroSum && archetype === 'grid') {
      this.add('INCONSISTENT', 'scoring.zeroSum', 'une grille ne peut pas être à somme nulle');
    }
    if (scoring.describe && scope !== 'role') {
      this.add(
        'INCONSISTENT',
        'scoring.describe',
        'les phrases de résultat n’existent que pour la portée role (jeux à contrat)',
      );
    }
    if (scope === 'team' && !teams) {
      this.add('INCONSISTENT', 'scoring.scope', 'la portée team demande un bloc teams');
    }
    if (inputs?.team && !teams) {
      this.add('INCONSISTENT', 'inputs.team', 'des saisies par équipe demandent un bloc teams');
    }
  }

  // --- Options -------------------------------------------------------------

  private checkOptions() {
    const seen = new Set<string>();
    for (const [i, option] of (this.def.options ?? []).entries()) {
      const path = `options[${i}]`;
      if (seen.has(option.key))
        this.add('INCONSISTENT', `${path}.key`, `option « ${option.key} » en double`);
      seen.add(option.key);
      if (option.type === 'int') {
        this.checkBounds(path, option);
        if (!inBounds(option.default, option)) {
          this.add(
            'INCONSISTENT',
            `${path}.default`,
            `valeur par défaut hors de ${describeBounds(option)}`,
          );
        }
      }
      if (option.type === 'enum') {
        this.checkLabels(path, option);
        if (!option.values.includes(option.default)) {
          this.add('INCONSISTENT', `${path}.default`, 'valeur par défaut absente de values');
        }
      }
    }
  }

  // --- Saisies et cases ----------------------------------------------------

  private checkFields() {
    const groups: [string, readonly InputField[] | undefined][] = [
      ['inputs.player', this.def.inputs?.player],
      ['inputs.team', this.def.inputs?.team],
      ['inputs.round', this.def.inputs?.round],
      ['cells', this.def.cells],
    ];
    // Les saisies partagent un même espace de noms dans les formules.
    const owners = new Map<string, string>();
    for (const [group, fields] of groups) {
      for (const [i, field] of (fields ?? []).entries()) {
        const path = `${group}[${i}]`;
        const previous = owners.get(field.key);
        if (previous) {
          this.add(
            'INCONSISTENT',
            `${path}.key`,
            `clé « ${field.key} » déjà utilisée par ${previous}`,
          );
        } else {
          owners.set(field.key, path);
        }
        if (reserved.has(field.key)) {
          this.add('INCONSISTENT', `${path}.key`, `« ${field.key} » est un nom réservé`);
        }
        if (field.type === 'int') {
          this.checkBounds(path, field);
          if (field.complement) this.checkComplement(path, field.complement.field, fields ?? []);
          if (group === 'cells' && (field.min === ROUND_BOUND || field.max === ROUND_BOUND)) {
            this.add(
              'INCONSISTENT',
              path,
              `${ROUND_BOUND} n’existe que pour les saisies d’une manche, pas pour une grille`,
            );
          }
        }
        if (field.type === 'enum') this.checkLabels(path, field);
        if (
          (field.type === 'enum' || field.type === 'pick') &&
          field.default !== undefined &&
          !(field.values as unknown[]).includes(field.default)
        ) {
          this.add('INCONSISTENT', `${path}.default`, 'valeur par défaut absente de values');
        }
        if (field.type === 'bool' && field.unique && group === 'inputs.round') {
          this.add(
            'INCONSISTENT',
            `${path}.unique`,
            'unique n’a de sens que pour une saisie par joueur ou par équipe',
          );
        }
      }
    }
    for (const name of Object.keys(this.def.scoring?.vars ?? {})) {
      const path = `scoring.vars.${name}`;
      if (owners.has(name)) {
        this.add('INCONSISTENT', path, `la variable « ${name} » porte le nom d’une saisie`);
      }
      if (reserved.has(name)) this.add('INCONSISTENT', path, `« ${name} » est un nom réservé`);
    }
  }

  /** La saisie complémentaire est un autre entier du même groupe. */
  private checkComplement(path: string, target: string, fields: readonly InputField[]) {
    const other = fields.find((f) => f.key === target);
    if (!other || other.type !== 'int' || path.endsWith(`[${fields.indexOf(other)}]`)) {
      this.add(
        'INCONSISTENT',
        `${path}.complement.field`,
        `« ${target} » doit être une autre saisie entière du même groupe`,
      );
    }
  }

  private checkBounds(path: string, item: { min?: Bound; max?: Bound }) {
    // Une borne `$round` dépend de la manche : seules deux bornes fixes se comparent.
    if (typeof item.min === 'number' && typeof item.max === 'number' && item.min > item.max) {
      this.add('INCONSISTENT', path, `min (${item.min}) dépasse max (${item.max})`);
    }
  }

  private checkLabels(path: string, item: { values: unknown[]; labels?: unknown[] }) {
    if (item.labels && item.labels.length !== item.values.length) {
      this.add(
        'INCONSISTENT',
        `${path}.labels`,
        `${item.labels.length} libellés pour ${item.values.length} valeurs`,
      );
    }
  }

  // --- Formules ------------------------------------------------------------

  private checkFormulas() {
    const { scoring, end, validate } = this.def;
    const scoringScope = scoringNames(this.def);

    if (scoring?.vars) {
      try {
        const vars = compileVars(scoring.vars);
        for (const { name, formula } of vars) {
          this.checkNames(`scoring.vars.${name}`, formula, scoringScope);
        }
      } catch (error) {
        if (!(error instanceof VarsError)) throw error;
        this.add('FORMULA', `scoring.vars.${error.variable}`, error.reason);
      }
    }
    for (const role of ['score', 'taker', 'defense'] as const) {
      const source = scoring?.[role];
      if (source) this.checkFormula(`scoring.${role}`, source, scoringScope);
    }
    for (const [i, { when, text }] of (scoring?.describe ?? []).entries()) {
      this.checkFormula(`scoring.describe[${i}].when`, when, scoringScope);
      let parts: TemplatePart[];
      try {
        parts = parseTemplate(text);
      } catch (error) {
        this.add('FORMULA', `scoring.describe[${i}].text`, (error as Error).message);
        continue;
      }
      for (const part of parts) {
        if ('formula' in part) {
          this.checkFormula(`scoring.describe[${i}].text`, part.formula, scoringScope);
        }
      }
    }
    for (const [i, { value }] of (scoring?.subtotals ?? []).entries()) {
      this.checkFormula(`scoring.subtotals[${i}].value`, value, scoringScope);
    }
    for (const [i, { when }] of (scoring?.marks ?? []).entries()) {
      this.checkFormula(`scoring.marks[${i}].when`, when, scoringScope);
    }
    if (end && end !== 'grid_complete') this.checkFormula('end', end, endNames(this.def));
    for (const [i, { rule }] of (validate ?? []).entries()) {
      this.checkFormula(`validate[${i}].rule`, rule, validateNames(this.def));
    }
  }

  private checkFormula(path: string, source: string, names: Names) {
    let formula: CompiledFormula;
    try {
      formula = compile(source);
    } catch (error) {
      if (!(error instanceof ExpressionError)) throw error;
      this.add('FORMULA', path, error.message);
      return;
    }
    this.checkNames(path, formula, names);
  }

  private checkNames(path: string, formula: CompiledFormula, names: Names) {
    for (const node of formula.identifiers) {
      const [root, field, ...rest] = node.path;
      const at = ` (caractère ${Array.from(formula.source.slice(0, node.pos)).length + 1})`;
      if (!names.has(root)) {
        this.add('UNKNOWN_VARIABLE', path, `variable inconnue « ${root} »${at}`);
        continue;
      }
      const fields = names.get(root);
      if (fields === null || fields === undefined) {
        if (field !== undefined) {
          this.add('UNKNOWN_VARIABLE', path, `« ${root} » n’a pas de champ « ${field} »${at}`);
        }
      } else if (field === undefined) {
        const list = [...fields].join(', ');
        this.add(
          'UNKNOWN_VARIABLE',
          path,
          `« ${root} » est un groupe : préciser un champ${list ? ` (${list})` : ''}${at}`,
        );
      } else if (!fields.has(field)) {
        this.add('UNKNOWN_VARIABLE', path, `variable inconnue « ${root}.${field} »${at}`);
      } else if (rest.length > 0) {
        this.add(
          'UNKNOWN_VARIABLE',
          path,
          `« ${root}.${field} » n’a pas de champ « ${rest[0]} »${at}`,
        );
      }
    }
  }

  // --- Cas de test ---------------------------------------------------------

  private checkTests() {
    const { archetype, players, teams } = this.def;
    const scope = scopeOf(this.def);
    const options = new Map((this.def.options ?? []).map((o) => [o.key, o]));
    const roundFields = this.def.inputs?.round ?? [];

    for (const [t, test] of (this.def.tests ?? []).entries()) {
      const path = `tests[${t}]`;

      for (const [key, value] of Object.entries(test.options ?? {})) {
        const option = options.get(key);
        const at = `${path}.options.${key}`;
        if (!option) this.add('INVALID_TEST', at, `option inconnue « ${key} »`);
        else if (!acceptsOption(option, value))
          this.add(
            'INVALID_TEST',
            at,
            `valeur ${JSON.stringify(value)} invalide pour cette option`,
          );
      }

      if (archetype === 'grid' || scope === 'role') {
        const fields = archetype === 'grid' ? (this.def.cells ?? []) : roundFields;
        const expected =
          archetype === 'grid' ? 'un nombre (total du joueur)' : '{ "taker", "defense" }';
        if (Array.isArray(test.inputs)) {
          this.add(
            'INVALID_TEST',
            `${path}.inputs`,
            'un objet de saisies est attendu, pas une liste',
          );
        } else {
          this.checkEntry(`${path}.inputs`, test.inputs, fields, test.round);
        }
        const ok =
          archetype === 'grid' ? typeof test.expect === 'number' : isRoleExpect(test.expect);
        if (!ok) this.add('INVALID_TEST', `${path}.expect`, `${expected} attendu`);
        continue;
      }

      // Portée joueur ou équipe : une entrée par joueur (ou équipe), un score attendu par entrée.
      if (!Array.isArray(test.inputs)) {
        this.add(
          'INVALID_TEST',
          `${path}.inputs`,
          'une liste est attendue : une entrée par joueur ou équipe',
        );
        continue;
      }
      const count = test.inputs.length;
      if (scope === 'team' && teams && count !== teams.count) {
        this.add(
          'INVALID_TEST',
          `${path}.inputs`,
          `${teams.count} équipes attendues, ${count} reçues`,
        );
      }
      if (scope === 'player' && (count < players.min || count > players.max)) {
        this.add(
          'INVALID_TEST',
          `${path}.inputs`,
          `${count} joueurs, hors de players (${players.min} à ${players.max})`,
        );
      }
      if (!Array.isArray(test.expect) || test.expect.length !== count) {
        this.add('INVALID_TEST', `${path}.expect`, `une liste de ${count} scores est attendue`);
      }
      const fields = [...scopeFieldsOf(this.def), ...roundFields];
      for (const [e, entry] of test.inputs.entries()) {
        this.checkEntry(`${path}.inputs[${e}]`, entry, fields, test.round);
      }
      for (const field of roundFields) {
        const values = new Set(test.inputs.map((entry) => JSON.stringify(entry[field.key])));
        if (values.size > 1) {
          this.add(
            'INVALID_TEST',
            `${path}.inputs`,
            `la saisie de manche « ${field.key} » doit être identique dans chaque entrée`,
          );
        }
      }
      for (const field of scopeFieldsOf(this.def)) {
        if (
          field.type === 'bool' &&
          field.unique &&
          test.inputs.filter((entry) => entry[field.key] === true).length > 1
        ) {
          this.add(
            'INVALID_TEST',
            `${path}.inputs`,
            `« ${field.key} » ne peut être vrai que pour une seule entrée`,
          );
        }
      }
    }
  }

  /** Une entrée de test : exactement les saisies attendues, chacune valide. */
  private checkEntry(
    path: string,
    entry: Readonly<Record<string, unknown>>,
    fields: readonly InputField[],
    round = 1,
  ) {
    const byKey = new Map(fields.map((f) => [f.key, f]));
    for (const key of Object.keys(entry)) {
      if (!byKey.has(key)) this.add('INVALID_TEST', `${path}.${key}`, `saisie inconnue « ${key} »`);
    }
    for (const field of fields) {
      if (!(field.key in entry)) {
        this.add('INVALID_TEST', path, `saisie « ${field.key} » manquante`);
      } else if (!acceptsInput(field, entry[field.key], round)) {
        this.add(
          'INVALID_TEST',
          `${path}.${field.key}`,
          `valeur ${JSON.stringify(entry[field.key])} invalide : ${describeField(field, round)}`,
        );
      }
    }
  }
}

function isRoleExpect(expect: unknown): boolean {
  return typeof expect === 'object' && expect !== null && !Array.isArray(expect);
}
