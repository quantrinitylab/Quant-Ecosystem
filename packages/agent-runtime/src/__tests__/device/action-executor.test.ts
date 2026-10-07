import { describe, it, expect } from 'vitest';
import { ActionExecutor } from '../../device/action-executor.js';

describe('ActionExecutor', () => {
  it('executes tap action', async () => {
    const executor = new ActionExecutor();
    const result = await executor.tap(100, 200);
    expect(result.success).toBe(true);
    expect(result.action).toContain('tap(100, 200)');
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('executes swipe action', async () => {
    const executor = new ActionExecutor();
    const result = await executor.swipe({ x: 0, y: 0 }, { x: 100, y: 100 }, 500);
    expect(result.success).toBe(true);
    expect(result.action).toContain('swipe');
    expect(result.action).toContain('500ms');
  });

  it('executes type action', async () => {
    const executor = new ActionExecutor();
    const result = await executor.type('Hello World');
    expect(result.success).toBe(true);
    expect(result.action).toContain('type("Hello World")');
  });

  it('executes scroll action', async () => {
    const executor = new ActionExecutor();
    const result = await executor.scroll('down', 3);
    expect(result.success).toBe(true);
    expect(result.action).toContain('scroll(down, 3)');
  });

  it('executes long press action', async () => {
    const executor = new ActionExecutor();
    const result = await executor.longPress(50, 75, 1000);
    expect(result.success).toBe(true);
    expect(result.action).toContain('longPress(50, 75, 1000ms)');
  });

  it('maintains action log', async () => {
    const executor = new ActionExecutor();
    await executor.tap(10, 20);
    await executor.type('test');
    await executor.scroll('up');

    const log = executor.getActionLog();
    expect(log).toHaveLength(3);
    expect(log[0]!.action).toContain('tap');
    expect(log[1]!.action).toContain('type');
    expect(log[2]!.action).toContain('scroll');
  });

  it('clears action log', async () => {
    const executor = new ActionExecutor();
    await executor.tap(10, 20);
    executor.clearLog();
    expect(executor.getActionLog()).toHaveLength(0);
  });
});
