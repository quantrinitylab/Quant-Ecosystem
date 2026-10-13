// @vitest-environment jsdom
// ============================================================================
// Compose: leaving keeps the draft; only an explicit discard deletes it.
//
// Before this fix, Back (←) and Close (×) asked "Discard draft?" and, on the
// /compose page, confirming called the page's discard handler — which DELETED
// the server draft, including one autosave had already stored. The page also
// wired its left-edge swipe to that same handler with no prompt at all, so a
// stray swipe from the screen edge silently destroyed the message.
//
// Contract pinned here, against the REAL composer, the REAL autosave hook and
// the REAL edge-swipe hook (only network/chrome dependencies are mocked):
//   • Back / Close / edge swipe → save the draft, toast "Draft saved", leave.
//     Never call onDiscard.
//   • Untouched since open → leave quietly (no save, no prompt, no junk draft).
//   • Content that cannot be a draft yet (no recipient/subject) → say exactly
//     what is missing and let the person choose; nothing is lost silently.
//   • Save failure → "Couldn't save draft" with Leave without saving / Keep
//     editing; never a false "Draft saved".
//   • Trash / "Discard message" → confirm → onDiscard (the delete) — the one
//     explicit way to delete.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement matchMedia; framer-motion probes it. Environment
// shim only — no behaviour mocked.
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
  })) as typeof window.matchMedia;
}

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() },
  confirm: vi.fn<(opts: { title: string; message: string; confirmLabel: string }) => Promise<boolean>>(),
  showToast: vi.fn(),
  deleteEmail: vi.fn(async () => ({ success: true })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  usePathname: () => '/compose',
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@quant/shared-ui', () => ({ nextRovingIndex: () => 0, rovingTabIndex: () => 0 }));
vi.mock('../Quanty', () => ({ Quanty: () => null }));
vi.mock('../../lib/quanty/reactions', () => ({
  quantyReact: vi.fn(),
  useQuantyMood: () => 'neutral',
}));
vi.mock('../InboxToast', () => ({ showToast: mocks.showToast }));
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
vi.mock('../RecipientChipInput', () => ({
  RecipientChipInput: () => null,
  parseEmailString: (s: string) =>
    String(s)
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((email) => ({ email })),
  dedupeRecipientPayload: <T,>(list: T) => list,
}));
vi.mock('../ContactAutocomplete', () => ({ ContactAutocomplete: () => null }));
vi.mock('../../hooks/useContactSuggestions', () => ({
  useContactSuggestions: () => ({ contacts: [] }),
}));
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: mocks.confirm, dialog: null }),
}));
vi.mock('../UndoSendCountdownBar', () => ({ useUndoSend: () => ({ queueSend: vi.fn() }) }));
vi.mock('../../services/api-client', () => ({
  apiClient: { deleteEmail: mocks.deleteEmail, composeEmail: vi.fn(), updateDraft: vi.fn() },
}));
vi.mock('@quant/api-client', () => ({ apiFetchRaw: vi.fn() }));
vi.mock('../EmailTemplates', () => ({ EmailTemplates: () => null }));
vi.mock('../InsertLinkModal', () => ({ InsertLinkModal: () => null }));

import { EmailComposer, getDraftUnsavableReason } from '../EmailComposer';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  vi.clearAllMocks();
});

async function mount(props: React.ComponentProps<typeof EmailComposer>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<EmailComposer {...props} />);
  });
}

function q<T extends Element>(selector: string): T {
  const el = host!.querySelector<T>(selector);
  if (!el) throw new Error(`not rendered: ${selector}`);
  return el;
}

