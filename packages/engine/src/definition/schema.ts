import { z } from 'zod';

// Format v1 d'une définition de jeu (specs, « Définition d'un jeu »).
// Structure seulement : la cohérence (formules, variables, tests) est vérifiée par `validate.ts`.
// Objets stricts : une clé inconnue est refusée, pour repérer les fautes de frappe.

/** Taille maximale d'un fichier de définition, en octets. */
export const MAX_DEFINITION_BYTES = 200 * 1024;

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Clé utilisable dans une formule : lettres, chiffres, `_`, sans commencer par un chiffre. */
const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

const text = (max: number) => z.string().trim().min(1).max(max);
const key = z
  .string()
  .regex(KEY, 'clé invalide : lettres, chiffres et _ uniquement, sans commencer par un chiffre');
const formula = z.string().min(1).describe('Formule (langage de formules des specs)');
const scalar = z.union([z.number(), z.string(), z.boolean()]);
const enumValues = z.array(z.union([z.number(), z.string()])).min(1);

// --- Options de partie ------------------------------------------------------

const intOption = z.strictObject({
  key,
  label: text(60),
  type: z.literal('int'),
  default: z.number().int(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  step: z.number().int().positive().optional(),
});
const boolOption = z.strictObject({
  key,
  label: text(60),
  type: z.literal('bool'),
  default: z.boolean(),
});
const enumOption = z.strictObject({
  key,
  label: text(60),
  type: z.literal('enum'),
  values: enumValues,
  labels: z.array(text(60)).optional(),
  default: z.union([z.number(), z.string()]),
});
export const optionSchema = z.discriminatedUnion('type', [intOption, boolOption, enumOption], {
  error: (issue) =>
    issue.code === 'invalid_union'
      ? 'type d’option inconnu : int, bool ou enum attendu'
      : undefined,
});

// --- Saisies et cases -------------------------------------------------------

/** Borne d'une saisie : un entier, ou `"$round"` (le numéro de la manche saisie). */
const bound = z.union([z.number().int(), z.literal('$round')], {
  error: 'entier ou "$round" attendu',
});
const intField = z.strictObject({
  key,
  label: text(60),
  type: z.literal('int'),
  min: bound.optional(),
  max: bound.optional(),
  /**
   * Saisie complémentaire : taper cette valeur remplit `field` avec `total − valeur`
   * (points du preneur et de la défense, 162 à la Belote).
   */
  complement: z.strictObject({ field: key, total: z.number().int() }).optional(),
});
const boolField = z.strictObject({
  key,
  label: text(60),
  type: z.literal('bool'),
  /** Un seul joueur (ou équipe) peut cocher cette case dans une manche. */
  unique: z.boolean().optional(),
});
const enumField = z.strictObject({
  key,
  label: text(60),
  type: z.literal('enum'),
  values: enumValues,
  labels: z.array(text(60)).optional(),
  /** Valeur présélectionnée à la saisie (« Aucune poignée ») ; sinon le choix reste à faire. */
  default: z.union([z.number(), z.string()]).optional(),
});
const pickField = z.strictObject({
  key,
  label: text(60),
  type: z.literal('pick'),
  values: z.array(z.number()).min(1),
  default: z.number().optional(),
});
export const fieldSchema = z.discriminatedUnion(
  'type',
  [intField, boolField, enumField, pickField],
  {
    error: (issue) =>
      issue.code === 'invalid_union' ? 'type inconnu : int, bool, enum ou pick attendu' : undefined,
  },
);

// --- Calcul -----------------------------------------------------------------

export const scopes = ['player', 'team', 'role'] as const;

const scoringSchema = z.strictObject({
  scope: z.enum(scopes).optional().describe('Portée du score ; « player » par défaut'),
  vars: z.record(key, formula).optional(),
  score: formula.optional(),
  taker: formula.optional(),
  defense: formula.optional(),
  /** Marques affichées à côté d'un score de manche (« ×2 ») quand `when` est vraie. */
  marks: z
    .array(z.strictObject({ when: formula, label: text(12) }))
    .max(10)
    .optional(),
  /**
   * Résultat lisible d'une donne (portée role) : la première phrase dont `when` est vraie.
   * Chaque `{formule}` du texte est remplacée par sa valeur (« {contract} réussie de {margin} »).
   */
  describe: z
    .array(z.strictObject({ when: formula, text: text(120) }))
    .max(10)
    .optional(),
  /**
   * Lignes intermédiaires d'une grille (« Sous-total », « Bonus ») : `value` est une formule
   * de la grille ; la ligne s'affiche après la dernière case dont elle dépend.
   */
  subtotals: z
    .array(z.strictObject({ label: text(40), value: formula }))
    .max(10)
    .optional(),
  /** Jeu à somme nulle (Tarot) : le moteur refuse une donne dont les scores ne s'annulent pas. */
  zeroSum: z.boolean().optional(),
});

const testSchema = z.strictObject({
  name: text(120),
  /** Numéro de la manche jouée (`round` dans les formules) ; 1 par défaut. */
  round: z.number().int().min(1).max(1000).optional(),
  options: z.record(key, scalar).optional(),
  inputs: z.union([z.record(key, scalar), z.array(z.record(key, scalar)).min(1)]),
  expect: z.union([
    z.number(),
    z.array(z.number()).min(1),
    z.strictObject({ taker: z.number(), defense: z.number() }),
  ]),
});

// --- Définition -------------------------------------------------------------

export const archetypes = ['rounds', 'contract', 'grid', 'counter'] as const;

export const gameDefinitionSchema = z
  .strictObject({
    /** Lien vers ce schéma, pour l'autocomplétion dans l'éditeur. Ignoré par l'app. */
    $schema: z.string().optional(),
    id: z.string().max(40).regex(SLUG, 'identifiant invalide : minuscules, chiffres et tirets'),
    name: text(40),
    version: z.string().regex(SEMVER, 'version invalide : format semver attendu (ex. 1.0.0)'),
    engine: z.number().int().min(1),
    summary: text(500).optional(),
    /** Auteur du JSON (pseudo, nom), affiché à l'import. */
    author: text(60).optional(),
    tags: z.array(text(30)).max(10).optional(),
    source: z.url({ protocol: /^https$/, error: 'lien https attendu' }).optional(),
    archetype: z.enum(archetypes),
    players: z.strictObject({
      min: z.number().int().min(1).max(20),
      max: z.number().int().min(1).max(20),
    }),
    teams: z
      .strictObject({ count: z.number().int().min(2).max(4), size: z.number().int().min(1).max(4) })
      .optional(),
    winner: z.enum(['highest', 'lowest']),
    options: z.array(optionSchema).max(20).optional(),
    inputs: z
      .strictObject({
        player: z.array(fieldSchema).max(20).optional(),
        team: z.array(fieldSchema).max(20).optional(),
        round: z.array(fieldSchema).max(20).optional(),
      })
      .optional(),
    cells: z.array(fieldSchema).min(1).max(40).optional(),
    scoring: scoringSchema.optional(),
    end: formula
      .optional()
      .describe('Formule de fin, « grid_complete », ou absente (fin manuelle)'),
    validate: z
      .array(z.strictObject({ rule: formula, message: text(200) }))
      .max(20)
      .optional(),
    tests: z.array(testSchema).max(100).optional(),
  })
  .meta({
    title: 'Définition de jeu Tablée',
    description: 'Format v1 des définitions de jeu (JSON déclaratif, formules interprétées).',
  });

export type GameDefinition = z.infer<typeof gameDefinitionSchema>;
export type GameOption = z.infer<typeof optionSchema>;
export type InputField = z.infer<typeof fieldSchema>;
export type Scope = (typeof scopes)[number];
export type DefinitionTest = z.infer<typeof testSchema>;
