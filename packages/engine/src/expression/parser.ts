import type { BinaryOperator, ExpressionNode } from './ast';
import { characterPosition, ExpressionError } from './errors';
import { tokenize, type Token } from './lexer';

/** Longueur maximale d'une formule, en caractères. */
export const MAX_EXPRESSION_LENGTH = 2000;
/** Profondeur maximale d'imbrication (parenthèses, appels, ternaires, opérateurs unaires). */
export const MAX_NESTING_DEPTH = 32;

/**
 * Analyse une formule et renvoie son arbre syntaxique.
 * Lève une `ExpressionError` en français, avec la position, si la formule est invalide.
 *
 * Priorités, de la plus faible à la plus forte :
 *   ? :  (à droite)  →  or  →  and  →  not  →  == !=  →  < <= > >=  →  + -  →  * / %  →  - unaire
 * Les comparaisons ne s'enchaînent pas : `a < b < c` est refusé (écrire `a < b and b < c`).
 */
export function parse(source: string): ExpressionNode {
  const length = Array.from(source).length;
  if (length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(
      `formule trop longue : ${length} caractères, ${MAX_EXPRESSION_LENGTH} au plus`,
      MAX_EXPRESSION_LENGTH + 1,
    );
  }
  return new Parser(source).parseFormula();
}

class Parser {
  private readonly tokens: Token[];
  private index = 0;
  private depth = 0;

  constructor(private readonly source: string) {
    this.tokens = tokenize(source);
  }

  parseFormula(): ExpressionNode {
    if (this.peek().type === 'end') throw this.error('formule vide', this.peek());
    const node = this.parseExpression(this.peek());
    const next = this.peek();
    if (next.type !== 'end') {
      throw this.error(
        next.text === ')'
          ? 'parenthèse fermante en trop'
          : `opérateur attendu avant ${this.describe(next)}`,
        next,
      );
    }
    return node;
  }

  // --- Niveaux de priorité -------------------------------------------------

  /** Point d'entrée d'une sous-expression : compte un niveau d'imbrication. */
  private parseExpression(opening: Token): ExpressionNode {
    this.depth++;
    if (this.depth > MAX_NESTING_DEPTH) {
      throw this.error(`imbrication trop profonde : ${MAX_NESTING_DEPTH} niveaux au plus`, opening);
    }
    const node = this.parseConditional();
    this.depth--;
    return node;
  }

