// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EnqueueResult = { sent: boolean; rejected?: { lastError?: string } };

const outbox = vi.hoisted(() => {
  const pending: Array<{ kind: string; id: string; extra: any; resolve: (r: EnqueueResult) => void }> = [];
  return {
    pending,
    enqueue: vi.fn(
      (kind: string, id: string, extra: any) =>
        new Promise<EnqueueResult>((resolve) => {
          pending.push({ kind, id, extra, resolve });
        }),
    ),
  };
});

vi.mock('../lib/offline/outbox', () => ({ enqueue: outbox.enqueue }));
vi.mock('../lib/offline/mail-cache', () => ({
  mailboxKey: vi.fn(),
  readMailbox: vi.fn(async () => null),
  writeMailbox: vi.fn(async () => undefined),
  patchEmail: vi.fn(async () => undefined),
}));

import { useMailMutations, useInbox, activePagers, type MailMutations } from '../hooks/useMail';
import {
  runPendingUndo,
  subscribeToDismissals,
  subscribeToToasts,
  type ToastMessage,
} from '../lib/toast-bus';
import type { Email } from '../types';

const INBOX_KEY = ['inbox', undefined, undefined, 'INBOX', 1] as const;

function mockEmail(id: string, isFlagged = false): Email {
  return {
    id,
    threadId: 't-1',
    subject: `Subject ${id}`,
    from: { name: 'Priya', email: 'priya@quantmail.in' },
    to: [],
    body: 'hello',
    isRead: true,
    isStarred: false,
    isPinned: false,
    isFlagged,
    isArchived: false,
    isDraft: false,
    labels: [],
    attachments: [],
    references: [],
    headers: {},
    receivedAt: new Date('2026-10-13T10:00:00Z'),
  } as unknown as Email;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let toasts: ToastMessage[] = [];
let dismissed: string[] = [];
let unsubs: Array<() => void> = [];

async function mountMutations(queryClient: QueryClient): Promise<MailMutations> {
  let api: MailMutations | null = null;
  function Probe() {
    api = useMailMutations();
    return null;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return api!;
}

async function mountInboxWithPager(queryClient: QueryClient): Promise<{ mutations: MailMutations; inbox: ReturnType<typeof useInbox> }> {
  let mutationsApi: MailMutations | null = null;
  let inboxApi: ReturnType<typeof useInbox> | null = null;
  function Probe() {
    mutationsApi = useMailMutations();
    inboxApi = useInbox({ folderType: 'INBOX' });
    return null;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return { mutations: mutationsApi!, inbox: inboxApi! };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  outbox.pending.length = 0;
  outbox.enqueue.mockClear();
  toasts = [];
  dismissed = [];
  unsubs = [
    subscribeToToasts((t) => toasts.push(t)),
    subscribeToDismissals((id) => dismissed.push(id)),
  ];
});

afterEach(async () => {
  unsubs.forEach((u) => u());
  outbox.pending.splice(0).forEach((p) => p.resolve({ sent: true }));
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('useMailMutations.setFlagged (AC-13, AC-20, AC-27)', () => {
  it('AC-13(a): flags an unflagged email optimistically, toasts with Undo, and enqueues setFlagged', async () => {
    const qc = new QueryClient();
    qc.setQueryData(INBOX_KEY, [mockEmail('e1', false)]);

    const api = await mountMutations(qc);

    await act(async () => {
      void api.setFlagged('e1', true);
    });

    const list = qc.getQueryData<Email[]>(INBOX_KEY);
    expect(list?.[0].isFlagged).toBe(true);

    expect(toasts).toHaveLength(1);
    expect(toasts[0].text).toBe('Conversation flagged');
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].undoAction).toBeDefined();

    expect(outbox.enqueue).toHaveBeenCalledWith('setFlagged', 'e1', { flagged: true });
  });

  it('AC-13(b): unflags a flagged email optimistically with "Conversation unflagged" toast', async () => {
    const qc = new QueryClient();
    qc.setQueryData(INBOX_KEY, [mockEmail('e1', true)]);

    const api = await mountMutations(qc);

    await act(async () => {
      void api.setFlagged('e1', false);
    });

    const list = qc.getQueryData<Email[]>(INBOX_KEY);
    expect(list?.[0].isFlagged).toBe(false);

    expect(toasts).toHaveLength(1);
    expect(toasts[0].text).toBe('Conversation unflagged');
    expect(outbox.enqueue).toHaveBeenCalledWith('setFlagged', 'e1', { flagged: false });
  });

  it('AC-13(c): enqueues only wrong-side IDs, and enqueues nothing if all at target', async () => {
    const qc = new QueryClient();
    qc.setQueryData(INBOX_KEY, [mockEmail('e1', false), mockEmail('e2', true)]);

    const api = await mountMutations(qc);

    // Target true: e1 is wrong-side, e2 is already true
    await act(async () => {
      void api.setFlagged(['e1', 'e2'], true);
    });

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledWith('setFlagged', 'e1', { flagged: true });

    outbox.enqueue.mockClear();

    // Now both e1 and e2 are true in cache. Call setFlagged with true again
    await act(async () => {
      void api.setFlagged(['e1', 'e2'], true);
    });

    expect(outbox.enqueue).not.toHaveBeenCalled();
    // No new toast
    expect(toasts).toHaveLength(1); // from the previous call only
  });

  it('AC-13(d): Undo restores cache and enqueues the inverse mutation', async () => {
    const qc = new QueryClient();
    qc.setQueryData(INBOX_KEY, [mockEmail('e1', false)]);

    const api = await mountMutations(qc);

    await act(async () => {
      void api.setFlagged('e1', true);
    });

    expect(qc.getQueryData<Email[]>(INBOX_KEY)?.[0].isFlagged).toBe(true);

    // Trigger Undo
    await act(async () => {
      runPendingUndo();
    });

    expect(qc.getQueryData<Email[]>(INBOX_KEY)?.[0].isFlagged).toBe(false);
    expect(outbox.enqueue).toHaveBeenLastCalledWith('setFlagged', 'e1', { flagged: false });
  });

  it('AC-13(e): rejected enqueue rolls back cache, dismisses confirmation toast, and shows error', async () => {
    const qc = new QueryClient();
    qc.setQueryData(INBOX_KEY, [mockEmail('e1', false)]);

    const api = await mountMutations(qc);

    let mutatePromise: Promise<void>;
    await act(async () => {
      mutatePromise = api.setFlagged('e1', true);
    });

    expect(qc.getQueryData<Email[]>(INBOX_KEY)?.[0].isFlagged).toBe(true);
    expect(toasts).toHaveLength(1);
    const toastId = toasts[0].id;

    // Reject outbox entry
    await act(async () => {
      outbox.pending[0].resolve({
        sent: false,
        rejected: { lastError: 'Permission denied' },
      });
      await mutatePromise;
    });

    expect(qc.getQueryData<Email[]>(INBOX_KEY)?.[0].isFlagged).toBe(false);
    expect(dismissed).toContain(toastId);

    const errorToast = toasts.find((t) => t.type === 'error');
    expect(errorToast).toBeDefined();
    expect(errorToast?.text).toBe('Permission denied');
  });

  it('AC-13(f): batch of 3 conversations reads "3 conversations flagged"', async () => {
    const qc = new QueryClient();
    qc.setQueryData(INBOX_KEY, [mockEmail('e1', false), mockEmail('e2', false), mockEmail('e3', false)]);

    const api = await mountMutations(qc);

    await act(async () => {
      void api.setFlagged(['e1', 'e2', 'e3'], true, 3);
    });

    expect(toasts).toHaveLength(1);
    expect(toasts[0].text).toBe('3 conversations flagged');
  });

  it('AC-13(g) & FR-C6: patches row existing only in cursor-pager tail and rolls back on rejection', async () => {
    const qc = new QueryClient();
    qc.setQueryData(INBOX_KEY, [mockEmail('head-1', false)]);

    const { mutations } = await mountInboxWithPager(qc);

    // Get the registered active pager
    const activeEntry = Array.from(activePagers)[0];
    expect(activeEntry).toBeDefined();

    const tailEmail = mockEmail('tail-1', false);
    act(() => {
      activeEntry.pager.extend([tailEmail], 'cursor-2');
      activeEntry.bump();
    });

    let mutatePromise: Promise<void>;
    await act(async () => {
      mutatePromise = mutations.setFlagged('tail-1', true);
    });

    // Pager tail email is patched optimistically
    expect(activeEntry.pager.tailEmails[0].isFlagged).toBe(true);
    expect(outbox.enqueue).toHaveBeenCalledWith('setFlagged', 'tail-1', { flagged: true });

    // Reject enqueue
    await act(async () => {
      outbox.pending[0].resolve({
        sent: false,
        rejected: { lastError: 'Server error' },
      });
      await mutatePromise;
    });

    // Rolled back in pager tail
    expect(activeEntry.pager.tailEmails[0].isFlagged).toBe(false);
  });
});
