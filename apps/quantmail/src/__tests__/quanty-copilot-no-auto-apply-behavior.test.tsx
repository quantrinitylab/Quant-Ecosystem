// @vitest-environment jsdom
// ===========================================================================
// Quanty Copilot draft-overwrite P1 (qm-auto finding, 2026-10-22) —
// BEHAVIOURAL proof, companion to QuantyCopilotNoAutoApply.test.ts (which
// pins the pure merge/parser functions and the runTurn source shape).
//
// Those pins cannot catch a regression that re-wires runTurn to a DIFFERENT
// apply call, or a drawer that applies through some other callback. So these
// tests render the REAL drawer in compose context (isComposeContext, with an
// onApplyAction spy standing in for the composer's setBody path) and drive
// REAL turns through the mocked backend:
//
//   (a) a weather-style turn completes, and onApplyAction is NEVER called,
//       and no toast fires at all — the draft is byte-identical because
//       nothing ever reached the composer, dirty or not;
//   (b) a second, draft-shaped turn in the same session still applies
//       nothing on its own (multi-turn);
//   (c) the explicit per-message "Apply to Composer" tap IS the one path
//       that calls onApplyAction, with the shared parser's action, and
//       toasts success exactly once;
//   (d) Apply on a blank assistant message is a no-op: no apply call, no
//       drawer close, no success toast — only an honest info toast;
//   (e) a throwing Apply surfaces an error toast, never a success toast,
//       and leaves the drawer open.
//
// (a) and (b) fail against the pre-fix drawer: its runTurn called
// onApplyAction(parseEmailActionFromText(...)) on every compose-context
// turn, so the spy would have been called with the weather answer itself.
// Harness (createRoot + act, hoisted mocks, shims) mirrors
// quanty-drawer-ephemeral-history.test.tsx.
// ===========================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuantyCopilotDrawer } from '../components/QuantyCopilotDrawer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

const WEATHER_ANSWER = 'Sunny, 28°C in Mumbai today.';
const DRAFT_SHAPED_ANSWER = 'Subject: Q3 report\nHi Ana,\nHere is the Q3 report.\nThanks.';

const authenticatedFetchMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const quantyReactMock = vi.hoisted(() => vi.fn());
const queueSendMock = vi.hoisted(() => vi.fn());
const undoSendValue = vi.hoisted(() => ({ queueSend: queueSendMock }));
const i18nValue = vi.hoisted(() => ({ locale: 'en' as const }));
const composeEmailMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const applyMock = vi.hoisted(() => vi.fn());
const closeMock = vi.hoisted(() => vi.fn());

vi.mock('../services/browser-auth-session', () => ({
  browserAuthSession: { authenticatedFetch: authenticatedFetchMock },
}));
vi.mock('../lib/ai-intent-preference', () => ({
  readAIIntent: () => 'balanced',
  clientTimeoutForIntent: () => 60000,
}));
vi.mock('../services/api-client', () => ({
  apiClient: { composeEmail: composeEmailMock, sendEmail: sendEmailMock },
}));
vi.mock('../components/InboxToast', () => ({ showToast: toastMock }));
vi.mock('../components/UndoSendCountdownBar', () => ({
  useUndoSend: () => undoSendValue,
}));
vi.mock('../lib/quanty/reactions', () => ({
  quantyReact: quantyReactMock,
  useQuantyMood: () => 'idle',
}));
vi.mock('../i18n', () => ({ useI18n: () => i18nValue }));
vi.mock('../components/Quanty', () => ({ Quanty: () => null }));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function queueReplies(replies: string[]) {
  const queue = [...replies];
  authenticatedFetchMock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: { message: queue.shift() ?? '' },
    }),
  }));
}

function renderDrawer(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <QuantyCopilotDrawer
        isOpen
        isComposeContext
        onClose={closeMock}
        onApplyAction={applyMock}
      />,
    );
  });
  return host;
}

function unmountDrawer() {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
}

afterEach(() => {
  unmountDrawer();
  window.localStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
});

async function flushTurns() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function setPrompt(container: ParentNode, value: string) {
  const input = container.querySelector<HTMLInputElement>(
    'input[placeholder="Enter a prompt here"]',
  );
  expect(input, 'prompt input renders').not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(input!, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function sendPrompt(container: ParentNode, value: string) {
  setPrompt(container, value);
  const form = container.querySelector('form');
  expect(form, 'prompt form renders').not.toBeNull();
  act(() => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flushTurns();
}

function applyButtons(container: ParentNode): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter(
    (b) => b.textContent?.trim() === 'Apply to Composer',
  ) as HTMLButtonElement[];
}

describe('Quanty Copilot: no auto-apply on any assistant turn', () => {
  it('(a) a weather-style turn applies nothing and toasts nothing about the draft', async () => {
    queueReplies([WEATHER_ANSWER]);
    const container = renderDrawer();

    await sendPrompt(container, 'what is the weather?');
    expect(container.textContent).toContain(WEATHER_ANSWER);

    // The turn completed, in compose context — and still nothing reached
    // the composer: had runTurn auto-applied, the spy would hold the
    // weather answer as a would-be draft body.
    expect(applyMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('(b) a draft-shaped second turn still applies nothing on its own (multi-turn)', async () => {
    queueReplies([WEATHER_ANSWER, DRAFT_SHAPED_ANSWER]);
    const container = renderDrawer();

    await sendPrompt(container, 'what is the weather?');
    await sendPrompt(container, 'draft an email to Ana about Q3');
    expect(container.textContent).toContain(WEATHER_ANSWER);
    expect(container.textContent).toContain('Here is the Q3 report.');

    // Even a perfectly draft-shaped answer must wait for an explicit tap.
    expect(applyMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('(c) the explicit Apply tap is the single path into the composer', async () => {
    queueReplies([WEATHER_ANSWER]);
    const container = renderDrawer();

    await sendPrompt(container, 'what is the weather?');
    expect(applyMock).not.toHaveBeenCalled();

    const buttons = applyButtons(container);
    expect(buttons).toHaveLength(1);
    act(() => {
      buttons[0].click();
    });

    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: WEATHER_ANSWER }),
    );
    const action = applyMock.mock.calls[0][0];
    expect(action.to).toBeUndefined();
    expect(action.subject).toBeUndefined();
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Applied draft into composer', type: 'success' }),
    );
  });

  it('(d) Apply on a blank assistant message is a no-op with no update toast', async () => {
    queueReplies(['']);
    const container = renderDrawer();

    await sendPrompt(container, 'say nothing');
    expect(applyMock).not.toHaveBeenCalled();

    const buttons = applyButtons(container);
    expect(buttons).toHaveLength(1);
    act(() => {
      buttons[0].click();
    });

    expect(applyMock).not.toHaveBeenCalled();
    expect(closeMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Nothing to apply from this message', type: 'info' }),
    );
  });

  it('(e) a failed Apply toasts an error, never success, and keeps the drawer open', async () => {
    queueReplies([WEATHER_ANSWER]);
    applyMock.mockImplementationOnce(() => {
      throw new Error('composer unavailable');
    });
    const container = renderDrawer();

    await sendPrompt(container, 'what is the weather?');
    const buttons = applyButtons(container);
    expect(buttons).toHaveLength(1);
    act(() => {
      buttons[0].click();
    });

    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(closeMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Could not apply this message to the composer',
        type: 'error',
      }),
    );
  });
});
