import { describe, expect, it } from 'vitest';
import { TouchSwipeMachine } from '../lib/touch-swipe-machine';

/** Drive a straight horizontal drag from (0,0) to (x, 0). */
function drag(machine: TouchSwipeMachine, x: number, steps = 5): void {
  machine.touchstart(0, 0);
  for (let i = 1; i <= steps; i++) {
    machine.touchmove((x * i) / steps, 0);
  }
}

describe('TouchSwipeMachine', () => {
  it('commits archive when a right swipe crosses the 80px line', () => {
    const machine = new TouchSwipeMachine();
    drag(machine, 120);
    const snap = machine.snapshot;
    expect(snap.direction).toBe('archive');
    expect(snap.armed).toBe(true);
    expect(machine.touchend()).toBe('archive');
    expect(machine.consumeCommit()).toBe('archive');
  });

  it('commits delete when a left swipe crosses the 80px line', () => {
    const machine = new TouchSwipeMachine();
    drag(machine, -120);
    const snap = machine.snapshot;
    expect(snap.direction).toBe('delete');
    expect(snap.armed).toBe(true);
    expect(machine.touchend()).toBe('delete');
  });

  it('springs back below the threshold without firing any action', () => {
    const machine = new TouchSwipeMachine();
    drag(machine, 50);
    const snap = machine.snapshot;
    expect(snap.engaged).toBe(true);
    expect(snap.armed).toBe(false);
    expect(snap.offset).toBe(50);
    expect(machine.touchend()).toBeNull();
    const settled = machine.snapshot;
    expect(settled.offset).toBe(0);
    expect(settled.direction).toBeNull();
    expect(settled.phase).toBe('settling');
  });

  it('does not hijack a vertical scroll', () => {
    const machine = new TouchSwipeMachine();
    machine.touchstart(0, 0);
    // A thumb travelling down the list, slightly diagonal.
    machine.touchmove(6, 40);
    machine.touchmove(10, 90);
    const snap = machine.snapshot;
    expect(snap.engaged).toBe(false);
    expect(snap.offset).toBe(0);
    expect(machine.touchend()).toBeNull();
  });

  it('stays latched out once vertical intent wins, even if the finger turns', () => {
    const machine = new TouchSwipeMachine();
    machine.touchstart(0, 0);
    machine.touchmove(4, 30); // vertical wins → latched out
    machine.touchmove(120, 35); // finger curves hard right afterwards
    const snap = machine.snapshot;
    expect(snap.engaged).toBe(false);
    expect(snap.offset).toBe(0);
    expect(machine.touchend()).toBeNull();
  });

  it('claims the touch inside the intent lock (|dx| > |dy| * 1.2)', () => {
    const machine = new TouchSwipeMachine();
    machine.touchstart(0, 0);
    machine.touchmove(60, 30); // 60 > 30 * 1.2 → horizontal
    expect(machine.snapshot.engaged).toBe(true);
    expect(machine.snapshot.direction).toBe('archive');
  });

  it('ignores a second finger mid-gesture and releases the row', () => {
    const machine = new TouchSwipeMachine();
    machine.touchstart(0, 0);
    machine.touchmove(60, 0);
    expect(machine.snapshot.engaged).toBe(true);
    machine.touchmove(60, 0, 2); // pinch starts
    expect(machine.snapshot.offset).toBe(0);
    expect(machine.touchend()).toBeNull();
  });

  it('ticks the haptic exactly once when crossing the line upward', () => {
    const machine = new TouchSwipeMachine();
    machine.touchstart(0, 0);
    machine.touchmove(40, 0);
    expect(machine.consumeHaptic()).toBe(false);
    machine.touchmove(90, 0); // crosses 80
    expect(machine.consumeHaptic()).toBe(true);
    expect(machine.consumeHaptic()).toBe(false); // one-shot
    machine.touchmove(120, 0); // still armed, no second tick
    expect(machine.consumeHaptic()).toBe(false);
  });

  it('follows the finger 1:1 up to the travel cap', () => {
    const machine = new TouchSwipeMachine({ maxTravelPx: 160 });
    machine.touchstart(0, 0);
    machine.touchmove(100, 0);
    expect(machine.snapshot.offset).toBe(100);
    machine.touchmove(500, 0);
    expect(machine.snapshot.offset).toBe(160);
  });

  it('does not commit on a tap', () => {
    const machine = new TouchSwipeMachine();
    machine.touchstart(0, 0);
    machine.touchmove(2, 1);
    expect(machine.touchend()).toBeNull();
    expect(machine.snapshot.engaged).toBe(false);
  });

  it('resets on cancel', () => {
    const machine = new TouchSwipeMachine();
    drag(machine, 60);
    machine.touchcancel();
    expect(machine.snapshot.offset).toBe(0);
    expect(machine.snapshot.phase).toBe('settling');
  });

  it('touchend without a touchstart is a no-op', () => {
    const machine = new TouchSwipeMachine();
    expect(machine.touchend()).toBeNull();
  });
});
