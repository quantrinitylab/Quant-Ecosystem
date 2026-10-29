import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * qm-storagequota-deadcode — dead-code removal regression guard.
 *
 * The `StorageQuotaBar` component (apps/quantmail/src/components/drive/)
 * was deleted on 2026-10-21: it was never imported or rendered by any page
 * or component (the Drive page's real quota meter lives in
 * app/drive/components/DriveFilesSubView.tsx via the `useStorageQuota`
 * hook), yet its `loadQuota()` fabricated a "15 GB FREE" quota marked
 * `loaded=true` whenever the backend omitted the limit/tier — invented
 * readings presented as real data. These tests pin the deletion so the
 * dead component (and its fabrication defaults) cannot be reintroduced.
 */
describe('qm-storagequota-deadcode: StorageQuotaBar stays deleted', () => {
  const SRC_ROOT = new URL('..', import.meta.url).pathname;
  const DEAD_FILE = join(
    SRC_ROOT,
    'components',
    'drive',
    'StorageQuotaBar.tsx',
  );

  it('the dead component file does not exist', () => {
    expect(existsSync(DEAD_FILE)).toBe(false);
  });

  it('no non-test source file references StorageQuotaBar', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          if (entry === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
        if (full.includes(`${'/'}__tests__${'/'}`)) continue;
        const src = readFileSync(full, 'utf8');
        if (src.includes('StorageQuotaBar')) offenders.push(full);
      }
    };
    walk(SRC_ROOT);
    expect(offenders).toEqual([]);
  });
});
