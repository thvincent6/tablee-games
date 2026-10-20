const { defineConfig, globalIgnores } = require('eslint/config');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores(['coverage/*', 'node_modules/*']),
  tseslint.configs.recommended,
  prettierRecommended,
  {
    // Les formules des jeux sont interprétées, jamais exécutées : aucun moyen d'évaluer du code.
    files: ['**/*.{js,ts}'],
    // Globales connues (setTimeout…) : sans elles, `no-implied-eval` ne repère rien.
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'Function',
          message: 'Interdit : les formules sont interprétées, jamais exécutées.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Import dynamique interdit : tout le code est chargé statiquement.',
        },
      ],
    },
  },
  {
    // Variables volontairement ignorées : préfixe `_` (`const { tests: _tests, ...rest }`).
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Les tests manipulent des définitions volontairement mal typées.
    files: ['**/__tests__/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Fichiers de configuration en CommonJS.
    files: ['*.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Le moteur reste pur : il tourne dans l'app (React Native), en CI et sous Node.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-native', 'react-native-*', 'expo', 'expo-*', '@expo/*'],
              message: 'Le moteur ne dépend ni de React, ni de React Native, ni d’Expo.',
            },
          ],
        },
      ],
    },
  },
]);