async function type(selector: string, value: string) {
  const el = q<HTMLTextAreaElement | HTMLInputElement>(selector);
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(selector: string) {
  const el = q<HTMLElement>(selector);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // Let the async handler (save → toast → navigate) run to completion.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function edgeSwipe() {
  const fire = (type: string, x: number, y: number) => {
    const ev = new Event(type);
    Object.defineProperty(ev, 'touches', {
      value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
    });
    window.dispatchEvent(ev);
  };
  await act(async () => {
    fire('touchstart', 6, 300);
    fire('touchmove', 140, 304);
    fire('touchend', 140, 304);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const BACK = 'button[title="Back (1 page)"]';
const CLOSE = 'button[aria-label="Close composer"]';
const TRASH = 'button[aria-label="Discard draft"]';
const BODY = 'textarea#composer-body';
const left = () => mocks.router.back.mock.calls.length + mocks.router.push.mock.calls.length;

describe('getDraftUnsavableReason — mirrors the backend compose contract', () => {
  it('names exactly what is missing', () => {
    expect(getDraftUnsavableReason('', '')).toBe('a recipient and a subject');
    expect(getDraftUnsavableReason('a@b.com', '  ')).toBe('a subject');
    expect(getDraftUnsavableReason(' , ', 'Hi')).toBe('a recipient');
    expect(getDraftUnsavableReason('a@b.com', 'Hi')).toBeNull();
  });

  it('exempts chat threads from the subject rule (the page fills "Chat with …")', () => {
    expect(getDraftUnsavableReason('a@b.com', '', 'chat')).toBeNull();
    expect(getDraftUnsavableReason('', '', 'chat')).toBe('a recipient');
  });
});

describe('EmailComposer — leaving keeps the draft', () => {
  for (const [label, selector] of [
    ['Back (←)', BACK],
    ['Close (×)', CLOSE],
  ] as const) {
    it(`${label} saves the draft, says so, and leaves — never discards`, async () => {
      const onSaveDraft = vi.fn(async () => {});
      const onDiscard = vi.fn();
      await mount({ initialTo: 'priya@quantmail.in', initialSubject: 'Plan', onSaveDraft, onDiscard });
      await type(BODY, 'Draft body that must survive');

      await click(selector);

      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(onSaveDraft.mock.calls[0][0]).toMatchObject({ subject: 'Plan' });
      expect(mocks.showToast).toHaveBeenCalledWith({ text: 'Draft saved', type: 'success' });
      expect(left()).toBe(1);
      expect(onDiscard).not.toHaveBeenCalled();
      expect(mocks.confirm).not.toHaveBeenCalled();
    });
  }

  it('the left-edge swipe is Back: saves and leaves, never deletes', async () => {
    const onSaveDraft = vi.fn(async () => {});
    const onDiscard = vi.fn();
    await mount({ initialTo: 'priya@quantmail.in', initialSubject: 'Plan', onSaveDraft, onDiscard });
    await type(BODY, 'Typed on the phone');

    await edgeSwipe();

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(left()).toBe(1);
  });

  it('a modal composer does not own the screen edge', async () => {
    const onSaveDraft = vi.fn(async () => {});
    await mount({
      initialTo: 'priya@quantmail.in',
      initialSubject: 'Plan',
      onSaveDraft,
      modal: true,
      onClose: vi.fn(),
    });
    await type(BODY, 'In a popover');

    await edgeSwipe();

    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it('untouched since open: leaves quietly — no save, no prompt, no junk draft', async () => {
    const onSaveDraft = vi.fn(async () => {});
    const onDiscard = vi.fn();
    await mount({
      initialTo: 'priya@quantmail.in',
      initialSubject: 'Re: Plan',
      initialBody: 'Resumed draft body',
      onSaveDraft,
      onDiscard,
    });

    await click(BACK);

    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(left()).toBe(1);
  });

  it('cannot be a draft yet: names what is missing, skips the doomed save, keeps editing on cancel', async () => {
    const onSaveDraft = vi.fn(async () => {});
    mocks.confirm.mockResolvedValueOnce(false);
    await mount({ onSaveDraft, onDiscard: vi.fn() });
    await type(BODY, 'Only a body so far');

    await click(BACK);

    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    const opts = mocks.confirm.mock.calls[0][0];
    expect(opts.title).toBe('Discard this message?');
    expect(opts.message).toContain('a recipient and a subject');
    expect(left()).toBe(0);
    expect(q<HTMLTextAreaElement>(BODY).value).toBe('Only a body so far');
  });

  it('save failure: never a false "Draft saved"; the person decides', async () => {
    const onSaveDraft = vi.fn(async () => {
      throw new Error('offline');
    });
    const onDiscard = vi.fn();
    mocks.confirm.mockResolvedValueOnce(true);
    await mount({ initialTo: 'priya@quantmail.in', initialSubject: 'Plan', onSaveDraft, onDiscard });
    await type(BODY, 'Written on a train');

    await click(CLOSE);

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(mocks.showToast).not.toHaveBeenCalledWith({ text: 'Draft saved', type: 'success' });
    const opts = mocks.confirm.mock.calls[0][0];
    expect(opts.title).toBe("Couldn't save draft");
    expect(opts.confirmLabel).toBe('Leave without saving');
    expect(left()).toBe(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });
});

describe('EmailComposer — discarding is explicit', () => {
  it('trash asks first, then hands the delete to the host', async () => {
    const onSaveDraft = vi.fn(async () => {});
    const onDiscard = vi.fn();
    mocks.confirm.mockResolvedValueOnce(true);
    await mount({ initialTo: 'priya@quantmail.in', initialSubject: 'Plan', onSaveDraft, onDiscard });
    await type(BODY, 'Changed my mind');

    await click(TRASH);

    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirm.mock.calls[0][0].title).toBe('Discard draft?');
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it('trash cancelled: nothing deleted, content intact', async () => {
    const onDiscard = vi.fn();
    mocks.confirm.mockResolvedValueOnce(false);
    await mount({ initialTo: 'priya@quantmail.in', initialSubject: 'Plan', onDiscard });
    await type(BODY, 'Keep me');

    await click(TRASH);

    expect(onDiscard).not.toHaveBeenCalled();
    expect(left()).toBe(0);
    expect(q<HTMLTextAreaElement>(BODY).value).toBe('Keep me');
  });
});
