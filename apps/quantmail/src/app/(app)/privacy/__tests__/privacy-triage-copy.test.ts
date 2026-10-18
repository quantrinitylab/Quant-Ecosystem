// ============================================================================
// Privacy ↔ auth-brand copy consistency (QM finding 2026-10-12 [P1]
// [copy-audit]: privacy policy contradicted the /login + /register "AI triage"
// promise on whether mail is read).
//
// Wired truth (verified 2026-10-13):
//   - AI triage READS message contents server-side:
//     apps/quantmail/backend/services/ai-triage.service.ts passes From/Subject/
//     Body verbatim into @quant/ai's AIEngine.infer, which routes to a model
//     provider (default muse-spark-1.3 → 'meta' provider,
//     packages/ai/src/core/model-router.ts). NOT on-device, NOT client-local.
//   - Triage and summarize routes are wired and user-facing:
//     src/app/api/ai/{triage,summarize,summarize-thread}/route.ts +
//     backend/routes/ai-services.ts. Reply drafting (POST /api/v1/ai/reply,
//     AIReplyService) exists backend-only — NO UI surface calls it (the
//     composer's onAIAssist prop is never rendered by EmailComposer: dead
//     plumbing, verified 2026-10-13 in PR #1083) — so it is not a provable
//     user-facing truth and the auth card no longer claims it.
// So the honest resolution is: keep the triage promise (it is provable) and
// QUALIFY the privacy wording. These tests pin both halves via source
// assertions (same pattern as privacy-copy.test.ts); JSX block comments are
// stripped so audit notes may reference the removed absolute claim.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function findSource(...rels: string[]): string {
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
  throw new Error(`privacy-triage-copy: could not locate ${rels.join(' or ')}`);
}

const stripComments = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '');

// JSX source wraps long copy across lines; collapse whitespace so assertions
// match user-visible wording regardless of source line breaks.
const flat = (s: string) => s.replace(/\s+/g, ' ');

const privacySource = flat(stripComments(
  readFileSync(
    findSource('src/app/privacy/page.tsx', 'apps/quantmail/src/app/privacy/page.tsx'),
    'utf8',
  ),
));

const brandSource = flat(stripComments(
  readFileSync(
    findSource(
      'src/components/auth/AuthBrandPanel.tsx',
      'apps/quantmail/src/components/auth/AuthBrandPanel.tsx',
    ),
    'utf8',
  ),
));

const triageServiceSource = readFileSync(
  findSource(
    'backend/services/ai-triage.service.ts',
    'apps/quantmail/backend/services/ai-triage.service.ts',
  ),
  'utf8',
);

describe('privacy ↔ auth-brand triage copy consistency', () => {
  it('privacy §1 qualifies "does not read, index, parse" with the AI-feature exception', () => {
    // The absolute claim alone contradicts the AI-triage promise on /login and
    // /register. The qualification must name the exception in the same breath.
    expect(privacySource).toMatch(
      /does not read, index, parse, or monetize your inbox[\s\S]{0,400}The one exception is AI features you explicitly invoke/,
    );
  });

  it('privacy discloses an explicit AI-features section covering triage', () => {
    expect(privacySource).toMatch(/AI Features You Explicitly Invoke/);
    expect(privacySource).toMatch(/triage your inbox/);
    expect(privacySource).toMatch(/draft a reply/);
    // Must state it happens only when the user invokes it — no background
    // reading — and never for ads or profiling.
    expect(privacySource).toMatch(/only when you invoke it/);
    expect(privacySource).toMatch(/never used for advertising/);
  });

  it('privacy data matrix Messages row covers AI triage content processing', () => {
    const messagesRow = privacySource.match(/>Messages<\/td>([\s\S]*?)<\/tr>/);
    expect(messagesRow).not.toBeNull();
    expect(messagesRow![1]).toMatch(/AI triage and reply drafting/);
    expect(messagesRow![1]).toMatch(/only for the messages you explicitly ask AI to handle/);
  });

  it('auth brand panel keeps the provable triage promise (not watered down)', () => {
    // The card's promise is the HONEST wording set in PR #1083: triage +
    // summarize are shipped and user-facing, so both are provable truths.
    // AI reply drafting is deliberately NOT claimed here — the backend route
    // exists but no UI surface calls it, so "drafts the reply" is not a
    // provable user-facing truth and was removed from the card.
    expect(brandSource).toMatch(/title="AI triage"/);
    expect(brandSource).toMatch(/surfaces what'?s urgent/);
    expect(brandSource).toMatch(/sums up long threads/);
    expect(brandSource).not.toMatch(/drafts the reply/);
  });

  it('wired truth: triage service actually sends full message content to the AI engine', () => {
    // Guards against the copy drifting the other way — if this ever becomes
    // client-local/on-device, the privacy wording must be updated to say so.
    expect(triageServiceSource).toMatch(/this\.ai\.infer\(/);
    expect(triageServiceSource).toMatch(/Body: \$\{validated\.body\}/);
  });

  it('privacy profiling section stays honest about the exception', () => {
    // "No Behavioral Profiling" remains true (triage is not profiling), but
    // it must point at §3A so the two sections do not read as contradictory.
    expect(privacySource).toMatch(
      /No Behavioral Profiling:[\s\S]{0,400}\(see §3A/,
    );
  });
});
