// @vitest-environment node
// ============================================================================
// quantmail — dead Next route regression: /api/emails/compose-assist
// ============================================================================
//
// The composer page's AI assist calls `apiClient.aiCompose()` → POST backend
// `/ai/compose` (real: Workers AI primary, honest 503 when unconfigured).
// A separate Next route `src/app/api/emails/compose-assist/route.ts` proxied
// to backend `/emails/compose-assist` and had ZERO callers anywhere in src/ —
// dormant wiring that 404s (or misroutes) the moment anyone touches it. It was
// deleted; these tests pin the deletion shut so the dead route cannot
// silently return, and prove the live composer path is still wired.

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkSourceFiles(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('dead /api/emails/compose-assist route stays deleted', () => {
  it('the route file does not exist', () => {
    expect(existsSync(join(SRC, 'app/api/emails/compose-assist/route.ts'))).toBe(false);
    expect(existsSync(join(SRC, 'app/api/emails/compose-assist'))).toBe(false);
  });

  it('no src file references /emails/compose-assist', () => {
    const offenders: string[] = [];
    for (const file of walkSourceFiles(SRC)) {
      if (file === fileURLToPath(import.meta.url)) continue;
      const text = readFileSync(file, 'utf8');
      if (text.includes('emails/compose-assist')) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the composer still calls the live backend /ai/compose path', () => {
    const client = readFileSync(join(SRC, 'services/api-client.ts'), 'utf8');
    expect(client).toContain("this.post('/ai/compose'");
    const composePage = readFileSync(join(SRC, 'app/compose/page.tsx'), 'utf8');
    expect(composePage).toContain('apiClient.aiCompose(');
  });
});
