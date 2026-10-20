// Phrases à trous des définitions (`scoring.describe`) : texte et `{formules}`.

/** Morceau d'une phrase `describe` : du texte, ou une formule entre accolades. */
export type TemplatePart = { text: string } | { formula: string; position: number };

/**
 * Découpe « {contract} réussie de {margin} » en texte et formules.
 * Lève une erreur (avec la position, base 1) pour une accolade non fermée ou une formule vide.
 */
export function parseTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let rest = 0;
  for (let i = 0; i < template.length; i++) {
    const char = template[i];
    if (char === '}') throw new Error(`accolade fermante sans ouvrante (caractère ${i + 1})`);
    if (char !== '{') continue;
    const end = template.indexOf('}', i);
    if (end < 0) throw new Error(`accolade ouvrante sans fermante (caractère ${i + 1})`);
    const formula = template.slice(i + 1, end).trim();
    if (!formula) throw new Error(`formule vide entre accolades (caractère ${i + 1})`);
    if (i > rest) parts.push({ text: template.slice(rest, i) });
    parts.push({ formula, position: i + 1 });
    rest = end + 1;
    i = end;
  }
  if (rest < template.length) parts.push({ text: template.slice(rest) });
  return parts;
}
