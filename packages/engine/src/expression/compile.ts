import type { ExpressionNode, IdentifierNode } from './ast';
import { characterPosition, ExpressionError } from './errors';
import { functions, isAllowedFunction } from './functions';
import { parse } from './parser';

/** Formule analysée et vérifiée une fois pour toutes, prête à être évaluée autant de fois que voulu. */
export type CompiledFormula = {
  readonly source: string;
  readonly ast: ExpressionNode;
  /** Noms de premier niveau utilisés (`opt` pour `opt.threshold`), hors fonctions. */
  readonly references: ReadonlySet<string>;
  /** Identifiants complets utilisés, avec leur position : `opt.threshold` → `['opt', 'threshold']`. */
  readonly identifiers: readonly IdentifierNode[];
};

/** Nombre de formules gardées en cache ; au-delà, le cache repart de zéro. */
export const COMPILE_CACHE_SIZE = 1000;
const cache = new Map<string, CompiledFormula>();

/**
 * Analyse une formule et vérifie ses appels de fonction (nom autorisé, nombre d'arguments).
 * Le résultat est mis en cache : une même formule n'est analysée qu'une fois.
 */
export function compile(source: string): CompiledFormula {
  const cached = cache.get(source);
  if (cached) return cached;

  const ast = parse(source);
  const references = new Set<string>();
  const identifiers: IdentifierNode[] = [];
  visit(ast, (node) => {
    if (node.kind === 'identifier') {
      references.add(node.path[0]);
      identifiers.push(node);
    }
    if (node.kind === 'call') checkCall(source, node);
  });

  const compiled: CompiledFormula = Object.freeze({ source, ast, references, identifiers });
  if (cache.size >= COMPILE_CACHE_SIZE) cache.clear();
  cache.set(source, compiled);
  return compiled;
}

/** Vide le cache (tests). */
export function clearCompileCache() {
  cache.clear();
}

function checkCall(source: string, node: Extract<ExpressionNode, { kind: 'call' }>) {
  const at = characterPosition(source, node.pos);
  if (!isAllowedFunction(node.callee)) {
    const allowed = Object.keys(functions).join(', ');
    throw new ExpressionError(`fonction inconnue « ${node.callee} » (autorisées : ${allowed})`, at);
  }
  const { min, max } = functions[node.callee].arity;
  const count = node.args.length;
  if (count < min || count > max) {
    const expected =
      min === max ? `${min}` : max === Infinity ? `au moins ${min}` : `${min} ou ${max}`;
    throw new ExpressionError(
      `${node.callee}() attend ${expected} argument${max > 1 ? 's' : ''}, reçu ${count}`,
      at,
    );
  }
}

function visit(node: ExpressionNode, see: (node: ExpressionNode) => void) {
  see(node);
  switch (node.kind) {
    case 'unary':
      visit(node.operand, see);
      break;
    case 'binary':
      visit(node.left, see);
      visit(node.right, see);
      break;
    case 'conditional':
      visit(node.test, see);
      visit(node.consequent, see);
      visit(node.alternate, see);
      break;
    case 'call':
      node.args.forEach((arg) => visit(arg, see));
      break;
  }
}
