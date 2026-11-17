import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'docs/design/**', 'qa-report/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['e2e/**/*.mjs'], languageOptions: { globals: { URL: 'readonly', console: 'readonly', process: 'readonly', document: 'readonly' } } },
);
