import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/']
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-console': 'error',
      'no-implicit-globals': 'error',
      'no-shadow': 'error',
      'no-alert': 'error',
      indent: ['error', 2, { SwitchCase: 1 }],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always']
    }
  },
  {
    // Browser application code.
    files: ['js/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    // Node.js tooling and tests.
    files: ['scripts/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    // CLI scripts report progress on the terminal.
    files: ['scripts/**/*.js'],
    rules: {
      'no-console': 'off'
    }
  }
];
