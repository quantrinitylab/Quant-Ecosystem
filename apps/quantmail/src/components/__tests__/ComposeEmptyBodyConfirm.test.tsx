/**
 * Empty-body confirm (Gmail-style) — the finding: an empty body hard-blocked
 * the send with NO send-anyway path in either composer, so attached-only
 * emails (sending just a file) could not be sent at all.
 *
 * Contract under test (QM-UIUX-024 as amended):
 * - `getSendBlockReason` no longer blocks on an empty body — recipients and
 *   subject stay hard blocks, exactly as before.
 * - `needsEmptyBodyConfirm` is true exactly when nothing hard-blocks but the
 *   body is empty (recipients valid, subject present).
 * - `getSendBlockReaction` still names the field (`mail:noBody`) so the
 *   confirm-cancel path can announce the unfinished draft.
 * - The rendered EmailComposer Send button is ENABLED when only the body is
 *   empty (it used to be disabled with the hard-block reason as its title).
 * - Both composers ask the Gmail question via the existing useConfirm dialog
 *   BEFORE the undo-send countdown is queued (source pin: the confirm copy
 *   precedes `queueSend` in both handleSend bodies).
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getSendBlockReason,
  getSendBlockReaction,
  needsEmptyBodyConfirm,
  EmailComposer,
} from '../EmailComposer';
import {
  getSendBlockReason as sourceReason,
  needsEmptyBodyConfirm as sourceConfirm,
} from '../composeValidation';

// ---- module mocks for a server-side render of the full composer ----
// (Same harness as ComposeEmailValidation.test.tsx / QM-UIUX-024.)

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
  // Minimal faithful parser: the component derives `to` from
  // `toRecipients.map(r => r.email).join(', ')`, and handleSend splits the
  // raw string on /[,;\s]+/ — so parse like the real one does.
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

// ---- needsEmptyBodyConfirm: the confirm predicate ----

describe('needsEmptyBodyConfirm', () => {
  it('is true when only the body is empty (recipients valid, subject present)', () => {
    expect(needsEmptyBodyConfirm('a@b.com', 'Subject', '', [{ email: 'a@b.com' }])).toBe(true);
    expect(needsEmptyBodyConfirm('a@b.com', 'Subject', '   ', [{ email: 'a@b.com' }])).toBe(true);
  });

  it('is false when the body has text', () => {
    expect(needsEmptyBodyConfirm('a@b.com', 'Subject', 'Body', [{ email: 'a@b.com' }])).toBe(
      false,
    );
  });

  it('is false when a hard block applies (To missing / malformed / subject missing)', () => {
    expect(needsEmptyBodyConfirm('', 'Subject', '', [])).toBe(false);
    expect(needsEmptyBodyConfirm('notanemail', 'Subject', '', [{ email: 'notanemail' }])).toBe(
      false,
    );
    expect(needsEmptyBodyConfirm('a@b.com', '', '', [{ email: 'a@b.com' }])).toBe(false);
  });

  it('keeps 3-arg calls working (recipients default to [])', () => {
    expect(needsEmptyBodyConfirm('a@b.com', 'Subject', '')).toBe(true);
    expect(needsEmptyBodyConfirm('a@b.com', 'Subject', 'Body')).toBe(false);
  });
});

// ---- getSendBlockReason: body no longer blocks; To/subject still do ----

describe('getSendBlockReason (empty body is a confirm, not a block)', () => {
  it('returns null when only the body is empty', () => {
    expect(getSendBlockReason('a@b.com', 'Subject', '', [{ email: 'a@b.com' }])).toBeNull();
    expect(getSendBlockReason('a@b.com', 'Subject', '   ')).toBeNull();
  });

  it('still hard-blocks a missing To', () => {
    expect(getSendBlockReason('', 'Subject', 'Body')).toBe(
      'Please specify at least one recipient (To:)',
    );
  });

  it('still hard-blocks a malformed recipient', () => {
    expect(getSendBlockReason('notanemail', 'Subject', 'Body', [{ email: 'notanemail' }])).toBe(
      '"notanemail" is not a valid email address',
    );
  });

  it('still hard-blocks a missing subject', () => {
    expect(getSendBlockReason('a@b.com', '', 'Body', [{ email: 'a@b.com' }])).toBe(
      'Please enter an email subject',
    );
  });
});

// ---- getSendBlockReaction: still names the missing body field ----

describe('getSendBlockReaction (confirm-cancel announcement)', () => {
  it('returns mail:noBody when only the body is missing', () => {
    expect(getSendBlockReaction('a@b.com', 'Subject', '')).toBe('mail:noBody');
  });

  it('is null when the send is fully ready', () => {
    expect(getSendBlockReaction('a@b.com', 'Subject', 'Body')).toBeNull();
  });
});

// ---- the names re-exported from EmailComposer are the same functions ----

describe('composeValidation re-export', () => {
  it('EmailComposer re-exports the single source of truth unchanged', () => {
    expect(sourceReason).toBe(getSendBlockReason);
    expect(sourceConfirm).toBe(needsEmptyBodyConfirm);
  });
});

// ---- rendered Send button contract ----

/** Extract the opening tag of the primary Send button from static markup. */
function sendButtonTag(html: string): string | null {
  // The primary Send button is the only button whose label starts with
  // the literal text "Send" (the dropup toggle is aria-labeled "Send options").
  const matches = [...html.matchAll(/<button\b[^>]*>/g)];
  for (const m of matches) {
    const start = m.index ?? 0;
    const after = html.slice(start + m[0].length, start + m[0].length + 120);
    if (/^\s*<span>Send<\/span>/.test(after)) return m[0];
  }
  return null;
}

