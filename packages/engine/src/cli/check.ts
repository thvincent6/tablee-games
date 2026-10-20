import { parseGameDefinition } from '../definition';
import {
  describeGame,
  formatIssues,
  formatTestResults,
  runDefinitionTests,
  type TestResult,
} from '../testing';

export type FileCheck = {
  ok: boolean;
  /** Cas de test rejoués (vide si le fichier est refusé avant). */
  results: TestResult[];
  /** Lignes du rapport pour ce fichier. */
  lines: string[];
};

/**
 * Vérifie un fichier de définition : validation, emplacement `<id>/<version>.json`,
 * présence de cas de test (obligatoires pour la certification), puis rejeu des cas.
 * `relativePath` : chemin dans le dossier vérifié ; `label` : chemin affiché.
 */
export function checkGameFile(relativePath: string, text: string, label = relativePath): FileCheck {
  const parsed = parseGameDefinition(text);
  if (!parsed.ok) {
    return refuse(label, 'définition invalide', formatIssues(parsed.errors));
  }

  const definition = parsed.definition;
  const expected = `${definition.id}/${definition.version}.json`;
  if (relativePath.split(/[\\/]/).join('/') !== expected) {
    return refuse(label, 'mauvais emplacement', [
      `      le fichier de ${definition.id} ${definition.version} doit s’appeler ${expected}`,
    ]);
  }
  // Un compteur n'a aucun calcul : rien à tester, la validation suffit.
  if (definition.archetype === 'counter') {
    return {
      ok: true,
      results: [],
      lines: [`✓ ${describeGame(definition)} — ${label}`, '  (compteur : aucun calcul à tester)'],
    };
  }
  if (!definition.tests?.length) {
    return refuse(label, 'aucun cas de test', [
      '      ajouter au moins un cas dans "tests" : ils sont obligatoires pour la certification',
    ]);
  }

  const results = runDefinitionTests(definition);
  const ok = results.every((r) => r.status === 'passed');
  return {
    ok,
    results,
    lines: [
      `${ok ? '✓' : '✗'} ${describeGame(definition)} — ${label}`,
      ...formatTestResults(results),
    ],
  };
}

function refuse(label: string, reason: string, details: string[]): FileCheck {
  return { ok: false, results: [], lines: [`✗ ${label} : ${reason}`, ...details] };
}

const games = (n: number) => `${n} jeu${n > 1 ? 'x' : ''}`;

/** Ligne de bilan : jeux et cas de test, réussis et en échec. */
export function summarize(checks: readonly FileCheck[]): { ok: boolean; line: string } {
  const failedGames = checks.filter((c) => !c.ok).length;
  const results = checks.flatMap((c) => c.results);
  const failedTests = results.filter((r) => r.status !== 'passed').length;
  if (failedGames === 0) {
    return {
      ok: true,
      line: `Tout est bon : ${games(checks.length)}, ${results.length} cas de test réussis.`,
    };
  }
  return {
    ok: false,
    line: `Échec : ${games(failedGames)} sur ${checks.length} à corriger, ${failedTests} cas de test en échec sur ${results.length}.`,
  };
}
