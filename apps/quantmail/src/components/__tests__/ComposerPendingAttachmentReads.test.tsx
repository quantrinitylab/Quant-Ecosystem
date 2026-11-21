// @vitest-environment jsdom
/**
 * 2026-10-22 P1 — Send fired while attachment FileReader reads were pending
 * — and its 2026-10-25 corrective (PR #1572 delta): save draft, autosave
 * and close/back snapshotted before those bytes existed.
 *
 * Root cause: both composers tracked in-flight reads in a closure-local
 * counter inside the file input's onChange, so only Send knew — and PR
 * #1572's first version only fixed Send. The corrective contract, applied
 * uniformly through the PendingAttachmentReads controller:
 * - SEND (click, Cmd/Ctrl+Enter, schedule-send): REFUSE while any read is
 *   pending — checked at entry AND re-checked immediately before the
 *   snapshot, because handleSend awaits confirm dialogs first.
 * - SAVE DRAFT / AUTOSAVE / BACK (keep-the-work close): WAIT for pending
 *   reads, then snapshot from a synchronous attachments mirror, so the
 *   saved draft carries the bytes that just landed.
 * - DISCARD / CLOSE-that-deletes: EXPLICIT CONFIRMATION naming the
 *   still-attaching files, so discarding them is a choice, never silent.
 *
 * HOW THESE TESTS RUN (no testing-library, no DOM-library import): the
 * suite renders the REAL composers with react-dom/client + act under
 * vitest's jsdom environment — jsdom resolves from vitest's own peer tree
 * (see the lockfile's vitest jsdom peer), not from quantmail's deps, so
 * this stays green under CI's frozen lockfile. A controllable fake
 * FileReader stands in for the browser reader: tests begin reads, drive
 * load/error/abort outcomes, and assert on the real onSend/onSaveDraft
 * payloads and the real confirm dialogs. Nothing here asserts on source
 * text: every test drives the flow and checks what the user gets.
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { act } from 'react';

// ---- hoisted spies (vi.mock is hoisted above imports) ----

const toastSpy = vi.hoisted(() => vi.fn());
const routerPush = vi.hoisted(() => vi.fn());
const apiClientMock = vi.hoisted(() => ({
  composeEmail: vi.fn(async () => ({ success: true, data: { id: 'draft-1', version: 1 } })),
  updateDraft: vi.fn(async () => ({ success: true, data: { version: 2 } })),
  deleteEmail: vi.fn(async () => ({ success: true })),
}));
const confirmControl = vi.hoisted(() => ({
  calls: [] as any[],
  impl: null as null | ((opts: any) => Promise<boolean>),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

// next/dynamic hosts the schedule-send modal (and the Quanty drawer /
// Drive picker / Drive permission dialog). Only the schedule modal gets a
// rendered stub — it is the one dynamic component whose props carry
// `isOpen` + `onSchedule`; everything else renders null.
vi.mock('next/dynamic', () => ({
  default: () => (props: any) =>
    props?.isOpen && typeof props?.onSchedule === 'function'
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => props.onSchedule('2030-06-01T10:00:00.000Z'),
          },
          'Schedule stub',
        )
      : null,
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
  showToast: toastSpy,
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

// Identity (not deferred): the schedule modal must render the moment it
// opens, or the schedule-send tests would be testing the deferral, not
// the send gate.
vi.mock('../../hooks/useDeferredMount', () => ({
  useDeferredMount: (v: boolean) => v,
}));

vi.mock('../RecipientChipInput', () => ({
  RecipientChipInput: () => null,
  parseEmailString: (s: string) =>
    String(s)
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((email) => ({ email })),
  // Same contract as the real helper for these tests: one payload entry
  // per address, first occurrence wins, order preserved.
  dedupeRecipientPayload: (list: any[]) => {
    const seen = new Set<string>();
    return list.filter((r) => {
      if (seen.has(r.email)) return false;
      seen.add(r.email);
      return true;
    });
  },
}));

vi.mock('../../hooks/useContacts', () => ({
  useContacts: () => ({ data: [] }),
}));

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({
    confirm: (opts: any) => {
      confirmControl.calls.push(opts);
      return confirmControl.impl ? confirmControl.impl(opts) : Promise.resolve(true);
    },
    dialog: null,
  }),
}));

vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));

vi.mock('../../services/api-client', () => ({
  apiClient: apiClientMock,
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { EmailComposer, dropOnePendingAttachmentName } from '../EmailComposer';
import { DockedComposer } from '../DockedComposer';

// ---- controllable fake FileReader ----

class FakeFileReader {
  static instances: FakeFileReader[] = [];
  static throwOnRead = false;
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  file: File | null = null;
  constructor() {
    FakeFileReader.instances.push(this);
  }
  readAsDataURL(file: File) {
    this.file = file;
    if (FakeFileReader.throwOnRead) throw new Error('read failed synchronously');
  }
  resolve() {
    this.result = `data:application/octet-stream;base64,${this.file?.name ?? ''}`;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
  abort() {
    this.onabort?.();
  }
}

// ---- mount + driving helpers ----

const mounted: { root: Root; container: HTMLElement }[] = [];

async function mountComposer(props: any) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.history.pushState({}, '', '/compose');
  await act(async () => {
    root.render(<EmailComposer {...props} />);
  });
  mounted.push({ root, container });
  return container;
}

async function mountDocked(props: any) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<DockedComposer {...props} />);
  });
  mounted.push({ root, container });
  return container;
}

function fileOf(name: string) {
  return new File(['hello'], name, { type: 'application/pdf' });
}

/** Dispatch a file pick on the composer's hidden file input. */
function attachFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  if (!input) throw new Error('file input not found');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  return act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function findSendButton(container: HTMLElement) {
  const btn = [...container.querySelectorAll('button')].find((b) => {
    const t = b.textContent?.trim();
    return t === 'Send' || t === 'Attaching…' || t === 'Sending…' || t === 'Send (⌘↵)';
  });
  if (!btn) throw new Error('Send button not found');
  return btn as HTMLButtonElement;
}

