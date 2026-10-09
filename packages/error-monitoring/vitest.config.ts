import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Compiled copies of the tests land in dist/ after `tsc` (the build
    // emits src/__tests__ too). Never collect them: they duplicate the
    // source tests and race the build — a dist test can execute while
    // tsc has only partially emitted dist/, failing with
    // ERR_MODULE_NOT_FOUND for modules that exist in src/.
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
