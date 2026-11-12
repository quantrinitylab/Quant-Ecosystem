import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OutboxEntry } from '../outbox';

const { mockMailDatabase, mockApiClient, memoryStore } = vi.hoisted(() => {
  const memoryStore = new Map<string, any>();
  const mockMailDatabase = {
    put: vi.fn(async (_store: string, entry: any) => {
      memoryStore.set(entry.id, { ...entry });
    }),
    get: vi.fn(async (_store: string, id: string) => {
      const found = memoryStore.get(id);
      return found ? { ...found } : undefined;
    }),
    getAll: vi.fn(async (_store: string) => {
      return Array.from(memoryStore.values()).map((v) => ({ ...v }));
    }),
    delete: vi.fn(async (_store: string, id: string) => {
      memoryStore.delete(id);
    }),
  };
  const mockApiClient = {
    setFlagged: vi.fn(),
    toggleStar: vi.fn(),
  };
  return { mockMailDatabase, mockApiClient, memoryStore };
});

vi.mock('../client', () => ({
  createId: (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`,
  mailDatabase: mockMailDatabase,
  STORE_OUTBOX: 'outbox',
}));

vi.mock('../../../services/api-client', () => ({
  apiClient: mockApiClient,
}));

describe('outbox setFlagged & rerun drain (AC-12, MEDIUM 3)', () => {
  let outboxModule: typeof import('../outbox');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    memoryStore.clear();
    outboxModule = await import('../outbox');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores setFlagged entry with target before sending, and deletes on success', async () => {
    let storedDuringExecute: OutboxEntry | undefined;
    mockApiClient.setFlagged.mockImplementationOnce(async () => {
      const all = Array.from(memoryStore.values());
      storedDuringExecute = all.find((e) => e.kind === 'setFlagged');
      return { success: true };
    });

    const res = await outboxModule.enqueue('setFlagged', 'email-1', { flagged: true });

    expect(res.sent).toBe(true);
    expect(storedDuringExecute).toBeDefined();
    expect(storedDuringExecute?.flagged).toBe(true);
    expect(mockApiClient.setFlagged).toHaveBeenCalledWith('email-1', true);

    // After success, it should be deleted from DB
    const remaining = Array.from(memoryStore.values());
    expect(remaining).toHaveLength(0);
  });

  it('preserves order against an earlier toggleStar mutation', async () => {
    const callOrder: string[] = [];
    mockApiClient.toggleStar.mockImplementationOnce(async () => {
      callOrder.push('star:email-1');
      return { success: true };
    });
    mockApiClient.setFlagged.mockImplementationOnce(async () => {
      callOrder.push('flag:email-1:true');
      return { success: true };
    });

    await outboxModule.enqueue('toggleStar', 'email-1');
    await outboxModule.enqueue('setFlagged', 'email-1', { flagged: true });

    expect(callOrder).toEqual(['star:email-1', 'flag:email-1:true']);
  });

  it('discards permanent 403 / 404 to rejected and deletes from outbox store', async () => {
    mockApiClient.setFlagged.mockResolvedValueOnce({
      success: false,
      error: { message: 'Not authorized', statusCode: 403 },
    });

    const res = await outboxModule.enqueue('setFlagged', 'e-forbidden', { flagged: true });
    expect(res.sent).toBe(false);
    expect(res.rejected).toBeDefined();
    expect(res.rejected?.emailId).toBe('e-forbidden');
    expect(res.rejected?.lastError).toBe('Not authorized');

    const remaining = Array.from(memoryStore.values());
    expect(remaining).toHaveLength(0);
  });

  it('keeps entry in outbox and schedules backoff on transient 5xx or network error', async () => {
    mockApiClient.setFlagged.mockResolvedValueOnce({
      success: false,
      error: { message: 'Database connection failed', statusCode: 500 },
    });

    const res = await outboxModule.enqueue('setFlagged', 'e-transient', { flagged: false });
    expect(res.sent).toBe(false);

    const remaining = Array.from(memoryStore.values());
    expect(remaining).toHaveLength(1);
    expect(remaining[0].emailId).toBe('e-transient');
    expect(remaining[0].attempts).toBe(1);
    expect(remaining[0].lastError).toBe('Database connection failed');
  });

  it('drains entries enqueued while a flush is in-flight without requiring an external trigger (MEDIUM 3)', async () => {
    let finishFirst: () => void;
    const firstPromise = new Promise<{ success: boolean }>((resolve) => {
      finishFirst = () => resolve({ success: true });
    });

    mockApiClient.setFlagged.mockImplementationOnce(() => firstPromise);
    mockApiClient.setFlagged.mockImplementationOnce(async () => ({ success: true }));

    // Start first enqueue which initiates flush
    const p1 = outboxModule.enqueue('setFlagged', 'e-first', { flagged: true });

    // While first call is in flight, enqueue second
    const p2 = outboxModule.enqueue('setFlagged', 'e-second', { flagged: false });

    // Let first complete
    finishFirst!();

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.sent).toBe(true);
    expect(res2.sent).toBe(true);
    expect(mockApiClient.setFlagged).toHaveBeenCalledWith('e-first', true);
    expect(mockApiClient.setFlagged).toHaveBeenCalledWith('e-second', false);

    // Queue is fully drained
    expect(memoryStore.size).toBe(0);
  });
});