function findButton(container: HTMLElement, selector: string) {
  const btn = container.querySelector(selector) as HTMLButtonElement | null;
  if (!btn) throw new Error(`button ${selector} not found`);
  return btn;
}

/** The send-options dropup is portaled to document.body. */
function findMenuItem(label: string) {
  const btn = [...document.body.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!btn) throw new Error(`menu item "${label}" not found`);
  return btn as HTMLButtonElement;
}

async function openSendMenu(container: HTMLElement) {
  await act(async () => {
    findButton(container, 'button[aria-label="Send options"]').click();
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await act(async () => {});
}

const flush = () => act(async () => {});

beforeEach(() => {
  FakeFileReader.instances = [];
  FakeFileReader.throwOnRead = false;
  vi.stubGlobal('FileReader', FakeFileReader);
  toastSpy.mockClear();
  routerPush.mockClear();
  apiClientMock.composeEmail.mockClear();
  apiClientMock.updateDraft.mockClear();
  apiClientMock.deleteEmail.mockClear();
  confirmControl.calls = [];
  confirmControl.impl = null;
});

afterEach(async () => {
  for (const m of mounted.splice(0)) {
    await act(async () => {
      m.root.unmount();
    });
    m.container.remove();
  }
  vi.unstubAllGlobals();
});

// ---- the pure helper (still shipped, still unit-tested directly) ----

describe('dropOnePendingAttachmentName', () => {
  it('removes one occurrence and keeps the rest in order', () => {
    expect(dropOnePendingAttachmentName(['a.pdf', 'b.pdf', 'c.pdf'], 'b.pdf')).toEqual([
      'a.pdf',
      'c.pdf',
    ]);
  });

  it('removes only the FIRST occurrence when a name was picked twice', () => {
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

// ---- EmailComposer: send paths ----

describe('EmailComposer send gate', () => {
  const baseProps = (over: any = {}) => ({
    initialTo: 'ada@x.com',
    initialSubject: 'Hi',
    initialBody: 'Hello body',
    onSend: vi.fn(async () => {}),
    onSaveDraft: vi.fn(async () => {}),
    ...over,
  });

  it('click Send is disabled while a read is pending, and sends WITH the file once it settles', async () => {
    const onSend = vi.fn(async () => {});
    const container = await mountComposer(baseProps({ onSend }));
    await attachFiles(container, [fileOf('report.pdf')]);
    expect(container.textContent).toContain('Attaching');
    const sendBtn = findSendButton(container);
    expect(sendBtn.disabled).toBe(true);
    expect(sendBtn.textContent?.trim()).toBe('Attaching…');
    // A click on a disabled button fires nothing — the send must not happen.
    await click(sendBtn);
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => {
      FakeFileReader.instances[0].resolve();
    });
    expect(container.textContent).toContain('Attached files');
    expect(findSendButton(container).disabled).toBe(false);
    await click(findSendButton(container));
    expect(onSend).toHaveBeenCalledTimes(1);
    const payload = onSend.mock.calls[0][0];
    expect(payload.attachments.map((a: any) => a.name)).toEqual(['report.pdf']);
    expect(payload.attachments[0].url).toContain('report.pdf');
    expect(routerPush).toHaveBeenCalledWith('/');
  });

  it('Cmd/Ctrl+Enter while a read is pending refuses with a toast and never sends', async () => {
    const onSend = vi.fn(async () => {});
    const container = await mountComposer(baseProps({ onSend }));
    await attachFiles(container, [fileOf('report.pdf')]);
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Still attaching') }),
    );
    // After the read settles, the same shortcut sends with the file.
    await act(async () => {
      FakeFileReader.instances[0].resolve();
    });
    await act(async () => {
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0].attachments.map((a: any) => a.name)).toEqual(['report.pdf']);
  });

  it('a file picked DURING the empty-body confirm await is refused by the pre-snapshot re-check', async () => {
    // The entry guard ran before the confirm await; without the re-check
    // this send would snapshot without the file picked mid-dialog.
    const onSend = vi.fn(async () => {});
    const container = await mountComposer(
      baseProps({ onSend, initialBody: '' }),
    );
    let releaseConfirm!: (v: boolean) => void;
    confirmControl.impl = () =>
      new Promise<boolean>((resolve) => {
        releaseConfirm = resolve;
      });
    await act(async () => {
      findSendButton(container).click();
    });
    expect(confirmControl.calls).toHaveLength(1);
    await attachFiles(container, [fileOf('report.pdf')]);
    await act(async () => {
      releaseConfirm(true);
    });
    await flush();
    expect(onSend).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Still attaching') }),
    );
  });

  it('schedule-send cannot open while pending, refuses if the read starts after the modal opens, and schedules WITH the file once settled', async () => {
    const onSend = vi.fn(async () => {});
    const container = await mountComposer(baseProps({ onSend }));
    // Open the modal first, then start a read behind it: the entry guard
    // must refuse the schedule, not queue a send without the file.
    await openSendMenu(container);
    await click(findMenuItem('Schedule send'));
    const stub = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Schedule stub',
    ) as HTMLButtonElement;
    expect(stub).toBeTruthy();
    await attachFiles(container, [fileOf('report.pdf')]);
    await click(stub);
    expect(onSend).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Still attaching') }),
    );
    // Settle, reopen, schedule: the scheduled payload carries the file.
    await act(async () => {
      FakeFileReader.instances[0].resolve();
    });
    await openSendMenu(container);
    await click(findMenuItem('Schedule send'));
    const stub2 = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Schedule stub',
    ) as HTMLButtonElement;
    await click(stub2);
    expect(onSend).toHaveBeenCalledTimes(1);
    const payload = onSend.mock.calls[0][0];
    expect(payload.scheduledAt).toBe('2030-06-01T10:00:00.000Z');
    expect(payload.attachments.map((a: any) => a.name)).toEqual(['report.pdf']);
  });

  it('the schedule-send menu itself is unreachable while a read is pending', async () => {
    const container = await mountComposer(baseProps());
    await attachFiles(container, [fileOf('report.pdf')]);
    expect(findButton(container, 'button[aria-label="Send options"]').disabled).toBe(true);
  });
});

