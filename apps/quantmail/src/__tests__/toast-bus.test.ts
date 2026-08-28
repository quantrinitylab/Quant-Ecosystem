import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MAX_VISIBLE_TOASTS,
  forgetUndo,
  hasPendingUndo,
  reduceToasts,
  runPendingUndo,
  showToast,
  subscribeToDismissals,
  subscribeToToasts,
  type ToastMessage,
} from '../lib/toast-bus';

/**
 * Two things are worth pinning here.
 *
 * `reduceToasts` decides what the user can see at once, and the rule it enforces
 * is not obvious from the call sites: two toasts about the same object must never
 * sit on screen contradicting each other. Star then unstar one Drive file and the
 * naive text-keyed dedupe leaves `Starred "report.pdf"` and `Unstarred
 * "report.pdf"` stacked together, both claiming to describe the current state.
 *
 * The undo registry is the other half — `z` reverses the last action, and its
 * window is meant to be exactly the window the toast was visible for. An undo
 * that survives its own toast has no visible affordance left, so eviction has to
 * clear it.
 */

const toast = (over: Partial<ToastMessage> & { id: string }): ToastMessage => ({
  text: 'something happened',
  type: 'info',
  ...over,
});

describe('reduceToasts', () => {
  it('appends when nothing matches', () => {
    const { next, evicted } = reduceToasts(
      [toast({ id: 'a', text: 'first' })],
      toast({ id: 'b', text: 'second' }),
    );

    expect(next.map((t) => t.id)).toEqual(['a', 'b']);
    expect(evicted).toEqual([]);
  });

  it('replaces a live toast carrying the same subject regardless of wording', () => {
    // The case that motivated `subject`: opposite claims about one file.
    const current = [toast({ id: 'a', text: 'Starred "report.pdf"', subject: 'star:7' })];
    const { next, evicted } = reduceToasts(
      current,
      toast({ id: 'b', text: 'Unstarred "report.pdf"', subject: 'star:7' }),
    );

    expect(next.map((t) => t.text)).toEqual(['Unstarred "report.pdf"']);
    expect(evicted).toEqual(['a']);
  });

  it('leaves toasts about other objects alone', () => {
    const current = [
      toast({ id: 'a', text: 'Starred "a.pdf"', subject: 'star:1' }),
      toast({ id: 'b', text: 'Starred "b.pdf"', subject: 'star:2' }),
    ];
    const { next, evicted } = reduceToasts(
      current,
      toast({ id: 'c', text: 'Unstarred "a.pdf"', subject: 'star:1' }),
    );

    expect(next.map((t) => t.id)).toEqual(['b', 'c']);
    expect(evicted).toEqual(['a']);
  });

  it('falls back to identical text when no subject is given', () => {
    // Holding `e` down a mail list should read as one message, not forty.
    const current = [toast({ id: 'a', text: 'Archived' })];
    const { next, evicted } = reduceToasts(current, toast({ id: 'b', text: 'Archived' }));

    expect(next.map((t) => t.id)).toEqual(['b']);
    expect(evicted).toEqual(['a']);
  });

  it('does not match a subjectless incoming toast against a subject', () => {
    const current = [toast({ id: 'a', text: 'Archived', subject: 'mail:1' })];
    const { next } = reduceToasts(current, toast({ id: 'b', text: 'Archived' }));

    expect(next.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('caps the stack and reports what fell off the top', () => {
    const current = [
      toast({ id: 'a', text: '1' }),
      toast({ id: 'b', text: '2' }),
      toast({ id: 'c', text: '3' }),
    ];
    const { next, evicted } = reduceToasts(current, toast({ id: 'd', text: '4' }), 3);

    expect(next.map((t) => t.id)).toEqual(['b', 'c', 'd']);
    // `a` is off screen, so its undo has no window left and must be reported.
    expect(evicted).toEqual(['a']);
  });

  it('keeps the incoming toast even when max is degenerate', () => {
    // A caller passing 0 should still see the thing that just happened.
    const { next } = reduceToasts(
      [toast({ id: 'a', text: '1' })],
      toast({ id: 'b', text: '2' }),
      0,
    );

    expect(next.map((t) => t.id)).toEqual(['b']);
  });

  it('never exceeds the shared cap', () => {
    let stack: ToastMessage[] = [];
    for (let i = 0; i < 10; i += 1) {
      stack = reduceToasts(stack, toast({ id: `t${i}`, text: `${i}` })).next;
    }

    expect(stack).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(stack.map((t) => t.id)).toEqual(['t7', 't8', 't9']);
  });

  it('does not mutate the array it was given', () => {
    const current = [toast({ id: 'a', text: 'first' })];
    reduceToasts(current, toast({ id: 'b', text: 'first' }));

    expect(current.map((t) => t.id)).toEqual(['a']);
  });
});

describe('the undo registry', () => {
  beforeEach(() => {
    // The registry is module state; make sure no earlier case leaks into this one.
    runPendingUndo();
  });

  it('has nothing to reverse until a toast offers an undo', () => {
    expect(hasPendingUndo()).toBe(false);

    showToast({ text: 'Archived', type: 'success' });
    expect(hasPendingUndo()).toBe(false);

    showToast({ text: 'Archived', type: 'success', undoAction: () => {} });
    expect(hasPendingUndo()).toBe(true);
  });

  it('runs the action once and then reports the window closed', () => {
    const undo = vi.fn();
    showToast({ text: 'Archived', type: 'success', undoAction: undo });

    expect(runPendingUndo()).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);

    // A second `z` must not reverse the same action twice.
    expect(runPendingUndo()).toBe(false);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('dismisses the owning toast before running the action', () => {
    const order: string[] = [];
    const dismissed: string[] = [];
    const unsubscribe = subscribeToDismissals((id) => {
      order.push('dismiss');
      dismissed.push(id);
    });

    let firedId = '';
    const unsubscribeToasts = subscribeToToasts((msg) => {
      firedId = msg.id;
    });

    showToast({ text: 'Archived', type: 'success', undoAction: () => order.push('undo') });
    runPendingUndo();

    // Otherwise the toast lingers with a live Undo button whose action already ran.
    expect(order).toEqual(['dismiss', 'undo']);
    expect(dismissed).toEqual([firedId]);

    unsubscribe();
    unsubscribeToasts();
  });

  it('lets the newest reversible action win', () => {
    const first = vi.fn();
    const second = vi.fn();
    showToast({ text: 'Archived', type: 'success', undoAction: first });
    showToast({ text: 'Deleted', type: 'success', undoAction: second });

    runPendingUndo();

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('only forgets an undo when the id matches the toast that claimed it', () => {
    let claimedId = '';
    const unsubscribe = subscribeToToasts((msg) => {
      claimedId = msg.id;
    });
    showToast({ text: 'Archived', type: 'success', undoAction: () => {} });

    // An older toast expiring must not take a newer toast's undo with it.
    forgetUndo('toast-someone-else');
    expect(hasPendingUndo()).toBe(true);

    forgetUndo(claimedId);
    expect(hasPendingUndo()).toBe(false);

    unsubscribe();
  });
});

describe('the subscription plumbing', () => {
  it('delivers to every listener and stops on unsubscribe', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = subscribeToToasts(a);
    const unsubscribeB = subscribeToToasts(b);

    showToast({ text: 'first', type: 'info' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    // A container remounting in development must not tear down its sibling.
    unsubscribeA();
    showToast({ text: 'second', type: 'info' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    unsubscribeB();
  });

  it('stamps a unique id and passes the caller fields through untouched', () => {
    const seen: ToastMessage[] = [];
    const unsubscribe = subscribeToToasts((msg) => seen.push(msg));

    showToast({
      text: 'Uploaded 2 files',
      type: 'success',
      subject: 'drive-upload',
      duration: 900,
    });
    showToast({
      text: 'Uploaded 2 files',
      type: 'success',
      subject: 'drive-upload',
      duration: 900,
    });

    expect(seen).toHaveLength(2);
    expect(seen[0].id).not.toBe(seen[1].id);
    expect(seen[0]).toMatchObject({
      text: 'Uploaded 2 files',
      type: 'success',
      subject: 'drive-upload',
      duration: 900,
    });

    unsubscribe();
  });
});
