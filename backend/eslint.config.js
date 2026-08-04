const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      // Аргументы с префиксом _ разрешено не использовать: у error-middleware
      // в Express четвёртый аргумент обязателен по арности, даже если не нужен
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // smart разрешает == null — это идиоматичная проверка «null или undefined»
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    ignores: ['node_modules/'],
  },
];
