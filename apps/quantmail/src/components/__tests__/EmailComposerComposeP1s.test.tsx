/**
 * QM-UIUX-025 — Compose P1s: wrong mascot reaction, lying toast, latent overflow.
 *
 * Three honesty defects, three pins:
 * (a) A blocked send used to fire `mail:noRecipients` no matter which field
 *     was missing. `getSendBlockReaction` must name the field that is
 *     actually missing, in the same order `getSendBlockReason` checks.
 * (b) The `/compose` page showed a "Message sent" toast for the whole 10s
 *     recall window, while the backend was still holding the message
 *     (`delayMs: 10000`). During that window the only honest copy is
 *     "Sending… (10s to undo)".
 * (c) The modal composer branch was `right-4 w-full` on mobile — a 100%
 *     width plus a 1rem right offset overflows the viewport by 1rem. It
 *     must pin both edges (`inset-x-4 w-auto`) on mobile and restore the
 *     anchored 600px panel on sm+.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSendBlockReason, getSendBlockReaction, EmailComposer } from '../EmailComposer';

// ---- module mocks for a server-side render of the full composer ----
// (Same harness as EmailComposerSendValidation.test.tsx / QM-UIUX-024.)

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@quant/shared-ui', () => ({
  nextRovingIndex: () => 0,
  rovingTabIndex: () => 0,
}));

vi.mock('../Quanty', () => ({
  Quanty: () => null,
}));

vi.mock('../../lib/quanty/reactions', () => ({
  quantyReact: vi.fn(),
  useQuantyMood: () => 'neutral',
}));

vi.mock('../InboxToast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
  htmlToPlainText: (html: string) => html,
}));

vi.mock('../../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));

vi.mock('../../lib/safe-html', () => ({
  useSafeEmailHtml: (html: string) => html,
}));

vi.mock('../../providers/auth-provider', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('../../hooks/useDeferredMount', () => ({
  useDeferredMount: () => false,
}));

vi.mock('../useDraftAutosave', () => ({
  useDraftAutosave: () => ({}),
  draftSaveStateLabel: () => '',
}));

vi.mock('../RecipientChipInput', () => ({
  RecipientChipInput: () => null,
  parseEmailString: (s: string) =>
    String(s)
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((email) => ({ email })),
}));

vi.mock('../../hooks/useContacts', () => ({
  useContacts: () => ({ data: [] }),
}));

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn(), dialog: null }),
}));

vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));

vi.mock('../../services/api-client', () => ({
  apiClient: {},
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

// ---- (a) reaction mapping per block reason ----

describe('getSendBlockReaction (QM-UIUX-025a)', () => {
  it('fires mail:noRecipients only when To is the gap', () => {
    expect(getSendBlockReaction('', 'Subject', 'Body')).toBe('mail:noRecipients');
    expect(getSendBlockReaction('   ', 'Subject', 'Body')).toBe('mail:noRecipients');
  });

  it('fires mail:noSubject when only the subject is missing', () => {
    expect(getSendBlockReaction('a@b.com', '', 'Body')).toBe('mail:noSubject');
    expect(getSendBlockReaction('a@b.com', '  \n ', 'Body')).toBe('mail:noSubject');
  });

  it('fires mail:noBody when only the body is missing', () => {
    expect(getSendBlockReaction('a@b.com', 'Subject', '')).toBe('mail:noBody');
    expect(getSendBlockReaction('a@b.com', 'Subject', '   ')).toBe('mail:noBody');
  });

  it('checks in the same order as getSendBlockReason: To, subject, body', () => {
    expect(getSendBlockReaction('', '', '')).toBe('mail:noRecipients');
    expect(getSendBlockReaction('a@b.com', '', '')).toBe('mail:noSubject');
  });

  it('returns null exactly when getSendBlockReason does', () => {
    const cases: Array<[string, string, string]> = [
      ['', '', ''],
      ['a@b.com', '', ''],
      ['a@b.com', 'Subject', ''],
      ['a@b.com', 'Subject', 'Body'],
      ['', 'Subject', 'Body'],
    ];
    for (const [to, subject, body] of cases) {
      expect(getSendBlockReaction(to, subject, body) === null).toBe(
        getSendBlockReason(to, subject, body) === null,
      );
    }
    expect(getSendBlockReaction('a@b.com', 'Subject', 'Body')).toBeNull();
  });

  it('gives each missing field a distinct event', () => {
    const events = new Set([
      getSendBlockReaction('', 's', 'b'),
      getSendBlockReaction('a@b.com', '', 'b'),
      getSendBlockReaction('a@b.com', 's', ''),
    ]);
    expect(events.size).toBe(3);
  });
});

// ---- (c) modal branch classes ----

/** The composer's root element is the first <div> in the rendered markup. */
function rootDivTag(html: string): string {
  const m = html.match(/<div\b[^>]*>/);
  expect(m).not.toBeNull();
  return m![0];
}

describe('modal composer branch (QM-UIUX-025c)', () => {
  it('pins both edges on mobile instead of right-4 + w-full', () => {
    const html = renderToStaticMarkup(
      <EmailComposer isOpen={true} modal={true} onClose={() => {}} />,
    );
    const tag = rootDivTag(html);
    expect(tag).toContain('inset-x-4');
    expect(tag).toContain('w-auto');
    // The old overflow pair must be gone from the mobile (base) classes.
    expect(tag).not.toMatch(/(?:^|[\s"])right-4(?:[\s"]|$)/);
    expect(tag).not.toMatch(/(?:^|[\s"])w-full(?:[\s"]|$)/);
  });

  it('restores the anchored 600px panel on sm+', () => {
    const html = renderToStaticMarkup(
      <EmailComposer isOpen={true} modal={true} onClose={() => {}} />,
    );
    const tag = rootDivTag(html);
    expect(tag).toContain('sm:w-[600px]');
    expect(tag).toContain('sm:right-8');
    // `sm:left-auto` undoes the mobile left pin so the panel stays right-anchored.
    expect(tag).toContain('sm:left-auto');
  });

  it('leaves the non-modal (full page) branch untouched', () => {
    const html = renderToStaticMarkup(<EmailComposer isOpen={true} onClose={() => {}} />);
    const tag = rootDivTag(html);
    expect(tag).toContain('h-[100dvh]');
    expect(tag).not.toContain('inset-x-4');
  });
});

// ---- (b) honest toast copy during the recall window ----

describe('recall-window toast copy (QM-UIUX-025b)', () => {
  const pageSource = readFileSync(
    fileURLToPath(new URL('../../app/compose/page.tsx', import.meta.url)),
    'utf8',
  );

  it('the /compose send toast says "Sending… (10s to undo)", not "Message sent"', () => {
    expect(pageSource).toContain("text: 'Sending… (10s to undo)'");
    expect(pageSource).not.toContain("text: 'Message sent'");
  });

  it('the toast still spans exactly the backend recall window', () => {
    // The message is held server-side for the same 10s the toast is visible.
    expect(pageSource).toContain('delayMs: 10000');
    expect(pageSource).toContain('duration: 10000');
    expect(pageSource).toContain('countdown: 10');
    expect(pageSource).toContain('undoAction');
  });

  it("the composer's own post-send \"Message sent\" toast is kept", () => {
    // That one fires only after the awaited send completes, so it is true
    // when it appears — removing it would lose the real confirmation.
    const composerSource = readFileSync(
      fileURLToPath(new URL('../EmailComposer.tsx', import.meta.url)),
      'utf8',
    );
    expect(composerSource).toContain("'Email scheduled' : 'Message sent'");
  });
});
