/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: [
    'packages/auth/src/**/*.ts',
    '!packages/auth/src/**/*.test.ts',
    'packages/payments/src/**/*.ts',
    '!packages/payments/src/**/*.test.ts',
    'packages/security/src/**/*.ts',
    '!packages/security/src/**/*.test.ts',
  ],
  testRunner: 'vitest',
  reporters: ['html', 'json', 'clear-text', 'progress'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 80, low: 60, break: 60 },
  incremental: true,
  concurrency: 4,
  timeoutMS: 60000,
};
export default config;
