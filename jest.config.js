/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  // Le moteur doit rester couvert à 90 % au moins.
  collectCoverageFrom: [
    'packages/engine/src/**/*.ts',
    '!packages/engine/src/__fixtures__/**',
    // Point d'entrée en ligne de commande : testé en lançant le script (cli/__tests__).
    '!packages/engine/src/cli/games-check.ts',
  ],
  coverageThreshold: {
    global: { statements: 90, branches: 90, functions: 90, lines: 90 },
  },
};
