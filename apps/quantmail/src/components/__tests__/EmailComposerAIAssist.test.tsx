/**
 * Dead onAIAssist prop — the /compose page passed handleAIAssist (real POST
 * /ai/compose) but EmailComposer never destructured the prop and never called
 * it, so the full-page composer shipped with no AI-assist entry point at all
 * (the only AI surface was the Quanty copilot drawer).
 *
 * The fix wires an "AI writing assist" toolbar button + dropup
 * (Improve writing / Shorten / Make formal) into EmailComposer, calling the
 * host's onAIAssist prop. These tests pin the wiring:
 *  (a) the trigger button renders when onAIAssist is provided, and is absent
 *      when it is not (docked/thread hosts pass nothing and stay untouched);
 *  (b) the selection-splice core replaces a selection or the whole body;
 *  (c) source pins so the prop can never silently go dead again.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmailComposer, spliceAssistResult } from '../EmailComposer';

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
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn(), dialog: null }),
}));
vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));
vi.mock('../../services/api-client', () => ({ apiClient: {} }));
vi.mock('@quant/api-client', () => ({ apiFetchRaw: vi.fn() }));

const AI_ASSIST_BUTTON = 'aria-label="AI writing assist"';

describe('AI-assist toolbar entry point', () => {
  it('renders the AI-assist button when the host provides onAIAssist', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        onClose={() => {}}
        onAIAssist={async (_action, text) => text}
      />,
    );
    expect(html).toContain(AI_ASSIST_BUTTON);
  });

  it('renders NO AI-assist button when the host passes no onAIAssist', () => {
    const html = renderToStaticMarkup(<EmailComposer onClose={() => {}} />);
    expect(html).not.toContain(AI_ASSIST_BUTTON);
  });
});

describe('spliceAssistResult', () => {
  it('replaces a middle selection, keeping the text around it', () => {
    expect(
      spliceAssistResult('Hello world today', 'WORLD', { start: 6, end: 11 }),
    ).toBe('Hello WORLD today');
  });

  it('replaces the whole body when there is no selection', () => {
    expect(spliceAssistResult('Hello world', 'New body', null)).toBe('New body');
  });

  it('replaces the whole body when the selection is empty', () => {
    expect(
      spliceAssistResult('Hello world', 'New body', { start: 3, end: 3 }),
    ).toBe('New body');
  });

  it('handles a selection at the very start and end', () => {
    expect(spliceAssistResult('abcdef', 'XY', { start: 0, end: 2 })).toBe('XYcdef');
    expect(spliceAssistResult('abcdef', 'XY', { start: 4, end: 6 })).toBe('abcdXY');
  });
});

describe('AI-assist wiring source pins (the prop must never go dead again)', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'EmailComposer.tsx'),
    'utf8',
  );

  it('EmailComposer destructures onAIAssist into the component body', () => {
    // The prop interface declares it AND the function signature pulls it in —
    // the original bug was a declaration with no destructure.
    expect(src).toMatch(/export function EmailComposer\(\{[\s\S]*?\n  onAIAssist,/);
  });

  it('there is a real call site: the handler awaits onAIAssist(action, sourceText)', () => {
    expect(src).toContain('await onAIAssist(action, sourceText)');
  });

  it('the toolbar trigger is gated on the prop (other hosts stay untouched)', () => {
    expect(src).toContain('{onAIAssist && (');
  });
});
