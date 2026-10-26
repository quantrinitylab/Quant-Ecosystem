/**
 * QM compose placeholder honesty — the body placeholder must promise only
 * capabilities that actually exist on the compose path.
 *
 * Regression: the full-page composer's body placeholder read "Type freely,
 * drag and drop files, or ask Quanty AI Copilot." while no drag-and-drop
 * was wired anywhere on the compose path (no onDragOver/onDrop/dataTransfer
 * in EmailComposer.tsx, DockedComposer.tsx, or the /compose page —
 * attachments only arrived via the file-picker button). Dropping files
 * into the composer did nothing, so the copy advertised a fake capability.
 *
 * Fix: the placeholder now promises only real capabilities — "Type freely,
 * attach files, or ask Quanty AI Copilot." Attachments are real (the
 * file-picker button + 25MB guard), typing is real, and the Quanty AI
 * Copilot entry point is real. If real drag-and-drop is ever wired (see
 * the sibling drag-and-drop work), this test's "no drag and drop" pin
 * must be revisited together with the placeholder copy — the two must
 * never drift apart again.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmailComposer } from '../EmailComposer';

// ---- module mocks for server-side renders (same harness as the other composer tests) ----
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@quant/shared-ui', () => ({
  nextRovingIndex: () => 0,
  rovingTabIndex: () => 0,
}));
vi.mock('../Quanty', () => ({ Quanty: () => null }));
vi.mock('../../lib/quanty/reactions', () => ({
  quantyReact: vi.fn(),
  useQuantyMood: () => 'neutral',
}));
vi.mock('../InboxToast', () => ({ showToast: vi.fn() }));
vi.mock('../../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
  htmlToPlainText: (html: string) => html,
}));
vi.mock('../../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));
vi.mock('../../lib/safe-html', () => ({ useSafeEmailHtml: (html: string) => html }));
vi.mock('../../providers/auth-provider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../hooks/useDeferredMount', () => ({ useDeferredMount: () => false }));
vi.mock('../useDraftAutosave', () => ({
  useDraftAutosave: () => ({}),
  draftSaveStateLabel: () => '',
}));
vi.mock('../RecipientChipInput', () => ({
  RecipientChipInput: () => null,
  parseEmailString: (s: string) =>
    String(s).split(/[,;\s]+/).filter(Boolean).map((email) => ({ email })),
}));
vi.mock('../../hooks/useContacts', () => ({ useContacts: () => ({ data: [] }) }));
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => ({ confirm: vi.fn(), dialog: null }) }));
vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));
vi.mock('../../services/api-client', () => ({ apiClient: {} }));
vi.mock('@quant/api-client', () => ({ apiFetchRaw: vi.fn() }));

const COMPONENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(COMPONENTS_DIR, 'EmailComposer.tsx'), 'utf8');

describe('composer body placeholder promises only real capabilities', () => {
  it('source: no "drag and drop" promise remains in EmailComposer.tsx', () => {
    expect(source.toLowerCase()).not.toContain('drag and drop');
  });

  it('source: body placeholder promises attaching files (a real capability)', () => {
    expect(source).toContain('attach files, or ask Quanty AI Copilot.');
  });

  it('rendered: body textarea placeholder is the honest copy', () => {
    const html = renderToStaticMarkup(<EmailComposer onClose={() => {}} />);
    expect(html.length).toBeGreaterThan(0);
    // The body textarea carries the placeholder into static markup.
    expect(html).toContain('attach files, or ask Quanty AI Copilot.');
    expect(html.toLowerCase()).not.toContain('drag and drop');
  });
});