// ---- EmailComposer: save / autosave / back / discard ----

describe('EmailComposer draft paths', () => {
  const baseProps = (over: any = {}) => ({
    initialTo: 'ada@x.com',
    initialSubject: 'Hi',
    initialBody: 'Hello body',
    onSend: vi.fn(async () => {}),
    onSaveDraft: vi.fn(async () => {}),
    ...over,
  });

  it('Save draft WAITS for a pending read, then saves WITH the file', async () => {
    const onSaveDraft = vi.fn(async () => {});
    const container = await mountComposer(baseProps({ onSaveDraft }));
    // Open the menu FIRST: the toggle is disabled while a read is pending
    // (busy), so opening it after attaching would test nothing.
    await openSendMenu(container);
    await attachFiles(container, [fileOf('report.pdf')]);
    await click(findMenuItem('Save draft'));
    // The save is parked on the read: nothing persisted yet.
    await flush();
    expect(onSaveDraft).not.toHaveBeenCalled();
    await act(async () => {
      FakeFileReader.instances[0].resolve();
    });
    await flush();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0][0].attachments.map((a: any) => a.name)).toEqual([
      'report.pdf',
    ]);
  });

  it('autosave WAITS for a pending read, then saves with every file that landed', async () => {
    const onSaveDraft = vi.fn(async () => {});
    const container = await mountComposer(baseProps({ onSaveDraft }));
    vi.useFakeTimers();
    try {
      await attachFiles(container, [fileOf('a.pdf')]);
      await act(async () => {
        FakeFileReader.instances[0].resolve();
      });
      // Landing a.pdf changed the snapshot, arming the 10s autosave timer.
      await attachFiles(container, [fileOf('b.pdf')]);
      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      await flush();
      // The timer fired but the save is parked on b.pdf's read.
      expect(onSaveDraft).not.toHaveBeenCalled();
      await act(async () => {
        FakeFileReader.instances[1].resolve();
      });
      await flush();
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(onSaveDraft.mock.calls[0][0].attachments.map((a: any) => a.name)).toEqual([
        'a.pdf',
        'b.pdf',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Back WAITS for a pending read, then saves WITH the file before closing', async () => {
    const onSaveDraft = vi.fn(async () => {});
    const onClose = vi.fn();
    const container = await mountComposer(baseProps({ onSaveDraft, onClose }));
    await attachFiles(container, [fileOf('report.pdf')]);
    await click(findButton(container, 'button[title="Back (1 page)"]'));
    await flush();
    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      FakeFileReader.instances[0].resolve();
    });
    await flush();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0][0].attachments.map((a: any) => a.name)).toEqual([
      'report.pdf',
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The save landed BEFORE the close, not after.
    expect(onSaveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0],
    );
  });

  it('Back on a pending-only composer does NOT silently leave (it asks, it does not vanish)', async () => {
    const onClose = vi.fn();
    const container = await mountComposer({
      onSend: vi.fn(async () => {}),
      onSaveDraft: vi.fn(async () => {}),
      onClose,
    });
    await attachFiles(container, [fileOf('report.pdf')]);
    confirmControl.impl = async () => false;
    await click(findButton(container, 'button[title="Back (1 page)"]'));
    // Back is parked on the read wait — nothing has been decided yet.
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(confirmControl.calls.length).toBe(0);
    // The read lands; the flush cannot save (no recipient), so Back must
    // ASK instead of leaving silently the way the old code did (no
    // content, no save, no warning). Declining keeps the composer open.
    await act(async () => {
      FakeFileReader.instances[0].resolve();
    });
    await flush();
    expect(confirmControl.calls.length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Discard names the still-attaching file instead of dropping it silently', async () => {
    const onDiscard = vi.fn();
    const container = await mountComposer({
      onSend: vi.fn(async () => {}),
      onSaveDraft: vi.fn(async () => {}),
      onDiscard,
    });
    await attachFiles(container, [fileOf('report.pdf')]);
    confirmControl.impl = async () => false;
    await click(findButton(container, 'button[aria-label="Discard draft"]'));
    await flush();
    expect(confirmControl.calls.length).toBe(1);
    expect(confirmControl.calls[0].message).toContain('report.pdf');
    expect(onDiscard).not.toHaveBeenCalled();
  });
});

