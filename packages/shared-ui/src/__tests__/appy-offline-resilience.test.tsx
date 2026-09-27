// @vitest-environment jsdom
// ============================================================================
// @quant/shared-ui - Appy v1.1.2 Offline Resilience & Network Quality Tests
// ============================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  classifyQualityTier,
  createOfflineMutationQueue,
  offlineMutationQueue,
  OfflineMutationQueue,
  getNetworkQualityState,
} from '../resilience/network-quality';
import { OfflineSyncBanner } from '../resilience/OfflineSyncBanner';

// Mock framer-motion for jsdom compatibility
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
    aside: ({ children, initial, animate, exit, transition, ...props }: any) => (
      <aside {...props}>{children}</aside>
    ),
    span: ({ children, initial, animate, exit, transition, ...props }: any) => (
      <span {...props}>{children}</span>
    ),
  },
}));

// In-memory Storage mock for testing persistence
class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe('Appy v1.1.2 Network Quality Classification', () => {
  it('classifies any RTT as "offline" when status is offline', () => {
    expect(classifyQualityTier('offline', 0)).toBe('offline');
    expect(classifyQualityTier('offline', 50)).toBe('offline');
    expect(classifyQualityTier('offline', 200)).toBe('offline');
    expect(classifyQualityTier('offline', 800)).toBe('offline');
  });

  it('classifies RTT < 100ms as "excellent" when online', () => {
    expect(classifyQualityTier('online', 0)).toBe('excellent');
    expect(classifyQualityTier('online', 45)).toBe('excellent');
    expect(classifyQualityTier('online', 99)).toBe('excellent');
  });

  it('classifies RTT between 100ms and 300ms (inclusive) as "good" when online', () => {
    expect(classifyQualityTier('online', 100)).toBe('good');
    expect(classifyQualityTier('online', 180)).toBe('good');
    expect(classifyQualityTier('online', 300)).toBe('good');
  });

  it('classifies RTT > 300ms as "poor" when online', () => {
    expect(classifyQualityTier('online', 301)).toBe('poor');
    expect(classifyQualityTier('online', 550)).toBe('poor');
    expect(classifyQualityTier('online', 1200)).toBe('poor');
  });

  it('evaluates getNetworkQualityState with default fallbacks safely', () => {
    const state = getNetworkQualityState();
    expect(state).toHaveProperty('status');
    expect(state).toHaveProperty('rttMs');
    expect(state).toHaveProperty('downlinkMbps');
    expect(state).toHaveProperty('qualityTier');
    expect(state).toHaveProperty('isMetered');
    expect(state).toHaveProperty('lastCheckedAt');
  });
});

