// @vitest-environment jsdom
// ============================================================================
// Auth + settings copy-honesty: no unprovable "at rest" security claims.
//
// Finding (queue 2026-10-11, P1): the login brand panel and the settings
// security section claimed "Encrypted in transit and at rest", but at-rest
// encryption is not a provable truth today — the live staging RDS instance
// quant-staging-postgres reports StorageEncrypted=False (boto3
// describe-db-instances), PGPEncryptionService is opt-in with an in-memory
// default vault, and nothing encrypts stored mail. Per the user-locked
// 2026-10-07 design rule (every word is an instruction or a provable truth),
// user-facing copy must claim only what is provable: TLS in transit.
//
// These tests pin the fixed copy:
//   1. AuthBrandPanel renders the real text with the logo marks mocked — no
//      "at rest" may appear, and the transit claim must render.
//   2. The settings security section source (minus comments) must contain no
//      "at rest" strings after the fix.
// ============================================================================

import { describe, expect, it, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// Mock the visual marks only — the text content under test comes from the
// real AuthBrandPanel component.
vi.mock('../../QuantMailLogo', () => ({ QuantMailLogo: () => null }));
vi.mock('../../BrandWordmark', () => ({ BrandWordmark: () => null }));
vi.mock('../../QuantAiLogo', () => ({ QuantAiLogo: () => null }));
vi.mock('../auth-brand-contract', () => ({
  quantMailAuthLockup: {
    productName: 'QuantMail',
    byline: 'by QUANTRINITY',
    accessibleName: 'QuantMail by Quantrinity',
  },
}));

import { AuthBrandPanel } from '../AuthBrandPanel';

const AT_REST = /at[\s-]?rest/i;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderPanel() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AuthBrandPanel
        eyebrow="Welcome back"
        title="Sign in to QuantMail"
        subtitle="Your inbox, evolved."
      />,
    );
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('AuthBrandPanel copy honesty', () => {
  it('never claims encryption at rest', () => {
    const el = renderPanel();
    expect(el.textContent).not.toMatch(AT_REST);
  });

  it('claims only the provable in-transit protection', () => {
    const el = renderPanel();
    expect(el.textContent).toMatch(/Encrypted in transit/);
    expect(el.textContent).toMatch(
      /encrypted between your device and our servers/i,
    );
  });
});

describe('Settings security section copy honesty', () => {
  // Locate the settings source from wherever vitest was invoked (the repo
  // convention is `cd apps/quantmail && vitest run`, but the walk-up keeps
  // this honest if run from the repo root too).
  const settingsSource = readFileSync(
    (function findSettingsSource(): string {
      const rels = [
        'src/app/settings/page.tsx',
        'apps/quantmail/src/app/settings/page.tsx',
      ];
      let dir = process.cwd();
      for (let depth = 0; depth < 8; depth++) {
        for (const rel of rels) {
          const candidate = join(dir, rel);
          if (existsSync(candidate)) return candidate;
        }
        const parent = join(dir, '..');
        if (parent === dir) break;
        dir = parent;
      }
      throw new Error(
        `auth-copy-honesty: could not locate src/app/settings/page.tsx from ${process.cwd()}`,
      );
    })(),
    'utf8',
  );

  // Strip JSX block comments and line comments; only user-facing strings
  // are subject to the provable-truth rule (audit notes may name the claim
  // to explain why it was removed).
  const userFacing = settingsSource
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '');

  it('never claims encryption at rest in user-facing copy', () => {
    expect(userFacing).not.toMatch(AT_REST);
  });

  it('states only the provable in-transit protection', () => {
    expect(userFacing).toMatch(/Encrypted in transit/);
    expect(userFacing).toMatch(/TLS 1\.2\+/);
    expect(userFacing).not.toMatch(/encrypted on disk/);
  });

  it('keeps the honest not-end-to-end-encrypted boundary', () => {
    expect(userFacing).toMatch(/not[\s\S]{0,80}end-to-end encrypted/i);
  });
});
