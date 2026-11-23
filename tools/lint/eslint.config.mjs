import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'tools/**', 'public/**', 'src/pwa/sw.template.js', 'test-results/**', 'playwright-report/**', '.e2e/**', 'src/lib/*.gen.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { project: [resolve(root, 'tsconfig.json'), resolve(root, 'e2e/tsconfig.json')], tsconfigRootDir: root } },
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-console': 'error',
      // A scrolling region must be reachable by keyboard, which axe also requires.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'group'] }],
      // The Dialog element handles Esc and focus for the whole dialog, and its keydown is not a click substitute.
      'jsx-a11y/no-noninteractive-element-interactions': ['error', { handlers: ['onClick', 'onMouseDown', 'onMouseUp'] }],
      // Components decide what to do with autoFocus. Native elements stay checked.
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
    },
  },
  { files: ['src/lib/logger.ts'], rules: { 'no-console': 'off' } },
  { files: ['**/*.mjs', 'scripts/**'], languageOptions: { globals: { process: 'readonly', Buffer: 'readonly', fetch: 'readonly', URL: 'readonly', setTimeout: 'readonly', console: 'readonly' } } },
);
