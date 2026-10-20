import { characterPosition, ExpressionError } from './errors';

export type TokenType =
  'number' | 'string' | 'identifier' | 'keyword' | 'operator' | 'punctuation' | 'end';

export type Token = {
  type: TokenType;
  /** Texte du jeton (contenu sans apostrophes pour une chaîne). */
  text: string;
  /** Valeur numérique d'un jeton `number`. */
  value?: number;
  /** Index (base 0) du premier caractère. */
  pos: number;
};

export const keywords = ['true', 'false', 'and', 'or', 'not'] as const;

// Du plus long au plus court : `<=` doit l'emporter sur `<`.
const operators = ['==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%'];
const punctuation = ['(', ')', ',', '.', '?', ':'];

/** Habitudes d'autres langages : on explique quoi écrire à la place. */
const hints: Record<string, string> = {
  '&&': '« && » inconnu : écrire and',
  '||': '« || » inconnu : écrire or',
  '!': '« ! » inconnu : écrire not',
  '=': '« = » inconnu : écrire == pour comparer',
  '"': "les chaînes s’écrivent entre apostrophes : 'texte'",
};

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentifierStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentifierPart = (c: string) => /[A-Za-z0-9_]/.test(c);
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** Découpe une formule en jetons. Le dernier jeton est toujours `end`. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const at = (index: number) => characterPosition(source, index);
  let i = 0;

  while (i < source.length) {
    const c = source[i];

    if (isSpace(c)) {
      i++;
      continue;
    }

    if (isDigit(c)) {
      const start = i;
      while (isDigit(source[i] ?? '')) i++;
      if (source[i] === '.' && isDigit(source[i + 1] ?? '')) {
        i++;
        while (isDigit(source[i] ?? '')) i++;
      }
      if (isIdentifierPart(source[i] ?? '') || source[i] === '.') {
        let end = i;
        while (isIdentifierPart(source[end] ?? '') || source[end] === '.') end++;
        throw new ExpressionError(`nombre mal formé « ${source.slice(start, end)} »`, at(start));
      }
      const text = source.slice(start, i);
      tokens.push({ type: 'number', text, value: Number(text), pos: start });
      continue;
    }

    if (isIdentifierStart(c)) {
      const start = i;
      while (isIdentifierPart(source[i] ?? '')) i++;
      const text = source.slice(start, i);
      const type = (keywords as readonly string[]).includes(text) ? 'keyword' : 'identifier';
      tokens.push({ type, text, pos: start });
      continue;
    }

    if (c === "'") {
      const start = i;
      const close = source.indexOf("'", i + 1);
      if (close === -1) {
        throw new ExpressionError('chaîne non terminée : apostrophe fermante attendue', at(start));
      }
      tokens.push({ type: 'string', text: source.slice(i + 1, close), pos: start });
      i = close + 1;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (hints[two]) throw new ExpressionError(hints[two], at(i));
    const operator = operators.find((op) => source.startsWith(op, i));
    if (operator) {
      tokens.push({ type: 'operator', text: operator, pos: i });
      i += operator.length;
      continue;
    }
    if (punctuation.includes(c)) {
      tokens.push({ type: 'punctuation', text: c, pos: i });
      i++;
      continue;
    }

    if (hints[c]) throw new ExpressionError(hints[c], at(i));
    const symbol = String.fromCodePoint(source.codePointAt(i)!);
    throw new ExpressionError(`jeton inconnu « ${symbol} »`, at(i));
  }

  tokens.push({ type: 'end', text: '', pos: source.length });
  return tokens;
}