// ---- outcomes + duplicates ----

describe('EmailComposer pending-read outcomes', () => {
  const baseProps = (over: any = {}) => ({
    initialTo: 'ada@x.com',
    initialSubject: 'Hi',
    initialBody: 'Hello body',
    onSend: vi.fn(async () => {}),
    onSaveDraft: vi.fn(async () => {}),
    ...over,
  });

  it('duplicate filenames settle one at a time: Send stays paused until the last one lands', async () => {
    const container = await mountComposer(baseProps());
    await attachFiles(container, [fileOf('report.pdf'), fileOf('report.pdf')]);
    expect(FakeFileReader.instances).toHaveLength(2);
    expect(findSendButton(container).disabled).toBe(true);
    await act(async () => {
      FakeFileReader.instances[0].resolve();
    });
    // One report.pdf still reading: Send stays paused, one chip only.
    expect(findSendButton(container).disabled).toBe(true);
    expect(container.textContent).toContain('Attaching');
    await act(async () => {
      FakeFileReader.instances[1].resolve();
    });
    expect(findSendButton(container).disabled).toBe(false);
    expect(container.textContent).not.toContain('Attaching');
  });

  it('a read ERROR toasts, unblocks Send, and the save honestly persists the rest (without the file)', async () => {
    const onSaveDraft = vi.fn(async () => {});
    const container = await mountComposer(baseProps({ onSaveDraft }));
    await attachFiles(container, [fileOf('report.pdf')]);
    await act(async () => {
      FakeFileReader.instances[0].fail();
    });
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Could not read report.pdf') }),
    );
    expect(findSendButton(container).disabled).toBe(false);
    await openSendMenu(container);
    await click(findMenuItem('Save draft'));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0][0].attachments).toEqual([]);
  });

  it('an ABORTED read settles instead of disabling Send forever', async () => {
    const container = await mountComposer(baseProps());
    await attachFiles(container, [fileOf('report.pdf')]);
    expect(findSendButton(container).disabled).toBe(true);
    await act(async () => {
      FakeFileReader.instances[0].abort();
    });
    expect(findSendButton(container).disabled).toBe(false);
    expect(container.textContent).not.toContain('Attaching');
  });

  it('a synchronously throwing readAsDataURL settles instead of hanging the gate', async () => {
    const container = await mountComposer(baseProps());
    FakeFileReader.throwOnRead = true;
    await attachFiles(container, [fileOf('report.pdf')]);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Could not read report.pdf') }),
    );
    expect(findSendButton(container).disabled).toBe(false);
  });
});

