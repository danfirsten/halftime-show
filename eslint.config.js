import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'docs/design/**', 'qa-report/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['fixture/**/*.js'], languageOptions: { sourceType: 'script', globals: { window: 'readonly', document: 'readonly', location: 'readonly', performance: 'readonly', setInterval: 'readonly', URLSearchParams: 'readonly' } } },
  { files: ['e2e/**/*.mjs'], languageOptions: { globals: { URL: 'readonly', console: 'readonly', process: 'readonly', URLSearchParams: 'readonly', window: 'readonly', document: 'readonly' } } },
);
