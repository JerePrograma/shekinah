import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      '.astro/**',
      'node_modules/**',
      'playwright-report/**',
      'reference-snapshot/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.astro'],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.astro'],
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,ts,astro}'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
      'no-unused-expressions': ['error', { allowShortCircuit: true }],
    },
  },
];
