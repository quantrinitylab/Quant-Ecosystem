import type { SnykConfig } from './types';

export const snykConfig: SnykConfig = {
  organization: 'quant-ecosystem',
  severity: 'high',
  failOn: 'upgradable',
  packageManifests: [
    'package.json',
    'apps/quantchat/package.json',
    'apps/quantmail/package.json',
    'apps/quantai/package.json',
    'apps/quantads/package.json',
    'apps/quantube/package.json',
    'apps/quantneon/package.json',
    'apps/quantsync/package.json',
    'apps/quantdocs/package.json',
    'apps/quantdrive/package.json',
    'apps/quantmeet/package.json',
    'apps/quantcalendar/package.json',
    'apps/quantedits/package.json',
    'apps/quantmax/package.json',
    'packages/common/package.json',
    'packages/database/package.json',
    'packages/auth/package.json',
    'packages/ai/package.json',
    'packages/shared-ui/package.json',
    'packages/realtime/package.json',
    'packages/server/package.json',
    'packages/server-core/package.json',
    'packages/api-client/package.json',
    'packages/data-plane/package.json',
    'packages/queue/package.json',
    'packages/storage/package.json',
    'packages/agent-runtime/package.json',
    'packages/cross-publish/package.json',
    'packages/testing/package.json',
    'packages/payments/package.json',
    'packages/security/package.json',
    'services/gateway/package.json',
    'services/scheduler/package.json',
  ],
  ignorePatterns: ['**/test/**', '**/fixtures/**', '**/__tests__/**'],
  licenseCompliance: {
    allowedLicenses: ['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause'],
    deniedLicenses: ['GPL-3.0', 'AGPL-3.0'],
    warnLicenses: ['LGPL-2.1', 'LGPL-3.0'],
  },
  autoFix: false,
  monitorOnPush: true,
};

export function createSnykConfig(overrides: Partial<SnykConfig>): SnykConfig {
  return {
    ...snykConfig,
    ...overrides,
    licenseCompliance: overrides.licenseCompliance ?? snykConfig.licenseCompliance,
  };
}
