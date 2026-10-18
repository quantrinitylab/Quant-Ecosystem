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
        'src/app/(app)/settings/page.tsx',
        'apps/quantmail/src/app/(app)/settings/page.tsx',
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
        `auth-copy-honesty: could not locate src/app/(app)/settings/page.tsx from ${process.cwd()}`,
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

// ============================================================================
// "AI triage" card copy honesty (2026-10-13, P1 customer-qa finding).
//
// The login/register brand panel's "AI triage" card claimed "Quant AI
// surfaces what's urgent and drafts the reply." The triage half is provably
// shipped (ai-triage.service.ts passes the real From/Subject/Body into the
// server-side AIEngine — verified in PR #1080), but "drafts the reply" had
// no backing: POST /api/v1/ai/reply (AIReplyService) exists in the backend
// with a Next proxy route, yet NO UI surface calls it — the composer's
// onAIAssist prop is declared but never rendered by EmailComposer (dead
// plumbing). Per the provable-truth rule, the drafting claim was replaced
// with thread summarization, which IS shipped and user-facing
// (ThreadSummaryCard in ConversationalThreadView → POST /api/ai/summarize-thread).
//
// These tests pin the fixed copy so the drafting claim cannot come back.
// ============================================================================

describe('AuthBrandPanel "AI triage" card copy honesty', () => {
  // Locate AuthBrandPanel.tsx from wherever vitest was invoked (same
  // walk-up convention as the settings source above).
  const panelSource = readFileSync(
    (function findPanelSource(): string {
      const rels = [
        'src/components/auth/AuthBrandPanel.tsx',
        'apps/quantmail/src/components/auth/AuthBrandPanel.tsx',
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
        `auth-copy-honesty: could not locate AuthBrandPanel.tsx from ${process.cwd()}`,
      );
    })(),
    'utf8',
  );

  // Strip JSX block comments and line comments; audit notes may name the
  // removed claim to explain why it was removed — only user-facing copy
  // is subject to the provable-truth rule.
  const userFacing = panelSource
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '');

  it('never claims AI reply drafting in user-facing copy', () => {
    expect(userFacing).not.toMatch(/drafts the reply/i);
  });

  it('keeps the provable triage promise', () => {
    expect(userFacing).toMatch(/surfaces what's urgent/i);
  });

  it('pairs triage with a provable thread-summary claim', () => {
    expect(userFacing).toMatch(/sums up long threads/i);
  });

  it('renders the honest copy in the panel DOM', () => {
    const el = renderPanel();
    expect(el.textContent).not.toMatch(/drafts the reply/i);
    expect(el.textContent).toMatch(/surfaces what's urgent/i);
    expect(el.textContent).toMatch(/sums up long threads/i);
  });
});

// ============================================================================
// Login/register brand-subtitle copy honesty (2026-10-15, P1 auth-sso
// finding).
//
// The login brand panel (login-skeleton.tsx LoginBrand) and the register
// page subtitle promised "assisted drafting" — the same invented-AI-claim
// class as the "drafts the reply" card fixed in PR #1083. The register
// subtitle has since moved into register-skeleton.tsx RegisterBrand
// (server-rendered shell + client form island, PR #1189) — the tests track
// the new home. The only AI-writing
// path (compose/page.tsx handleAIAssist → POST /api/ai/compose) has no
// user-facing trigger: EmailComposer's onAIAssist prop is declared but never
// rendered (dead plumbing). Per the provable-truth rule, the claim was
// dropped and both subtitles were restricted to shipped features (threads,
// schedules / mail, scheduling).
//
// These tests pin the fixed copy so the unprovable claim cannot come back.
// ============================================================================

describe('Auth brand-subtitle "assisted drafting" copy honesty', () => {
  // Locate sources from wherever vitest was invoked (same walk-up
  // convention as the tests above).
  const findSource = (...rels: string[]): string => {
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
      `auth-copy-honesty: could not locate ${rels[0]} from ${process.cwd()}`,
    );
  };

  const stripComments = (src: string): string =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/(^|\s)\/\/[^\n]*/g, '');

  const loginSkeletonUserFacing = stripComments(
    readFileSync(
      findSource(
        'src/app/(auth)/login/login-skeleton.tsx',
        'apps/quantmail/src/app/(auth)/login/login-skeleton.tsx',
      ),
      'utf8',
    ),
  );

  const registerUserFacing = stripComments(
    readFileSync(
      findSource(
        'src/app/(auth)/register/register-skeleton.tsx',
        'apps/quantmail/src/app/(auth)/register/register-skeleton.tsx',
      ),
      'utf8',
    ),
  );

  it('never promises "assisted drafting" in the login brand subtitle', () => {
    expect(loginSkeletonUserFacing).not.toMatch(/assisted drafting/i);
  });

  it('never promises "assisted drafting" in the register brand subtitle', () => {
    expect(registerUserFacing).not.toMatch(/assisted drafting/i);
  });

  it('keeps the provable login promise (threads and schedules)', () => {
    expect(loginSkeletonUserFacing).toMatch(/threads and schedules/i);
  });

  it('keeps the provable register promise (mail and scheduling)', () => {
    expect(registerUserFacing).toMatch(/mail and scheduling/i);
  });
});
