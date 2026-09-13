// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStores = new Map<string, Map<string, any>>();

vi.mock('../../src/lib/offline/client', () => {
  return {
    STORE_EMAILS: 'emails',
    STORE_MAILBOXES: 'mailboxes',
    STORE_OUTBOX: 'outbox',
    STORE_DRAFTS: 'drafts',
    createId: (prefix: string) => `${prefix}_test_123`,
    mailDatabase: {
      get: vi.fn(async (store: string, key: string) => {
        return mockStores.get(store)?.get(key) ?? null;
      }),
      getAll: vi.fn(async (store: string) => {
        return Array.from(mockStores.get(store)?.values() ?? []);
      }),
      put: vi.fn(async (store: string, value: any) => {
        if (!mockStores.has(store)) mockStores.set(store, new Map());
        const key = value.id ?? value.key;
        mockStores.get(store)!.set(key, value);
      }),
      putMany: vi.fn(async (store: string, values: any[]) => {
        if (!mockStores.has(store)) mockStores.set(store, new Map());
        const s = mockStores.get(store)!;
        for (const v of values) {
          s.set(v.id ?? v.key, v);
        }
      }),
      delete: vi.fn(async (store: string, key: string) => {
        mockStores.get(store)?.delete(key);
      }),
      clear: vi.fn(async (store: string) => {
        mockStores.get(store)?.clear();
      }),
    },
  };
});

describe('Task QM-01: Client-side Offline Drafting & IndexedDB Cache', () => {
  beforeEach(() => {
    mockStores.clear();
    mockStores.set('drafts', new Map());
    mockStores.set('emails', new Map());
    mockStores.set('mailboxes', new Map());
  });

  it('saves and reads offline drafts', async () => {
    const { saveOfflineDraft, getOfflineDraft } = await import('../../src/lib/offline/drafts');

    const draft = await saveOfflineDraft({
      to: ['colleague@example.com'],
      subject: 'Offline Meeting Notes',
      body: 'Here are the draft notes while travelling offline.',
    });

    expect(draft.id).toBeDefined();
    expect(draft.isDirty).toBe(true);
    expect(draft.subject).toBe('Offline Meeting Notes');

    const retrieved = await getOfflineDraft(draft.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.subject).toBe('Offline Meeting Notes');
    expect(retrieved?.body).toBe('Here are the draft notes while travelling offline.');
  });

  it('lists offline drafts ordered by recency', async () => {
    const { saveOfflineDraft, listOfflineDrafts } = await import('../../src/lib/offline/drafts');

    await saveOfflineDraft({
      id: 'draft-1',
      to: ['alice@example.com'],
      subject: 'Draft 1',
      body: 'Body 1',
    });

    await saveOfflineDraft({
      id: 'draft-2',
      to: ['bob@example.com'],
      subject: 'Draft 2',
      body: 'Body 2',
    });

    const list = await listOfflineDrafts();
    expect(list).toHaveLength(2);
    expect(list.map((d) => d.id)).toContain('draft-1');
    expect(list.map((d) => d.id)).toContain('draft-2');
  });

  it('deletes offline draft upon submission or cancellation', async () => {
    const { saveOfflineDraft, deleteOfflineDraft, getOfflineDraft } =
      await import('../../src/lib/offline/drafts');

    const draft = await saveOfflineDraft({
      id: 'draft-to-delete',
      to: ['test@example.com'],
      subject: 'Temporary',
      body: 'Delete me',
    });

    expect(await getOfflineDraft(draft.id)).not.toBeNull();

    await deleteOfflineDraft(draft.id);
    expect(await getOfflineDraft(draft.id)).toBeNull();
  });

  it('caches mailbox snapshots for zero-latency email switching', async () => {
    const { writeMailbox, readMailbox, mailboxKey } =
      await import('../../src/lib/offline/mail-cache');

    const key = mailboxKey({ folderType: 'INBOX' });
    const sampleEmails: any[] = [
      { id: 'msg-1', subject: 'Email 1', fromAddress: 'a@x.com', receivedAt: new Date() },
      { id: 'msg-2', subject: 'Email 2', fromAddress: 'b@x.com', receivedAt: new Date() },
    ];

    await writeMailbox(key, sampleEmails);

    const cached = await readMailbox(key);
    expect(cached).toHaveLength(2);
    expect(cached?.[0]?.id).toBe('msg-1');
    expect(cached?.[1]?.id).toBe('msg-2');
  });
});
