// ============================================================================
// QuantCooks Studio — shared-file batch #4: the follow-ups left by
// Unit 9 (Episodic Stories), C-3 (PhotoCraft) and batch #3.
//
//  - Serving (F-C3-1): the verified PhotoCraft web bundle (v0.17.0) is
//    installed at public/photo-editor/, byte-for-byte the pinned zip's
//    contents — the file set, the parts manifest's genuine first line
//    (the probe's witness in lib/studio/photocraft.ts) and the total
//    size are pinned here. In-browser boot is NOT pinned by any test:
//    no browser runs in this harness, so boot smoke belongs to the
//    staging checklist; what is pinned is that the bytes the browser
//    will be served are exactly the verified build's.
//  - Headers (F-C3-2): next.config.js carries the bundle's HOSTING.md
//    rules, scoped to /photo-editor — .wasm as application/wasm,
//    hashed files immutable, name-stable files no-cache, nosniff.
//  - Stale copy (batch #3's spotted list): the tools page header no
//    longer predates the batch #3 nav flip, and Image Studio's
//    persona note no longer claims Voice Studio is unbuilt.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');
const BUNDLE_ROOT = join(APP_ROOT, 'public', 'photo-editor');

const bundleFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(BUNDLE_ROOT, full).split('\\').join('/'));
    }
  };
  walk(BUNDLE_ROOT);
  return out.sort();
};

describe('F-C3-1 — the verified bundle is installed at public/photo-editor/', () => {
  it('the file set is exactly the pinned v0.17.0 web build’s contents', () => {
    expect(bundleFiles()).toEqual([
      '.htaccess',
      'ATTRIBUTION.md',
      'HOSTING.md',
      'LICENSE-APACHE',
      'LICENSE-MIT',
      'NOTICE',
      'README.md',
      '_headers',
      'app/parts.txt',
      'app/photocraft-web-25bf2289380b561f.part-aa',
      'app/photocraft-web.js',
      'index.html',
      'photocraft-web-boot-251aa3764a2189ed.js',
      'photocraft-web-boot-251aa3764a2189ed_bg.wasm',
      'snippets/eframe-d31a8450ea12dfc1/inline0.js',
    ]);
  });

  it('the parts manifest answers with its genuine first line (the probe’s witness)', () => {
    const parts = readFileSync(join(BUNDLE_ROOT, 'app', 'parts.txt'), 'utf8');
    expect(parts.split('\n')[0]?.trim()).toBe('photocraft-parts 1');
    // The manifest names the part the install actually carries.
    expect(parts).toContain('photocraft-web-25bf2289380b561f.part-aa');
  });

  it('the installed bytes total the verified build’s size (13,253,507 bytes)', () => {
    const total = bundleFiles().reduce(
      (sum, rel) => sum + statSync(join(BUNDLE_ROOT, rel)).size,
      0,
    );
    expect(total).toBe(13_253_507);
  });

  it('index.html boots through relative URLs (any-path serving)', () => {
    const index = readFileSync(join(BUNDLE_ROOT, 'index.html'), 'utf8');
    expect(index).toContain('photocraft-web-boot-251aa3764a2189ed.js');
    expect(index).not.toContain('src="/');
    expect(index).not.toContain('href="/');
  });
});

describe('F-C3-2 — next.config.js serves the bundle by its HOSTING.md rules', () => {
  interface HeaderRule {
    source: string;
    headers: Array<{ key: string; value: string }>;
  }

  const loadRules = async (): Promise<HeaderRule[]> => {
    const require = createRequire(import.meta.url);
    const config = require(join(APP_ROOT, 'next.config.js')) as {
      headers: () => Promise<HeaderRule[]>;
    };
    return config.headers();
  };

  const ruleFor = (rules: HeaderRule[], source: string) =>
    rules.find((r) => r.source === source);

  it('.wasm is served as application/wasm, cached immutably', async () => {
    const rule = ruleFor(await loadRules(), '/photo-editor/:file*.wasm');
    expect(rule?.headers).toContainEqual({ key: 'Content-Type', value: 'application/wasm' });
    expect(rule?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    });
  });

  it('the hashed app parts are cached immutably (and get no Content-Encoding rule)', async () => {
    const rules = await loadRules();
    const rule = ruleFor(rules, '/photo-editor/app/:part*.part-:hash');
    expect(rule?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    });
    // Byte-for-byte means no transform headers anywhere in the config.
    for (const r of rules) {
      for (const h of r.headers) expect(h.key).not.toBe('Content-Encoding');
    }
  });

  it('the name-stable files revalidate: index.html, the app glue, the parts manifest', async () => {
    const rules = await loadRules();
    for (const source of [
      '/photo-editor/index.html',
      '/photo-editor/app/photocraft-web.js',
      '/photo-editor/app/parts.txt',
    ]) {
      expect(ruleFor(rules, source)?.headers).toContainEqual({
        key: 'Cache-Control',
        value: 'no-cache',
      });
    }
  });

  it('nosniff is scoped to the bundles, not declared app-wide', async () => {
    const rules = await loadRules();
    const nosniff = rules.filter((r) =>
      r.headers.some((h) => h.key === 'X-Content-Type-Options'),
    );
    // The design-editor bundle (C-7) joined the photo-editor bundle:
    // both bundle-scoped, still nothing app-wide.
    expect(nosniff.map((r) => r.source)).toEqual([
      '/photo-editor/:path*',
      '/design-editor/:path*',
    ]);
  });
});

describe('batch #3 spotted list — stale copy corrected', () => {
  it('the tools page header no longer predates the batch #3 nav flip', () => {
    const src = readFileSync(join(APP_ROOT, 'src', 'pages', 'tools.tsx'), 'utf8');
    expect(src).not.toContain('STUDIO_NAV still lists Quick Tools as');
    expect(src).toContain("batch #3 flipped the Quick Tools entry to href '/tools'");
  });

  it('Image Studio’s persona note points at the Voice Studio that exists', () => {
    const src = readFileSync(
      join(APP_ROOT, 'src', 'components', 'studio', 'ImageStudio.tsx'),
      'utf8',
    );
    expect(src).not.toContain('which is still in build');
    expect(src).toContain('personas are created in Voice Studio (which lives at /studio/voice)');
  });
});
