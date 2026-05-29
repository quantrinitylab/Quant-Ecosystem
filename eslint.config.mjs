import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '.turbo/**',
      '**/*.d.ts',
      '**/*.test.ts',
      '**/__tests__/**',
    ],
  },
  {
    files: [
      'packages/*/src/**/*.ts',
      'apps/*/src/**/*.ts',
      'apps/*/backend/**/*.ts',
      'services/*/src/**/*.ts',
    ],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: [
      'packages/*/src/**/*.ts',
      'apps/*/src/**/*.ts',
      'apps/*/backend/**/*.ts',
      'services/*/src/**/*.ts',
    ],
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/__tests__/**',
      '**/*.spec.ts',
    ],
    rules: {
      'no-console': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
);
