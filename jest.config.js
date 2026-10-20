/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  // Le moteur doit rester couvert à 90 % au moins.
  collectCoverageFrom: [
    'packages/engine/src/**/*.ts',
    '!packages/engine/src/__fixtures__/**',
    // Points d'entrée en ligne de commande : testés en lançant les scripts (cli/__tests__).
    '!packages/engine/src/cli/games-check.ts',
    '!packages/engine/src/cli/review-pr.ts',
  ],
  coverageThreshold: {
    global: { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
};
