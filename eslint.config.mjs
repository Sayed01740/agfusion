import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const sharedRules = {
  'no-debugger': 'error',
  'no-constant-condition': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'valid-typeof': 'error',
  'no-eval': 'error',
  'no-new-func': 'error',
  'no-implied-eval': 'error',
  'no-prototype-builtins': 'error',
  'no-empty': ['error', { allowEmptyCatch: true }],
};

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'build/**',
      'next-env.d.ts',
      'prisma/generated/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...sharedRules,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...sharedRules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
