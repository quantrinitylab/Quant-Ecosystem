/**
 * PendingAttachmentReads — the gate behind the 2026-10-22 P1 send race and
 * its 2026-10-25 corrective (PR #1572).
 *
 * These are BEHAVIOR tests over the real async state machine, not wiring
 * pins: reads are begun, settled in load/error/abort orderings, and the
 * wait/send-gate decisions are driven through time. Both composers delegate
 * their send refusal, save/autosave/back waits and discard-confirm
 * decisions to this controller, so the contract is pinned here once and
 * exercised end-to-end through the mounted composer suite.
 */
import { describe, it, expect } from 'vitest';
import { PendingAttachmentReads } from '../pending-attachment-reads';

describe('PendingAttachmentReads', () => {
  it('starts empty: no pending reads, wait resolves immediately', async () => {
    const reads = new PendingAttachmentReads();
    expect(reads.hasPending()).toBe(false);
    expect(reads.pendingCount()).toBe(0);
    expect(reads.pendingNames()).toEqual([]);
    await reads.waitForSettled();
  });

  it('tracks names in pick order and clears on settle', () => {
    const reads = new PendingAttachmentReads();
    const a = reads.begin('a.pdf');
    const b = reads.begin('b.pdf');
    expect(reads.pendingNames()).toEqual(['a.pdf', 'b.pdf']);
    expect(reads.pendingCount()).toBe(2);
    expect(reads.settle(a)).toBe('a.pdf');
    expect(reads.pendingNames()).toEqual(['b.pdf']);
    expect(reads.settle(b)).toBe('b.pdf');
    expect(reads.hasPending()).toBe(false);
  });

  it('duplicate filenames settle one at a time (id-keyed, not name-keyed)', () => {
    const reads = new PendingAttachmentReads();
    const first = reads.begin('report.pdf');
    const second = reads.begin('report.pdf');
    expect(reads.pendingNames()).toEqual(['report.pdf', 'report.pdf']);
    reads.settle(first);
    // One report.pdf still reading: Send must stay paused, a save wait
    // must keep waiting. Name-keyed settling would have cleared both.
    expect(reads.pendingNames()).toEqual(['report.pdf']);
    expect(reads.hasPending()).toBe(true);
    reads.settle(second);
    expect(reads.hasPending()).toBe(false);
  });

  it('double settle is a no-op (never a negative count, never a phantom wake)', () => {
    const reads = new PendingAttachmentReads();
    const id = reads.begin('a.pdf');
    expect(reads.settle(id)).toBe('a.pdf');
    expect(reads.settle(id)).toBeNull();
    expect(reads.settle(9999)).toBeNull();
    expect(reads.pendingCount()).toBe(0);
  });

  it('waitForSettled blocks until the last read settles, then lets the snapshot through', async () => {
    const reads = new PendingAttachmentReads();
    const id = reads.begin('a.pdf');
    let released = false;
    const waiting = reads.waitForSettled().then(() => {
      released = true;
    });
    // Let the wait park itself; the snapshot must NOT proceed yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false);
    reads.settle(id);
    await waiting;
    expect(released).toBe(true);
  });

  it('waitForSettled also awaits reads begun DURING the wait', async () => {
    const reads = new PendingAttachmentReads();
    const first = reads.begin('a.pdf');
    let released = false;
    const waiting = reads.waitForSettled().then(() => {
      released = true;
    });
    await Promise.resolve();
    // A second file picked while the save is waiting: the snapshot must
    // wait for it too, not slip through on the first settle.
    const second = reads.begin('b.pdf');
    reads.settle(first);
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false);
    reads.settle(second);
    await waiting;
    expect(released).toBe(true);
  });

  it('concurrent waiters all wake when the last read settles', async () => {
    const reads = new PendingAttachmentReads();
    const id = reads.begin('a.pdf');
    let woken = 0;
    const w1 = reads.waitForSettled().then(() => {
      woken += 1;
    });
    const w2 = reads.waitForSettled().then(() => {
      woken += 1;
    });
    reads.settle(id);
    await Promise.all([w1, w2]);
    expect(woken).toBe(2);
  });

  it('load, error and abort outcomes are all just settles — none hangs the gate', async () => {
    // The controller is outcome-agnostic by design: the composer calls
    // settle() from onload, onerror AND onabort, so a failed or aborted
    // read unblocks Send/save exactly like a loaded one (minus the file).
    const reads = new PendingAttachmentReads();
    const load = reads.begin('ok.pdf');
    const error = reads.begin('bad.pdf');
    const aborted = reads.begin('cut.pdf');
    const waiting = reads.waitForSettled();
    reads.settle(load);
    reads.settle(error);
    expect(reads.hasPending()).toBe(true);
    reads.settle(aborted);
    await waiting;
    expect(reads.hasPending()).toBe(false);
  });
});
