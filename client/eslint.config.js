import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  // Miniapps stay apart from the site: each app may import only its own files, React, icons
  // and the miniapp toolkit (see miniapps/README.md).
  {
    files: ['miniapps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!(react(/.*)?|lucide-react|@miniapp/sdk|\\./[^.].*)$)',
              message:
                'A miniapp may import only react, lucide-react, @miniapp/sdk and its own files.',
            },
          ],
        },
      ],
    },
  },
  // …and the site never imports a miniapp's code (the registry finds them by itself).
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/miniapps', '**/miniapps/**'],
              message: 'The site does not import miniapps; the registry discovers them.',
            },
          ],
        },
      ],
    },
  },
);
