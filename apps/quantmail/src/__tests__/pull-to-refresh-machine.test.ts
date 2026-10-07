import { describe, expect, it } from 'vitest';
import { PullToRefreshMachine } from '../lib/pull-to-refresh-machine';

/** Simulate a downward pull from (50,100) to (50,100+pull) at scrollTop 0. */
function pull(machine: PullToRefreshMachine, pull: number, scrollTop = 0): void {
  machine.touchstart(scrollTop, 50, 100);
  machine.touchmove(50, 100 + pull);
}

describe('PullToRefreshMachine', () => {
  it('never arms when the list is not scrolled to the top', () => {
    const machine = new PullToRefreshMachine();
    machine.touchstart(240, 50, 100);
    machine.touchmove(50, 400);
    const snap = machine.snapshot;
    expect(snap.phase).toBe('idle');
    expect(snap.pullDistance).toBe(0);
    expect(machine.touchend()).toBe(false);
  });

  it('tracks the pull with resistance below the release line', () => {
    const machine = new PullToRefreshMachine();
    pull(machine, 80);
    const snap = machine.snapshot;
    expect(snap.phase).toBe('pulling');
    // 80 * 0.45 resistance = 36, below the 56 release line
    expect(snap.pullDistance).toBeCloseTo(36, 5);
    expect(snap.canRelease).toBe(false);
    expect(machine.touchend()).toBe(false);
    expect(machine.snapshot.phase).toBe('idle');
  });

  it('fires exactly one refresh when released past the line', () => {
    const machine = new PullToRefreshMachine();
    pull(machine, 200); // 200 * 0.45 = 90 > 56
    expect(machine.snapshot.canRelease).toBe(true);
    expect(machine.touchend()).toBe(true);
    expect(machine.snapshot.phase).toBe('refreshing');
    // A second touchend cannot double-fire.
    expect(machine.touchend()).toBe(false);
  });

  it('caps the indicator travel', () => {
    const machine = new PullToRefreshMachine();
    pull(machine, 1000);
    expect(machine.snapshot.pullDistance).toBe(84);
  });

  it('folds the indicator when the finger moves back up', () => {
    const machine = new PullToRefreshMachine();
    machine.touchstart(0, 50, 100);
    machine.touchmove(50, 200);
    expect(machine.snapshot.pullDistance).toBeGreaterThan(0);
    machine.touchmove(50, 90); // back above the start
    expect(machine.snapshot.pullDistance).toBe(0);
    expect(machine.touchend()).toBe(false);
  });

  it('folds on cancel', () => {
    const machine = new PullToRefreshMachine();
    pull(machine, 150);
    machine.touchcancel();
    expect(machine.snapshot.phase).toBe('idle');
    expect(machine.snapshot.pullDistance).toBe(0);
  });

  it('complete() returns the machine to idle after a refresh', () => {
    const machine = new PullToRefreshMachine();
    pull(machine, 200);
    expect(machine.touchend()).toBe(true);
    machine.complete();
    const snap = machine.snapshot;
    expect(snap.phase).toBe('idle');
    expect(snap.pullDistance).toBe(0);
  });

  it('a second finger folds the indicator instead of tracking half a gesture', () => {
    const machine = new PullToRefreshMachine();
    machine.touchstart(0, 50, 100);
    machine.touchmove(50, 200, 2);
    expect(machine.snapshot.phase).toBe('idle');
    expect(machine.snapshot.pullDistance).toBe(0);
  });

  it('latches out when horizontal intent wins — a row swipe never refreshes', () => {
    const machine = new PullToRefreshMachine();
    machine.touchstart(0, 50, 100);
    // A leftward row swipe with a slight downward drift: horizontal dominates.
    machine.touchmove(20, 106); // dx=-30, dy=6 → 30 > 6*1.2 → latched out
    const snap = machine.snapshot;
    expect(snap.phase).toBe('idle');
    expect(snap.pullDistance).toBe(0);
    // Even if the finger then drags far down, the pull stays dead.
    machine.touchmove(20, 400);
    expect(machine.snapshot.pullDistance).toBe(0);
    expect(machine.touchend()).toBe(false);
  });

  it('ignores mostly-horizontal drift below the latch threshold', () => {
    const machine = new PullToRefreshMachine();
    machine.touchstart(0, 50, 100);
    // Small diagonal wobble: not enough horizontal travel to latch out, but
    // also not vertically dominant — accumulates nothing.
    machine.touchmove(56, 104); // dx=6, dy=4
    expect(machine.snapshot.pullDistance).toBe(0);
    expect(machine.snapshot.phase).toBe('pulling');
  });
});
