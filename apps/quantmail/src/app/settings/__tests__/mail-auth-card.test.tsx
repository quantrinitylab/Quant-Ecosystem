// @vitest-environment jsdom
// ============================================================================
// Mail auth card (fix/qm-device-signing-key)
// The finding this fixes: Settings → Security showed a "Device signing key /
// Not generated on this browser yet" row with a "Not set up" pill, but no
// generation flow existed anywhere — the only "device signing key" reference
// in the entire codebase. An unactionable status is a fake control. The same
// card's "DKIM & SPF — Configured" pill was a status badge nothing probed (a
// deployment fact, not a live check).
// These tests pin (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. The card states DKIM & SPF as plain configuration text, with no
//      status pill anywhere.
//   2. "Device signing key" appears nowhere in the card or in settings/page.tsx
//      — no status the user can never act on.
//   3. No divider lines in the card (pure-black no-divider UI rule), and the
//      card carries no colour-tier badge copy ("Configured", "Not set up").
// ============================================================================

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MailAuthCard } from '../MailAuthCard';

function readSource(relApp: string): string {
  const rels = [`src/${relApp}`, `apps/quantmail/src/${relApp}`];
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    for (const rel of rels) {
      const candidate = join(dir, rel);
      try {
        return readFileSync(candidate, 'utf8');
      } catch {
        /* try the next candidate */
      }
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate ${relApp} from ${process.cwd()}`);
}

describe('MailAuthCard renders DKIM as plain configuration text', () => {
  const html = () => renderToStaticMarkup(<MailAuthCard />);

  it('states DKIM & SPF as configuration, with no status badge', () => {
    const out = html();
    expect(out).toContain('DKIM');
    expect(out).toContain('SPF');
    expect(out).toContain('quantmail.in');
    // No pill, no badge markup, no tiered status copy.
    expect(out).not.toMatch(/rounded-full/);
    expect(out).not.toContain('>Configured<');
    expect(out).not.toContain('>Not set up<');
  });

  it('has no device signing key row — the feature does not exist', () => {
    const out = html();
    expect(out).not.toContain('Device signing key');
    expect(out).not.toContain('device signing key');
  });

  it('carries no divider lines (no-divider UI rule)', () => {
    const out = html();
    expect(out).not.toContain('border-t');
    expect(out).not.toContain('divide-');
  });
});

describe('settings page has no lingering device-signing references', () => {
  const src = () => readSource('app/settings/page.tsx');

  it('no "device signing key" row survives in the settings page', () => {
    expect(src()).not.toContain('Device signing key');
    expect(src()).not.toContain('Not generated on this browser yet');
  });

  it('no unprobeable DKIM "Configured" status pill survives', () => {
    expect(src()).not.toContain('<StatusPill>Configured</StatusPill>');
    expect(src()).not.toContain('<StatusPill>Not set up</StatusPill>');
  });

  it('the card is mounted via MailAuthCard', () => {
    expect(src()).toContain('<MailAuthCard />');
    expect(src()).toContain("from './MailAuthCard'");
  });
});