  private parseConditional(): ExpressionNode {
    const test = this.parseOr();
    const question = this.peek();
    if (!this.accept('punctuation', '?')) return test;
    const consequent = this.parseExpression(question);
    const colon = this.peek();
    if (!this.accept('punctuation', ':')) {
      throw this.error(`« : » attendu dans le ternaire, ${this.describe(colon)} trouvé`, colon);
    }
    // Associativité à droite : `a ? b : c ? d : e` se lit `a ? b : (c ? d : e)`.
    const alternate = this.parseExpression(colon);
    return { kind: 'conditional', test, consequent, alternate, pos: test.pos };
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.accept('keyword', 'or')) {
      left = { kind: 'binary', operator: 'or', left, right: this.parseAnd(), pos: left.pos };
    }
    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseNot();
    while (this.accept('keyword', 'and')) {
      left = { kind: 'binary', operator: 'and', left, right: this.parseNot(), pos: left.pos };
    }
    return left;
  }

  private parseNot(): ExpressionNode {
    const token = this.peek();
    if (!this.accept('keyword', 'not')) return this.parseEquality();
    return this.nested(token, () => ({
      kind: 'unary',
      operator: 'not',
      operand: this.parseNot(),
      pos: token.pos,
    }));
  }

  private parseEquality(): ExpressionNode {
    return this.parseComparisonLevel(['==', '!='], () => this.parseRelational());
  }

  private parseRelational(): ExpressionNode {
    return this.parseComparisonLevel(['<', '<=', '>', '>='], () => this.parseAdditive());
  }

  /** Un niveau de comparaison, non associatif. */
  private parseComparisonLevel(
    operators: BinaryOperator[],
    operand: () => ExpressionNode,
  ): ExpressionNode {
    const left = operand();
    const operator = this.acceptOperator(operators);
    if (!operator) return left;
    const node: ExpressionNode = {
      kind: 'binary',
      operator,
      left,
      right: operand(),
      pos: left.pos,
    };
    const chained = this.peek();
    if (this.acceptOperator(operators)) {
      throw this.error(
        `comparaisons enchaînées : écrire par exemple a < b and b < c, ou ajouter des parenthèses`,
        chained,
      );
    }
    return node;
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();
    for (let op = this.acceptOperator(['+', '-']); op; op = this.acceptOperator(['+', '-'])) {
      left = {
        kind: 'binary',
        operator: op,
        left,
        right: this.parseMultiplicative(),
        pos: left.pos,
      };
    }
    return left;
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();
    const ops: BinaryOperator[] = ['*', '/', '%'];
    for (let op = this.acceptOperator(ops); op; op = this.acceptOperator(ops)) {
      left = { kind: 'binary', operator: op, left, right: this.parseUnary(), pos: left.pos };
    }
    return left;
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();
    if (!this.accept('operator', '-')) return this.parsePrimary();
    return this.nested(token, () => ({
      kind: 'unary',
      operator: '-',
      operand: this.parseUnary(),
      pos: token.pos,
    }));
  }

  private parsePrimary(): ExpressionNode {
    const token = this.next();
    switch (token.type) {
      case 'number':
        return { kind: 'number', value: token.value!, pos: token.pos };
      case 'string':
        return { kind: 'string', value: token.text, pos: token.pos };
      case 'keyword':
        if (token.text === 'true' || token.text === 'false') {
          return { kind: 'boolean', value: token.text === 'true', pos: token.pos };
        }
        break;
      case 'identifier':
        return this.peek().text === '(' ? this.parseCall(token) : this.parsePath(token);
      case 'punctuation':
        if (token.text === '(') {
          const inner = this.parseExpression(token);
          this.expectClosingParenthesis();
          return inner;
        }
        break;
    }
    throw this.error(`valeur attendue, ${this.describe(token)} trouvé`, token);
  }

  private parsePath(first: Token): ExpressionNode {
    const path = [first.text];
    while (this.accept('punctuation', '.')) {
      const name = this.next();
      if (name.type !== 'identifier') {
        throw this.error(`nom attendu après « . », ${this.describe(name)} trouvé`, name);
      }
      path.push(name.text);
    }
    return { kind: 'identifier', path, pos: first.pos };
  }

  private parseCall(callee: Token): ExpressionNode {
    const open = this.next();
    const args: ExpressionNode[] = [];
    if (!this.accept('punctuation', ')')) {
      do {
        args.push(this.parseExpression(open));
      } while (this.accept('punctuation', ','));
      this.expectClosingParenthesis();
    }
    return { kind: 'call', callee: callee.text, args, pos: callee.pos };
  }

  // --- Outils --------------------------------------------------------------

  /** Opérateur unaire : un niveau d'imbrication de plus pour son opérande. */
  private nested(token: Token, build: () => ExpressionNode): ExpressionNode {
    this.depth++;
    if (this.depth > MAX_NESTING_DEPTH) {
      throw this.error(`imbrication trop profonde : ${MAX_NESTING_DEPTH} niveaux au plus`, token);
    }
    const node = build();
    this.depth--;
    return node;
  }

  private expectClosingParenthesis() {
    const token = this.peek();
    if (!this.accept('punctuation', ')')) {
      throw this.error('parenthèse fermante attendue', token);
    }
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (token.type !== 'end') this.index++;
    return token;
  }

  private accept(type: Token['type'], text: string): boolean {
    const token = this.peek();
    if (token.type !== type || token.text !== text) return false;
    this.index++;
    return true;
  }

  private acceptOperator<T extends BinaryOperator>(operators: T[]): T | null {
    const token = this.peek();
    if (token.type !== 'operator' || !(operators as string[]).includes(token.text)) return null;
    this.index++;
    return token.text as T;
  }

  private describe(token: Token): string {
    if (token.type === 'end') return 'fin de formule';
    if (token.type === 'string') return `« '${token.text}' »`;
    return `« ${token.text} »`;
  }

  private error(reason: string, token: Token): ExpressionError {
    return new ExpressionError(reason, characterPosition(this.source, token.pos));
  }
}
