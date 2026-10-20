import type { ExpressionNode } from './ast';

/**
 * Réécrit un arbre sous forme de texte entièrement parenthésé,
 * pour vérifier les priorités et afficher une formule analysée.
 */
export function printExpression(node: ExpressionNode): string {
  switch (node.kind) {
    case 'number':
      return String(node.value);
    case 'boolean':
      return String(node.value);
    case 'string':
      return `'${node.value}'`;
    case 'identifier':
      return node.path.join('.');
    case 'unary':
      return node.operator === 'not'
        ? `(not ${printExpression(node.operand)})`
        : `(-${printExpression(node.operand)})`;
    case 'binary':
      return `(${printExpression(node.left)} ${node.operator} ${printExpression(node.right)})`;
    case 'conditional':
      return `(${printExpression(node.test)} ? ${printExpression(node.consequent)} : ${printExpression(node.alternate)})`;
    case 'call':
      return `${node.callee}(${node.args.map(printExpression).join(', ')})`;
  }
}
