// @vitest-environment jsdom
/**
 * Live staging finding (Mail walkthrough, thread view → Move to Trash):
 * the thread closed and the row left the inbox at once, but
 * "Conversation moved to trash · Undo" only appeared ~2.7 s later, because
 * `useMailMutations.run` showed it after the outbox round trip (IndexedDB
 * write → request → IndexedDB cleanup). Once it had not appeared after 8 s.
 *
 * Contract pinned here:
 * - the success toast (with its Undo) fires synchronously with the
 *   optimistic change, before the outbox settles;
 * - the Undo works inside that window;
 * - if the server refuses, the confirmation is withdrawn (toast dismissed,
 *   Undo dropped), the optimistic change is rolled back, and an error shows.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EnqueueResult = { sent: boolean; rejected?: { lastError?: string } };

const outbox = vi.hoisted(() => {
  const pending: Array<{ kind: string; id: string; resolve: (r: EnqueueResult) => void }> = [];
  return {
    pending,
    enqueue: vi.fn(
      (kind: string, id: string) =>
        new Promise<EnqueueResult>((resolve) => {
          pending.push({ kind, id, resolve });
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

import { useMailMutations, type MailMutations } from '../hooks/useMail';
import {
  hasPendingUndo,
  runPendingUndo,
  subscribeToDismissals,
  subscribeToToasts,
  type ToastMessage,
} from '../lib/toast-bus';

const INBOX_KEY = ['inbox', undefined, undefined, 'INBOX', 1] as const;

function email(id: string) {
  return {
    id,
    threadId: 't-1',
    subject: 'Design review notes',
    from: { name: 'Priya Peer', email: 'priya@quantmail.in' },
    to: [],
    body: 'hello',
    isRead: true,
    isStarred: false,
    isArchived: false,
    receivedAt: new Date('2026-10-13T10:00:00Z'),
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let toasts: ToastMessage[] = [];
let dismissed: string[] = [];
let unsubs: Array<() => void> = [];

async function mount(queryClient: QueryClient): Promise<MailMutations> {
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

function inboxIds(queryClient: QueryClient): string[] {
  return (queryClient.getQueryData<Array<{ id: string }>>(INBOX_KEY) ?? []).map((e) => e.id);
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
  // Drain anything a test left open so no promise outlives the test.
  outbox.pending.splice(0).forEach((p) => p.resolve({ sent: true }));
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe('useMailMutations — the Undo toast is immediate', () => {
  it('shows "Conversation moved to trash · Undo" before the outbox settles', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(INBOX_KEY, [email('m-1'), email('m-2')]);
    const mutations = await mount(queryClient);

    let settled = false;
    let done!: Promise<void>;
    act(() => {
      done = mutations.trash(['m-1']).then(() => {
        settled = true;
      });
    });

    // Optimistic removal and the confirmation land together…
    expect(inboxIds(queryClient)).toEqual(['m-2']);
    expect(toasts.map((t) => t.text)).toEqual(['Conversation moved to trash']);
    expect(toasts[0].type).toBe('success');
    expect(typeof toasts[0].undoAction).toBe('function');
    expect(hasPendingUndo()).toBe(true);
    // …while the request is still in flight.
    expect(outbox.enqueue).toHaveBeenCalledWith('trash', 'm-1', {});
    expect(settled).toBe(false);

    await act(async () => {
      outbox.pending.shift()!.resolve({ sent: true });
      await done;
    });
    // Success does not add a second toast.
    expect(toasts).toHaveLength(1);
    expect(dismissed).toEqual([]);
  });

  it('Undo works inside the in-flight window and queues the reverse after the original', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(INBOX_KEY, [email('m-1')]);
    const mutations = await mount(queryClient);

    act(() => {
      void mutations.archive(['m-1']);
    });
    expect(toasts.map((t) => t.text)).toEqual(['Conversation archived']);

    act(() => {
      expect(runPendingUndo()).toBe(true);
    });
    // The outbox is FIFO, so the reverse is enqueued after the original and
    // replays in that order even though the original has not settled yet.
    expect(outbox.enqueue.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['archive', 'm-1'],
      ['unarchive', 'm-1'],
    ]);
    // Undo took the toast (and its Undo) with it.
    expect(hasPendingUndo()).toBe(false);
  });

  it('withdraws the confirmation and rolls back when the server refuses', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(INBOX_KEY, [email('m-1'), email('m-2')]);
    const mutations = await mount(queryClient);

    let done!: Promise<void>;
    act(() => {
      done = mutations.trash(['m-1']);
    });
    const confirmation = toasts[0];
    expect(confirmation.text).toBe('Conversation moved to trash');
    expect(inboxIds(queryClient)).toEqual(['m-2']);

    await act(async () => {
      outbox.pending.shift()!.resolve({ sent: false, rejected: { lastError: 'Email not found' } });
      await done;
    });

    // The lie is taken back: toast dismissed, its Undo gone, the row restored.
    expect(dismissed).toContain(confirmation.id);
    expect(hasPendingUndo()).toBe(false);
    expect(inboxIds(queryClient)).toEqual(['m-1', 'm-2']);
    expect(toasts.map((t) => [t.type, t.text])).toEqual([
      ['success', 'Conversation moved to trash'],
      ['error', 'Email not found'],
    ]);
  });

  it('partial snooze failure: only the refused id rolls back, the receipt names the failure, Undo covers only the snoozed id', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(INBOX_KEY, [email('m-1'), email('m-2')]);
    const mutations = await mount(queryClient);

    let done!: Promise<void>;
    act(() => {
      done = mutations.snooze(['m-1', 'm-2'], new Date('2026-10-20T09:00:00Z'));
    });
    const confirmation = toasts[0];
    expect(confirmation.text.startsWith('Snoozed until')).toBe(true);
    // Both messages leave the inbox optimistically.
    expect(inboxIds(queryClient)).toEqual([]);

    await act(async () => {
      // m-1 is refused (e.g. a 409: trashed/draft/spam member of the thread);
      // m-2 is accepted. The receipt must reflect exactly that split.
      outbox.pending.shift()!.resolve({ sent: false, rejected: { lastError: 'Backend refused' } });
      outbox.pending.shift()!.resolve({ sent: true });
      await done;
    });

    // The blanket confirmation is withdrawn…
    expect(dismissed).toContain(confirmation.id);
    // …but only the refused id comes back: the snoozed id stays snoozed.
    expect(inboxIds(queryClient)).toEqual(['m-1']);
    // …and the replacement receipt is a partial failure, never a blanket
    // success ("Snoozed until …") and never a blanket failure ("Backend
    // refused" alone, which would deny the id that did snooze).
    const partial = toasts[toasts.length - 1];
    expect(partial.type).toBe('error');
    expect(partial.text).toContain('1 of 2');
    expect(partial.text).toContain('could not be saved');
    expect(toasts.filter((t) => t.type === 'success')).toHaveLength(1);
    // Undo reverses only what actually landed — never the refused id,
    // whose optimistic change was already rolled back.
    expect(typeof partial.undoAction).toBe('function');
    expect(hasPendingUndo()).toBe(true);
    act(() => {
      expect(runPendingUndo()).toBe(true);
    });
    expect(outbox.enqueue.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['snooze', 'm-1'],
      ['snooze', 'm-2'],
      ['unsnooze', 'm-2'],
    ]);
  });
});
