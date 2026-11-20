import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Framework and side-effect modules that the pure domain layer must never import. */
const DOMAIN_FORBIDDEN_IMPORTS = [
  'react',
  'react-dom',
  'react-dom/*',
  'react-router-dom',
  'react-hook-form',
  '@tanstack/*',
  '@radix-ui/*',
  'maplibre-gl',
  'terra-draw',
  'terra-draw-*',
  '@/api',
  '@/api/*',
  '@/features',
  '@/features/*',
  '@/components',
  '@/components/*',
  '@/hooks',
  '@/hooks/*',
  '@/app',
  '@/app/*',
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'node_modules',
      'src/api/generated',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    extends: [jsxA11y.flatConfigs.recommended],
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Named exports only (spec section 4).
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports only.',
        },
      ],
    },
  },
  {
    // Feature folders talk to each other only through their index.ts.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/*'],
              message:
                'Import another feature only through its index.ts (use relative paths inside your own feature).',
            },
          ],
        },
      ],
    },
  },
  {
    // domain/ is pure TypeScript: no framework, I/O or UI layer imports.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: DOMAIN_FORBIDDEN_IMPORTS,
              message: 'src/domain must stay pure: no framework, map, network or UI imports.',
            },
          ],
        },
      ],
    },
  },
  {
    // The logger is the single sanctioned place for console output.
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['tests/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);
