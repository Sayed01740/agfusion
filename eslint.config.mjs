export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'dist/**', 'build/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
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
    },
  },
];
