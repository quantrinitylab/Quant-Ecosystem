/**
 * Compose email-format validation — the finding:
 * `notanemail`, `foo bar`, `@` used to become chips and pass client
 * validation; the failure only surfaced as a server round-trip error toast.
 *
 * Contract under test:
 * - `isValidEmail` / `getInvalidRecipientReason` (lib/email-validation.ts)
 *   are the single source of truth.
 * - `getSendBlockReason` blocks a malformed recipient with a NAMED reason,
 *   ordered right after the empty-To block (QM-UIUX-024 single source of
 *   truth — the Send button's disabled state mirrors this exactly).
 * - `getSendBlockReaction` maps a malformed recipient to `mail:noRecipients`.
 * - The rendered Send button is disabled (with the reason as its title)
 *   when a chip holds a malformed address.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidEmail, getInvalidRecipientReason } from '../../lib/email-validation';
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
  loadEmailSignatures: async () => [],
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

// ---- isValidEmail: the finding's exact examples ----

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    for (const email of [
      'kundan@quantmail.in',
      'a@b.com',
      'first.last+tag@sub.domain.co',
      'user_name@domain.io',
    ]) {
      expect(isValidEmail(email)).toBe(true);
    }
  });

  it('rejects the finding\'s examples: notanemail, "foo bar", "@"', () => {
    for (const email of ['notanemail', 'foo bar', '@']) {
      expect(isValidEmail(email)).toBe(false);
    }
  });

  it('rejects other malformed shapes', () => {
    for (const email of [
      '',
      '   ',
      'a@b',
      '@b.com',
      'a@.com',
      'a b@c.com',
      'a@b c.com',
      'plain@',
    ]) {
      expect(isValidEmail(email)).toBe(false);
    }
  });

  it('ignores surrounding whitespace', () => {
    expect(isValidEmail('  kundan@quantmail.in  ')).toBe(true);
  });
});

// ---- getInvalidRecipientReason ----

describe('getInvalidRecipientReason', () => {
  it('returns null when every address is valid or the list is empty', () => {
    expect(getInvalidRecipientReason([])).toBeNull();
    expect(
      getInvalidRecipientReason([{ email: 'a@b.com' }, { email: 'kundan@quantmail.in' }]),
    ).toBeNull();
  });

  it('names the FIRST malformed address with a clear reason', () => {
    expect(getInvalidRecipientReason([{ email: 'notanemail' }])).toBe(
      '"notanemail" is not a valid email address',
    );
    expect(
      getInvalidRecipientReason([{ email: 'a@b.com' }, { email: 'foo bar' }]),
    ).toBe('"foo bar" is not a valid email address');
  });

  it('skips empty entries — emptiness is the empty-To block\'s job', () => {
    expect(getInvalidRecipientReason([{ email: '' }, { email: '   ' }])).toBeNull();
  });
});

// ---- getSendBlockReason: malformed-recipient block ordering ----

describe('getSendBlockReason (malformed recipient block)', () => {
  it('still blocks an empty To first, even with malformed recipients', () => {
    expect(getSendBlockReason('', 's', 'b', [{ email: 'notanemail' }])).toBe(
      'Please specify at least one recipient (To:)',
    );
  });

  it('blocks a malformed recipient before subject and body', () => {
    expect(getSendBlockReason('notanemail', '', '', [{ email: 'notanemail' }])).toBe(
      '"notanemail" is not a valid email address',
    );
  });

  it('names the malformed chip among valid ones', () => {
    expect(
      getSendBlockReason('a@b.com, foo bar', 's', 'b', [
        { email: 'a@b.com' },
        { email: 'foo bar' },
      ]),
    ).toBe('"foo bar" is not a valid email address');
  });

  it('returns null when all recipients are valid', () => {
    expect(
      getSendBlockReason('a@b.com', 'Hello', 'World', [{ email: 'a@b.com' }]),
    ).toBeNull();
  });

  it('keeps 3-arg calls working (recipients default to [])', () => {
    expect(getSendBlockReason('a@b.com', 'Hello', 'World')).toBeNull();
    expect(getSendBlockReason('', '', '')).toBe('Please specify at least one recipient (To:)');
  });
});

// ---- getSendBlockReaction: malformed recipient is a recipient problem ----

describe('getSendBlockReaction (malformed recipient)', () => {
  it('maps a malformed recipient to mail:noRecipients', () => {
    expect(getSendBlockReaction('notanemail', 's', 'b', [{ email: 'notanemail' }])).toBe(
      'mail:noRecipients',
    );
  });

  it('returns null exactly when getSendBlockReason does', () => {
    expect(getSendBlockReaction('a@b.com', 's', 'b', [{ email: 'a@b.com' }])).toBeNull();
    expect(getSendBlockReason('a@b.com', 's', 'b', [{ email: 'a@b.com' }])).toBeNull();
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

function sendTitle(html: string): string | null {
  const tag = sendButtonTag(html);
  expect(tag).not.toBeNull();
  const m = tag!.match(/title="([^"]*)"/);
  return m ? m[1] : null;
}

describe('Send button blocks malformed recipient chips', () => {
  it('is disabled with the named reason when a To chip is malformed', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        isOpen={true}
        onClose={() => {}}
        initialTo={[{ email: 'notanemail' }]}
        initialSubject="Hello"
        initialBody="World"
      />,
    );
    expect(isSendDisabled(html)).toBe(true);
    // The address is HTML-escaped in the title attribute; assert the parts.
    expect(sendTitle(html)).toContain('notanemail');
    expect(sendTitle(html)).toContain('is not a valid email address');
  });

  it('is disabled when one chip in a mixed To list is malformed', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        isOpen={true}
        onClose={() => {}}
        initialTo={[{ email: 'a@b.com' }, { email: '@' }]}
        initialSubject="Hello"
        initialBody="World"
      />,
    );
    expect(isSendDisabled(html)).toBe(true);
    // Quotes are HTML-escaped in the title attribute.
    expect(sendTitle(html)).toBe('&quot;@&quot; is not a valid email address');
  });

  it('stays enabled when every chip is well-formed', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        isOpen={true}
        onClose={() => {}}
        initialTo={[{ email: 'kundan@quantmail.in' }, { email: 'a@b.com' }]}
        initialSubject="Hello"
        initialBody="World"
      />,
    );
    expect(isSendDisabled(html)).toBe(false);
  });
});