function isSendDisabled(html: string): boolean {
  const tag = sendButtonTag(html);
  expect(tag).not.toBeNull();
  // Match a real `disabled` attribute only — not `aria-disabled` (hyphenated)
  // and not the `disabled:opacity-40` Tailwind variant in class names.
  return /(?:^|\s)disabled(?:=|\s|>)/.test(tag!);
}

describe('Send button with an empty body', () => {
  it('stays ENABLED when only the body is empty (confirm path, not a block)', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        isOpen={true}
        onClose={() => {}}
        initialTo={[{ email: 'a@b.com' }]}
        initialSubject="Subject"
        initialBody=""
      />,
    );
    expect(isSendDisabled(html)).toBe(false);
  });

  it('is still disabled when the subject is missing (hard block unchanged)', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        isOpen={true}
        onClose={() => {}}
        initialTo={[{ email: 'a@b.com' }]}
        initialSubject=""
        initialBody="Body"
      />,
    );
    expect(isSendDisabled(html)).toBe(true);
  });

  it('is still disabled when To is missing (hard block unchanged)', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        isOpen={true}
        onClose={() => {}}
        initialSubject="Subject"
        initialBody="Body"
      />,
    );
    expect(isSendDisabled(html)).toBe(true);
  });
});

// ---- source pins: both composers confirm BEFORE the undo countdown ----

const GMAIL_COPY = 'Send this message without text in the body?';

function fileText(relative: string): string {
  const here = fileURLToPath(import.meta.url);
  const path = here.replace(/__tests__\/[^/]+$/, relative);
  return readFileSync(path, 'utf8');
}

describe('confirm placement (source pins)', () => {
  it('EmailComposer asks the Gmail question before any send/queue work', () => {
    const src = fileText('EmailComposer.tsx');
    const confirmIdx = src.indexOf(GMAIL_COPY);
    expect(confirmIdx).toBeGreaterThan(-1);
    // handleSend's real work (body build + queueSend) must come after the
    // confirm — the undo countdown is never promised for an unconfirmed send.
    const afterConfirm = src.slice(confirmIdx);
    expect(afterConfirm).toContain('buildOutgoingBodies');
  });

  it('DockedComposer asks the Gmail question before queueSend', () => {
    const src = fileText('DockedComposer.tsx');
    const confirmIdx = src.indexOf(GMAIL_COPY);
    expect(confirmIdx).toBeGreaterThan(-1);
    // The confirm replaces the old hard-block guard: the queueSend call that
    // starts the 10s recall window must come after it.
    const queueIdx = src.indexOf('queueSend({');
    expect(queueIdx).toBeGreaterThan(confirmIdx);
  });

  it('neither composer keeps the old hard-block body copy', () => {
    const email = fileText('EmailComposer.tsx');
    const docked = fileText('DockedComposer.tsx');
    expect(email).not.toContain('Please enter your message body');
    expect(docked).not.toContain('Please write your message body');
  });
});
