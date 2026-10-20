import type { DefinitionIssue, GameDefinition } from '../definition';
import type { TestResult, TestScores } from './runTests';

// Rapport lisible par un contributeur qui n'est pas développeur : français, une ligne par cas,
// attendu et obtenu côte à côte.

/** `[10, -30]` → « 10 · -30 » ; `{ taker, defense }` → « preneur 190 · défense 50 ». */
export function formatScores(scores: TestScores): string {
  if (typeof scores === 'number') return String(scores);
  if (Array.isArray(scores)) return scores.join(' · ');
  return `preneur ${scores.taker} · défense ${scores.defense}`;
}

/** Lignes du rapport d'un jeu valide : un cas par ligne, détail sous les échecs. */
export function formatTestResults(results: readonly TestResult[]): string[] {
  return results.flatMap((result) => {
    if (result.status === 'passed') return [`  ✓ ${result.name}`];
    const lines = [`  ✗ ${result.name}`, `      attendu : ${formatScores(result.expected)}`];
    if (result.status === 'failed') lines.push(`      obtenu  : ${formatScores(result.actual)}`);
    else lines.push(`      erreur  : ${result.reason}`);
    return lines;
  });
}

/** Lignes du rapport d'une définition refusée par la validation. */
export function formatIssues(issues: readonly DefinitionIssue[]): string[] {
  return issues.map((issue) => `      ${issue.path || '(fichier)'} : ${issue.message}`);
}

export function describeGame(definition: GameDefinition): string {
  return `${definition.name} ${definition.version}`;
}
