import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * QM-UIUX-067 — clone theater purge regression tests.
 *
 * The QuantGit UI used to present four clone transports that did not work:
 *  - an SSH URL (`git@quantmail.in:...`) — no SSH git server exists,
 *  - `gh repo clone ...` — the GitHub CLI targets github.com, not QuantGit,
 *  - `quant repo clone ...` — no `@quant/cli` package exists,
 *  - hand-built web URLs (`https://quantmail.in/quantgit/<owner>/<repo>.git`
 *    and `https://quantmail.in/git/<owner>/<repo>.git`) — paths the git
 *    server never served, which also overwrote the real URL in the UI.
 *
 * The backend does run a real git smart-HTTP server (mounted at
 * `/api/code/gitd`, real bare-repo storage, PAT/session auth) and the
 * repository API returns its endpoint as the repo's `cloneUrl`. The honest
 * fix is to present exactly that URL over HTTPS — and nothing else.
 *
 * These tests pin that: no shipped source may construct a clone URL or offer
 * a clone transport other than the API-provided HTTPS one, and the real git
 * transport must still exist in the backend.
 */

const QUANTGIT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const APP_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const FABRICATED_CLONE_MARKERS = [
  'git@quantmail.in',
  'gh repo clone',
  'quant repo clone',
  'quantmail.in/git/',
  'https://quantmail.in/quantgit/',
  'sshUrl',
  'Create codespace',
  'Launching cloud Codespace',
];

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('QM-UIUX-067 clone honesty', () => {
  it('no shipped quantgit source constructs a fabricated clone URL or transport', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(QUANTGIT_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const marker of FABRICATED_CLONE_MARKERS) {
        if (source.includes(marker)) {
          offenders.push(`${path.relative(QUANTGIT_ROOT, file)} contains "${marker}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('backend repo serializers never invent an SSH URL or a non-gitd clone path', () => {
    for (const rel of ['backend/routes/repos.ts', 'backend/services/repo-migration.service.ts']) {
      const source = readFileSync(path.join(APP_ROOT, rel), 'utf8');
      expect(source).not.toContain('sshUrl');
      expect(source).not.toContain('quantmail.in/git/');
      expect(source).toContain('/api/code/gitd/repos/');
    }
  });

  it('the real git smart-HTTP transport still exists in the backend', () => {
    const routesPath = path.join(
      APP_ROOT,
      'backend/modules/code/routes/git-transport.ts',
    );
    expect(existsSync(routesPath)).toBe(true);
    const routes = readFileSync(routesPath, 'utf8');
    expect(routes).toContain('/repos/:owner/:name/info/refs');
    expect(routes).toContain('/repos/:owner/:name/git-upload-pack');
    expect(routes).toContain('/repos/:owner/:name/git-receive-pack');
  });

  it('the clone menu takes its URL from props instead of building one', () => {
    const menu = readFileSync(
      path.join(QUANTGIT_ROOT, 'components/CloneCodespacesMenu.tsx'),
      'utf8',
    );
    expect(menu).toContain('cloneUrl: string');
    expect(menu).not.toContain('quantmail.in');
  });
});
