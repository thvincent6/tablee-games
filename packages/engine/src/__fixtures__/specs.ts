import examples from './spec-examples.json';

// Exemples JSON des spécifications de l'app Tablée (blocs ```json de `docs/specs.md`, dans le
// dépôt de l'app), recopiés ici. L'app vérifie que sa copie des specs et ce fichier concordent.

export type SpecExample = Record<string, unknown>;

export const specExamples: SpecExample[] = examples as SpecExample[];

const matchers: Record<'Skyjo' | 'Yams' | 'Coinche', (e: SpecExample) => boolean> = {
  Skyjo: (e) => e.id === 'skyjo',
  Yams: (e) => e.archetype === 'grid',
  Coinche: (e) => e.archetype === 'contract',
};

export type SpecGame = keyof typeof matchers;
export const specGames = Object.keys(matchers) as SpecGame[];

export function specExample(game: SpecGame): SpecExample {
  const example = specExamples.find(matchers[game]);
  if (!example) throw new Error(`exemple ${game} introuvable dans spec-examples.json`);
  return example;
}
