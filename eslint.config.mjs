import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import tseslint from 'typescript-eslint'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

const config = [
  includeIgnoreFile(gitignorePath),
  {
    ignores: ['coverage/', 'dist/'],
  },
  ...oclif,
  // Allow parsing test files and command files that aren't in tsconfig.json
  {
    files: ['test/**/*.ts', 'src/commands/**/*.ts', 'src/mock/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Disable extraneous import checks for config file
  {
    files: ['eslint.config.mjs'],
    rules: {
      'import-x/no-extraneous-dependencies': 'off',
      'n/no-extraneous-import': 'off',
    },
  },
  // Relax some strict rules from eslint-config-oclif@7
  {
    rules: {
      '@typescript-eslint/no-base-to-string': 'off',
      // Allow Buffer type
      '@typescript-eslint/no-restricted-types': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Allow Buffer usage (Node.js standard)
      'n/prefer-global/buffer': 'off',
      // Don't require error causes
      'preserve-caught-error': 'off',
      // Don't require unicode flag for regex
      'require-unicode-regexp': 'off',
      // Allow dynamic property checks
      'unicorn/no-computed-property-existence-check': 'off',
      // Allow HTTP URLs (for local development)
      'unicorn/prefer-https': 'off',
      // Allow condition ordering
      'unicorn/prefer-simple-condition-first': 'off',
    },
  },
  // Additional relaxations for test files
  {
    files: ['test/**/*.ts'],
    rules: {
      // Allow duplicate imports (common in tests)
      'import-x/no-duplicates': 'off',
      // Allow named default imports
      'import-x/no-named-default': 'off',
      // Allow Buffer in tests
      'n/prefer-global/buffer': 'off',
      // Allow nested calls in tests
      'unicorn/max-nested-calls': 'off',
      'unicorn/no-named-default': 'off',
      // Allow Promise constructor pattern
      'unicorn/prefer-promise-with-resolvers': 'off',
    },
  },
  // Relax rules for mock files
  {
    files: ['src/mock/**/*.ts'],
    rules: {
      // Allow empty functions in mocks
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  prettier,
]

export default config
