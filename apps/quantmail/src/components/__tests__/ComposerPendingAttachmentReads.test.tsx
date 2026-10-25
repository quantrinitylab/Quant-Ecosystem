/**
 * 2026-10-22 P1 — Send fired while attachment FileReader reads were pending.
 *
 * Root cause: both composers tracked in-flight reads in a closure-local
 * `pending` counter inside the file input's onChange, so Send never knew a
 * read was running. `handleSend` snapshotted `attachments` without the
 * still-reading file and sent without it, with zero warning.
 *
 * The fix: a `pendingAttachmentNames` STATE in both composers. Send (and
 * schedule-send) is disabled while it is non-empty, the UI shows an
 * "Attaching…" indicator naming the files, and `handleSend` refuses as
 * belt-and-braces for the Cmd/Ctrl+Enter path, which bypasses the button's
 * disabled state. The interaction itself cannot run under this suite's
 * node environment (no DOM / FileReader), so — following the sibling
 * EmailComposerComposeP1s suite — the wiring is pinned by source
 * assertions, and the one pure piece (drop-one-name) is unit-tested
 * directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dropOnePendingAttachmentName } from '../EmailComposer';

// ---- module mocks for importing EmailComposer (same harness as the
// sibling EmailComposer suites) — only the pure helper is exercised. ----

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
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

const emailSource = readFileSync(
  fileURLToPath(new URL('../EmailComposer.tsx', import.meta.url)),
  'utf8',
);
const dockedSource = readFileSync(
  fileURLToPath(new URL('../DockedComposer.tsx', import.meta.url)),
  'utf8',
);

// ---- the pure helper: drop exactly one occurrence ----

describe('dropOnePendingAttachmentName', () => {
  it('removes one occurrence and keeps the rest in order', () => {
    expect(dropOnePendingAttachmentName(['a.pdf', 'b.pdf', 'c.pdf'], 'b.pdf')).toEqual([
      'a.pdf',
      'c.pdf',
    ]);
  });

  it('removes only the FIRST occurrence when a name was picked twice', () => {
    // Two `report.pdf` picks = two reads. Settling one must leave the
    // other pending, or Send would re-enable while a read is still running.
    expect(dropOnePendingAttachmentName(['report.pdf', 'report.pdf'], 'report.pdf')).toEqual([
      'report.pdf',
    ]);
  });

  it('is a no-op for a name that is not pending (never a negative count)', () => {
    const names = ['a.pdf'];
    expect(dropOnePendingAttachmentName(names, 'gone.pdf')).toBe(names);
  });

  it('handles an empty list', () => {
    expect(dropOnePendingAttachmentName([], 'a.pdf')).toEqual([]);
  });
});

// ---- EmailComposer wiring ----

describe('EmailComposer send guard (2026-10-22 P1)', () => {
  it('tracks pending reads in React state, not a closure-local counter', () => {
    expect(emailSource).toContain(
      'const [pendingAttachmentNames, setPendingAttachmentNames] = useState<string[]>([]);',
    );
    expect(emailSource).toContain(
      'const pendingAttachmentReads = pendingAttachmentNames.length;',
    );
    // Every reader settle removes its own file by name.
    expect(emailSource).toContain('settle(file.name)');
    expect(emailSource).not.toMatch(/^\s*settle\(\);$/m);
  });

  it('disables Send while reads are pending', () => {
    expect(emailSource).toContain(
      'const busy = isSending || isSaving || pendingAttachmentReads > 0;',
    );
  });

  it('refuses inside handleSend before any snapshot (keyboard-path guard)', () => {
    const guardAt = emailSource.indexOf('if (pendingAttachmentReads > 0) {');
    expect(guardAt).toBeGreaterThan(-1);
    expect(emailSource.slice(guardAt, guardAt + 400)).toContain('Still attaching');
    // The guard sits before the send-block check, so a pending read is
    // never masked by (or mistaken for) a recipient/subject block.
    expect(guardAt).toBeLessThan(emailSource.indexOf('if (sendBlockReason) {'));
  });

  it('labels the Send button and shows which files are still attaching', () => {
    expect(emailSource).toContain("pendingAttachmentReads > 0 ? (");
    expect(emailSource).toContain('<span>Attaching…</span>');
    expect(emailSource).toContain('Attaching {pendingAttachmentReads} file(s)…');
  });
});

// ---- DockedComposer wiring ----

describe('DockedComposer send guard (2026-10-22 P1)', () => {
  it('tracks pending reads in React state, not a closure-local counter', () => {
    expect(dockedSource).toContain(
      'const [pendingAttachmentNames, setPendingAttachmentNames] = useState<string[]>([]);',
    );
    expect(dockedSource).toContain('settle(file.name)');
    expect(dockedSource).not.toMatch(/^\s*settle\(\);$/m);
  });

  it('disables Send AND schedule-send while reads are pending', () => {
    expect(dockedSource).toContain(
      'disabled={isSending || invalidRecipientReason !== null || pendingAttachmentReads > 0}',
    );
  });

  it('refuses inside handleSend before the recipient checks (keyboard-path guard)', () => {
    const guardAt = dockedSource.indexOf('if (pendingAttachmentReads > 0) {');
    expect(guardAt).toBeGreaterThan(-1);
    expect(dockedSource.slice(guardAt, guardAt + 400)).toContain('Still attaching');
    expect(guardAt).toBeLessThan(dockedSource.indexOf('if (toRecipients.length === 0) {'));
  });

  it('no longer claims "Attached" the moment reads START', () => {
    expect(dockedSource).not.toContain('text: `Attached ${accepted.length}');
    expect(dockedSource).toContain('text: `Attaching ${accepted.length}');
  });

  it('labels the Send button and shows which files are still attaching', () => {
    expect(dockedSource).toContain("pendingAttachmentReads > 0 ? 'Attaching…' : 'Send (⌘↵)'");
    expect(dockedSource).toContain('Attaching {pendingAttachmentReads} file(s)…');
  });
});
