/**
 * Cmd/Ctrl+Enter send shortcut on the full-page /compose surface
 * (fix/qm-composer-cmd-enter-send).
 *
 * Finding: DockedComposer sent on (metaKey||ctrlKey)+Enter, but the main
 * EmailComposer had no keyboard send at all — handleBodyKeyDown only handled
 * Tab-prediction. Gmail/Superhuman power-user convention is Cmd/Ctrl+Enter
 * sends from anywhere in the composer.
 *
 * Regression contract:
 *   a. isComposerSendShortcut is true exactly for (meta OR ctrl)+Enter —
 *      plain Enter (newlines) and Tab (quick-completion accept) never qualify.
 *   b. The shortcut handler is attached to the composer SHELL (motion.div),
 *      so it fires from any field (To/Subject/Opening/body) — not just the
 *      body textarea.
 *   c. The shortcut routes through handleSend (every guard on the send path
 *      stays in force: send-block toast, empty-body confirm, Drive permission
 *      check, undo-send recall window, draft autosave) — never a bypass.
 *   d. Tab-prediction is untouched and the shortcut branch exists in exactly
 *      ONE handler (no double-send from textarea keydown bubbling to the shell).
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---- module mocks for importing the composer module (mirrors
// EmailComposerFullPageSend.test.tsx) ----

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

import { isComposerSendShortcut } from '../EmailComposer';

const composerPath = path.resolve(__dirname, '../EmailComposer.tsx');
const source = fs.readFileSync(composerPath, 'utf8');

// Extract one top-level const-arrow-function body by declaration anchor,
// slicing to the first closing `  };` at the same indent. Both handlers are
// short, single-nesting-level arrow bodies, so this is exact.
function extractHandlerBody(declAnchor: string): string {
  const start = source.indexOf(declAnchor);
  expect(start, `source must contain "${declAnchor}"`).toBeGreaterThan(-1);
  const end = source.indexOf('\n  };', start);
  expect(end, `handler starting at "${declAnchor}" must terminate`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('isComposerSendShortcut (Cmd/Ctrl+Enter send predicate)', () => {
  it('is true for Cmd+Enter', () => {
    expect(isComposerSendShortcut('Enter', true, false)).toBe(true);
  });

  it('is true for Ctrl+Enter', () => {
    expect(isComposerSendShortcut('Enter', false, true)).toBe(true);
  });

  it('is true when both modifiers are held (still one send gesture)', () => {
    expect(isComposerSendShortcut('Enter', true, true)).toBe(true);
  });

  it('is false for plain Enter (newlines must never send)', () => {
    expect(isComposerSendShortcut('Enter', false, false)).toBe(false);
  });

  it('is false for Cmd+Tab (quick-completion accept owns Tab)', () => {
    expect(isComposerSendShortcut('Tab', true, false)).toBe(false);
  });

  it('is false for plain Tab', () => {
    expect(isComposerSendShortcut('Tab', false, false)).toBe(false);
  });

  it('is false for other Cmd-modified keys (no shortcut hijacking)', () => {
    for (const key of ['a', 'c', 'v', 'z', 'k', 'Escape', ' ']) {
      expect(isComposerSendShortcut(key, true, false), `Cmd+${key}`).toBe(false);
    }
  });
});

describe('shortcut is wired on the composer shell, through the guarded send path', () => {
  it('attaches the shortcut handler to the composer shell motion.div', () => {
    // The shell is the single keydown attachment point, so Cmd/Ctrl+Enter
    // works from every field (To/Subject/Opening/body) — Gmail parity.
    expect(source).toContain('onKeyDown={handleComposerKeyDown}');
  });

  it('the shortcut handler routes through handleSend, never a bypass', () => {
    const body = extractHandlerBody('const handleComposerKeyDown = (e: React.KeyboardEvent)');
    expect(body).toContain('isComposerSendShortcut(');
    expect(body).toContain('e.preventDefault()');
    expect(body).toContain('handleSend()');
  });

  it('Tab-prediction stays owned by handleBodyKeyDown (no fight, no double-send)', () => {
    const bodyHandler = extractHandlerBody(
      'const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>)',
    );
    // Tab accept is still here...
    expect(bodyHandler).toContain("e.key === 'Tab'");
    expect(bodyHandler).toContain('acceptCompletion()');
    // ...and the send-shortcut branch exists in exactly ONE handler (the
    // shell's). The body keydown bubbles to the shell; a second branch here
    // would double-fire handleSend.
    expect(bodyHandler).not.toContain('isComposerSendShortcut');
    expect(bodyHandler).not.toContain('metaKey');
  });

  it('mirrors DockedComposer: same gesture, same preventDefault, same send target', () => {
    const docked = fs.readFileSync(
      path.resolve(__dirname, '../DockedComposer.tsx'),
      'utf8',
    );
    expect(docked).toContain("(e.metaKey || e.ctrlKey) && e.key === 'Enter'");
    expect(docked).toContain('handleSend()');
    // And the shared predicate encodes exactly that gesture:
    expect(isComposerSendShortcut('Enter', true, false)).toBe(true);
    expect(isComposerSendShortcut('Enter', false, true)).toBe(true);
    expect(isComposerSendShortcut('Enter', false, false)).toBe(false);
  });
});
