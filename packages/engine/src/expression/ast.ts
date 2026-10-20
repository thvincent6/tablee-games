// Arbre syntaxique typé d'une formule. `pos` : index (base 0) du premier caractère du nœud.

export type BinaryOperator =
  '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or';

export type UnaryOperator = '-' | 'not';

export type NumberNode = { kind: 'number'; value: number; pos: number };
export type BooleanNode = { kind: 'boolean'; value: boolean; pos: number };
export type StringNode = { kind: 'string'; value: string; pos: number };
/** Identifiant, éventuellement avec accès par point : `opt.threshold` → `['opt', 'threshold']`. */
export type IdentifierNode = { kind: 'identifier'; path: string[]; pos: number };
export type UnaryNode = {
  kind: 'unary';
  operator: UnaryOperator;
  operand: ExpressionNode;
  pos: number;
};
export type BinaryNode = {
  kind: 'binary';
  operator: BinaryOperator;
  left: ExpressionNode;
  right: ExpressionNode;
  pos: number;
};
export type ConditionalNode = {
  kind: 'conditional';
  test: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
  pos: number;
};
/** Appel d'une fonction par son nom ; la liste des fonctions autorisées est vérifiée à l'évaluation. */
export type CallNode = { kind: 'call'; callee: string; args: ExpressionNode[]; pos: number };

export type ExpressionNode =
  | NumberNode
  | BooleanNode
  | StringNode
  | IdentifierNode
  | UnaryNode
  | BinaryNode
  | ConditionalNode
  | CallNode;
