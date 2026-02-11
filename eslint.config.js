const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'tests/',
      'src/scripts/',
      'src/frontend/docs/',
      'src/migrations/',
      'eslint.config.js',
      'debug-*.js',
      'test-*.js',
      'test_*.js',
      'run-*.js',
      'mcp-server/'
    ]
  },
  // Base recommended rules
  js.configs.recommended,
  // Backend config (Node.js CommonJS)
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^next$|^req$|^res$', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      'no-var': 'warn'
    }
  },
  // Frontend config (browser globals)
  {
    files: ['src/frontend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ApexCharts: 'readonly',
        TeamContextManager: 'readonly',
        marked: 'readonly',
        DOMPurify: 'readonly',
        i18n: 'readonly'
      }
    },
    rules: {
      'no-redeclare': 'off'
    }
  }
];