// ---- DockedComposer: close + autosave ----

describe('DockedComposer pending-read paths', () => {
  it('close on a pending-only composer asks first and names the still-attaching file', async () => {
    const onClose = vi.fn();
    const container = await mountDocked({ isOpen: true, onClose });
    await attachFiles(container, [fileOf('report.pdf')]);
    confirmControl.impl = async () => false;
    await click(findButton(container, 'button[aria-label="Close composer"]'));
    await flush();
    expect(confirmControl.calls.length).toBe(1);
    expect(confirmControl.calls[0].message).toContain('report.pdf');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('docked autosave WAITS for a pending read, then persists every file that landed', async () => {
    const container = await mountDocked({
      isOpen: true,
      onClose: vi.fn(),
      initialTo: 'ada@x.com',
      initialSubject: 'Hi',
      initialBody: 'Hello body',
    });
    vi.useFakeTimers();
    try {
      await attachFiles(container, [fileOf('a.pdf')]);
      await act(async () => {
        FakeFileReader.instances[0].resolve();
      });
      await attachFiles(container, [fileOf('b.pdf')]);
      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
      await flush();
      expect(apiClientMock.composeEmail).not.toHaveBeenCalled();
      await act(async () => {
        FakeFileReader.instances[1].resolve();
      });
      await flush();
      expect(apiClientMock.composeEmail).toHaveBeenCalledTimes(1);
      const payload = apiClientMock.composeEmail.mock.calls[0][0];
      expect(payload.attachments.map((a: any) => a.name)).toEqual(['a.pdf', 'b.pdf']);
    } finally {
      vi.useRealTimers();
    }
  });
});
