import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Vérifie que la configuration ESLint du projet interdit toute exécution de code arbitraire.

const root = path.join(__dirname, '../../../..');
const eslint = path.join(root, 'node_modules/.bin/eslint');

type Message = { ruleId: string | null };

function lint(code: string): string[] {
  let output: string;
  try {
    output = execFileSync(
      eslint,
      ['--stdin', '--stdin-filename', 'packages/engine/src/sample.ts', '--format', 'json'],
      { cwd: root, input: code, encoding: 'utf8' },
    );
  } catch (error) {
    // ESLint sort en erreur quand il trouve des problèmes : le rapport est sur stdout.
    output = (error as { stdout: string }).stdout;
  }
  const [result] = JSON.parse(output) as { messages: Message[] }[];
  return result.messages.map((m) => m.ruleId ?? 'parse-error');
}

jest.setTimeout(60_000);

describe('ESLint interdit l’exécution de code', () => {
  it.each([
    ['eval', 'export const x = eval("1 + 1");\n', 'no-eval'],
    ['eval indirect', 'export const x = globalThis.eval("1");\n', 'no-eval'],
    ['new Function', 'export const f = new Function("return 1");\n', 'no-new-func'],
    ['Function()', 'export const f = Function("return 1");\n', 'no-new-func'],
    ['Function en valeur', 'export const F = Function;\n', 'no-restricted-globals'],
    ['setTimeout avec du texte', 'setTimeout("alert(1)", 0);\n', 'no-implied-eval'],
    ['import dynamique', 'export const m = import("./x");\n', 'no-restricted-syntax'],
  ])('%s', (_label, code, rule) => {
    expect(lint(code)).toContain(rule);
  });

  it('laisse passer du code ordinaire', () => {
    expect(lint('export const add = (a: number, b: number): number => a + b;\n')).toEqual([]);
  });
});