describe('Appy v1.1.2 Offline Mutation Queue', () => {
  let mockStorage: MockStorage;
  let queue: OfflineMutationQueue;

  beforeEach(() => {
    mockStorage = new MockStorage();
    queue = createOfflineMutationQueue({
      storage: mockStorage,
      storageKey: 'test_mutations',
      defaultMaxRetries: 3,
    });
  });

  it('enqueues mutations with PENDING status, timestamps, and persists to storage', () => {
    const mutation = queue.enqueue('POST_COMMENT', { postId: 'post-1', text: 'Great work!' });

    expect(mutation.id).toBeDefined();
    expect(mutation.action).toBe('POST_COMMENT');
    expect(mutation.payload).toEqual({ postId: 'post-1', text: 'Great work!' });
    expect(mutation.retryCount).toBe(0);
    expect(mutation.maxRetries).toBe(3);
    expect(mutation.status).toBe('PENDING');
    expect(mutation.queuedAt).toBeDefined();

    // Verify storage persistence
    const saved = JSON.parse(mockStorage.getItem('test_mutations')!);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(mutation.id);
  });

  it('retrieves only pending mutations in FIFO order', () => {
    queue.enqueue('ACTION_1', { num: 1 });
    queue.enqueue('ACTION_2', { num: 2 });
    queue.enqueue('ACTION_3', { num: 3 });

    const pending = queue.getPendingMutations();
    expect(pending).toHaveLength(3);
    expect(pending[0]?.action).toBe('ACTION_1');
    expect(pending[1]?.action).toBe('ACTION_2');
    expect(pending[2]?.action).toBe('ACTION_3');
  });

  it('flushes pending mutations in FIFO order and marks them as COMPLETED', () => {
    return (async () => {
      const processed: string[] = [];
      queue.enqueue('SYNC_FILE', { fileId: 'f1' });
      queue.enqueue('SYNC_TAG', { tag: 'urgent' });

      const result = await queue.flushQueue(async (m) => {
        processed.push(m.action);
        return true;
      });

      expect(result.syncedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(processed).toEqual(['SYNC_FILE', 'SYNC_TAG']);

      // Pending queue should now be empty
      expect(queue.getPendingMutations()).toHaveLength(0);

      // Completed mutations remain tracked
      const completed = queue.getCompletedMutations();
      expect(completed).toHaveLength(2);
      expect(completed[0]?.status).toBe('COMPLETED');
    })();
  });

  it('increments retryCount on failure and marks mutation as FAILED when reaching maxRetries', () => {
    return (async () => {
      // Mutation with maxRetries: 2
      const mutation = queue.enqueue('SEND_PAYMENT', { amount: 100 }, 2);

      // Attempt 1: fails
      const flush1 = await queue.flushQueue(async () => false);
      expect(flush1.syncedCount).toBe(0);
      expect(flush1.failedCount).toBe(1);
      expect(mutation.retryCount).toBe(1);
      expect(mutation.status).toBe('PENDING'); // Retryable, remains pending

      // Attempt 2: fails again (reaching maxRetries 2)
      const flush2 = await queue.flushQueue(async () => false);
      expect(flush2.syncedCount).toBe(0);
      expect(flush2.failedCount).toBe(1);
      expect(mutation.retryCount).toBe(2);
      expect(mutation.status).toBe('FAILED');
      expect(mutation.error).toContain('Sync failed');

      // Attempt 3: no pending mutations left to retry
      expect(queue.getPendingMutations()).toHaveLength(0);
      expect(queue.getFailedMutations()).toHaveLength(1);
    })();
  });

  it('handles sync handler exceptions gracefully, incrementing retryCount', () => {
    return (async () => {
      const mutation = queue.enqueue('CRASH_ACTION', {}, 1);

      const result = await queue.flushQueue(async () => {
        throw new Error('500 Internal Server Error');
      });

      expect(result.failedCount).toBe(1);
      expect(mutation.retryCount).toBe(1);
      expect(mutation.status).toBe('FAILED');
      expect(mutation.error).toBe('500 Internal Server Error');
    })();
  });

  it('removes specific mutations by ID', () => {
    const m1 = queue.enqueue('M1', {});
    const m2 = queue.enqueue('M2', {});

    const removed = queue.removeMutation(m1.id);
    expect(removed).toBe(true);
    expect(queue.getAllMutations()).toHaveLength(1);
    expect(queue.getMutation(m1.id)).toBeUndefined();
    expect(queue.getMutation(m2.id)).toBeDefined();

    // Removing non-existent returns false
    expect(queue.removeMutation('non-existent')).toBe(false);
  });

  it('clears queue completely from memory and storage', () => {
    queue.enqueue('A1', {});
    queue.enqueue('A2', {});
    expect(queue.getAllMutations()).toHaveLength(2);

    queue.clearQueue();
    expect(queue.getAllMutations()).toHaveLength(0);
    expect(mockStorage.getItem('test_mutations')).toBeNull();
  });

  it('supports retryFailedMutations resetting failed mutations to PENDING', () => {
    return (async () => {
      const mutation = queue.enqueue('RETRY_TEST', {}, 1);
      await queue.flushQueue(async () => false);
      expect(mutation.status).toBe('FAILED');

      const resetCount = queue.retryFailedMutations();
      expect(resetCount).toBe(1);
      expect(mutation.status).toBe('PENDING');
      expect(mutation.retryCount).toBe(0);
      expect(queue.getPendingMutations()).toHaveLength(1);
    })();
  });

  it('exports singleton offlineMutationQueue', () => {
    expect(offlineMutationQueue).toBeDefined();
    expect(offlineMutationQueue).toBeInstanceOf(OfflineMutationQueue);
  });
});

describe('OfflineSyncBanner Component', () => {
  it('renders "Offline Mode — Changes will sync when reconnected" when offline', () => {
    render(<OfflineSyncBanner status="offline" />);

    expect(
      screen.getByText('Offline Mode — Changes will sync when reconnected'),
    ).toBeInTheDocument();
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('displays queued count badge when pending mutations exist in offline mode', () => {
    render(<OfflineSyncBanner status="offline" pendingCount={4} />);

    expect(
      screen.getByText('Offline Mode — Changes will sync when reconnected'),
    ).toBeInTheDocument();
    expect(screen.getByText('4 queued')).toBeInTheDocument();
  });

  it('renders "Syncing N pending changes..." when flushing', () => {
    render(<OfflineSyncBanner status="syncing" pendingCount={3} />);

    expect(screen.getByText('Syncing 3 pending changes...')).toBeInTheDocument();
  });

  it('renders "Syncing 1 pending changes..." when isSyncing prop is true', () => {
    render(<OfflineSyncBanner isSyncing={true} pendingCount={1} />);

    expect(screen.getByText('Syncing 1 pending changes...')).toBeInTheDocument();
  });

  it('renders "All changes synced" checkmark on completion', () => {
    render(<OfflineSyncBanner hasSynced={true} />);

    expect(screen.getByText('All changes synced')).toBeInTheDocument();
  });

  it('triggers onSync callback when user clicks retry button in offline mode', () => {
    const onSync = vi.fn();
    render(<OfflineSyncBanner status="offline" onSync={onSync} />);

    const retryBtn = screen.getByRole('button', { name: /Retry now/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);

    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('reactively syncs with OfflineMutationQueue updates', () => {
    return (async () => {
      const storage = new MockStorage();
      const customQueue = createOfflineMutationQueue({ storage, storageKey: 'banner_test' });

      customQueue.enqueue('ITEM_1', {});
      customQueue.enqueue('ITEM_2', {});

      const { rerender } = render(<OfflineSyncBanner status="offline" queue={customQueue} />);
      expect(screen.getByText('2 queued')).toBeInTheDocument();

      // Flush queue
      await act(async () => {
        await customQueue.flushQueue(async () => true);
      });

      rerender(<OfflineSyncBanner status="online" queue={customQueue} />);
      expect(screen.getByText('All changes synced')).toBeInTheDocument();
    })();
  });
});
