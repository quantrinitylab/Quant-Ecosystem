import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: false,
  esbuild: {
    jsx: 'automatic',
    tsconfigRaw: {
      compilerOptions: {
        jsx: 'react-jsx',
      },
    },
  },
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
