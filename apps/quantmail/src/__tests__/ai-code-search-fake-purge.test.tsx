import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * QM-UIUX-069 — fake AI code search purge regression tests.
 *
 * `src/components/AICodeSearch.tsx` was a fabricated feature:
 *  - a deliberate 600ms simulated delay (`setTimeout(r, 600)`),
 *  - hardcoded mock results presented as real search hits,
 *  - a false capability claim ("We have SEMANTIC search").
 *
 * It was also dead code — nothing in the app imported or mounted it
 * (verified: the only references to `AICodeSearch` in `src/` were inside
 * the file itself). The honest fix is deletion, not wiring: a real
 * backend already exists (`backend/services/ai-code-search.service.ts`,
 * exposed via `backend/routes/ai-devtools.ts`) and stays untouched.
 *
 * These tests pin the deletion: the fake component, its mock strings,
 * its simulated delay, and its exclusive CSS must never come back,
 * while the real backend remains in place.
 */

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));
const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const FABRICATION_MARKERS = [
  'AICodeSearch',
  'Simulate search results',
  'We have SEMANTIC search',
  'mockResults',
  'ai-code-search',
  'validateCredentials(email: string, password: string)',
  'setTimeout(r, 600)',
];

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('QM-UIUX-069: fake AICodeSearch component is deleted', () => {
  it('the component file no longer exists', () => {
    expect(existsSync(path.join(SRC_ROOT, 'components', 'AICodeSearch.tsx'))).toBe(false);
  });

  it('no shipped frontend source references the fake component or its mock content', () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const marker of FABRICATION_MARKERS) {
        expect(src, `${marker} found in ${path.relative(SRC_ROOT, file)}`).not.toContain(marker);
      }
    }
  });

  it('the exclusive CSS for the fake component is gone from globals.css', () => {
    const css = readFileSync(path.join(SRC_ROOT, 'app', 'globals.css'), 'utf8');
    expect(css).not.toContain('.ai-code-search');
    expect(css).not.toContain('.code-search-bar');
    expect(css).not.toContain('.code-search-result');
    expect(css).not.toContain('.search-result-badge');
  });
});

describe('QM-UIUX-069: the real code-search backend is untouched', () => {
  it('backend service and route still exist (only the fake frontend was removed)', () => {
    expect(existsSync(path.join(APP_ROOT, 'backend', 'services', 'ai-code-search.service.ts'))).toBe(
      true,
    );
    expect(existsSync(path.join(APP_ROOT, 'backend', 'routes', 'ai-devtools.ts'))).toBe(true);
  });
});
