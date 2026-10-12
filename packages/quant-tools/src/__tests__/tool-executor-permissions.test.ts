import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutor } from '../executor/tool-executor.js';
import { PermissionEngine } from '../permissions/permission-engine.js';
import { allTools } from '../tools/index.js';
import type { ToolExecutionContext } from '../types.js';

function ctx(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    userId: 'user1',
    sessionId: 'sess-1',
    permissions: 1,
    dryRun: false,
    ...overrides,
  };
}

describe('ToolExecutor permission enforcement (defense in depth)', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = new ToolExecutor();
    executor.registerHandler('quantmail.search', async () => ({ messages: [] }));
  });

  it('legacy behavior: no enforcement when no PermissionEngine is set', async () => {
    // quantmeet.record is tier 2 — executes fine without enforcement (old path).
    executor.registerHandler('quantmeet.record', async () => ({ recorded: true }));
    const result = await executor.executeSingle('quantmeet.record', {}, ctx());
    expect(result.success).toBe(true);
  });

  it('allows tier-0 tools for tier-0 users', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    const result = await executor.executeSingle('quantmail.search', { q: 'x' }, ctx({ permissions: 0 }));
    expect(result.success).toBe(true);
  });

  it('refuses tier-2 tools without Sentinel confirmation (fail-closed)', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    executor.registerHandler('quantmeet.record', async () => ({ recorded: true }));
    const result = await executor.executeSingle('quantmeet.record', {}, ctx({ permissions: 2 }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('CONFIRMATION_REQUIRED');
  });

  it('executes tier-2 tools when the approval proof is present', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    executor.registerHandler('quantmeet.record', async () => ({ recorded: true }));
    const result = await executor.executeSingle(
      'quantmeet.record',
      {},
      ctx({ permissions: 2, confirmedToolIds: ['quantmeet.record'] }),
    );
    expect(result.success).toBe(true);
  });

  it('refuses tier-3 tools for insufficient user tier (403 semantics)', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    // quantads.set-budget is tier 3.
    const result = await executor.executeSingle('quantads.set-budget', {}, ctx({ permissions: 1 }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('TOOL_FORBIDDEN');
    expect(result.error).toContain('tier 3');
  });

  it('allows tier-3 tools for tier-3 users with approval proof', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    executor.registerHandler('quantads.set-budget', async () => ({ set: true }));
    const result = await executor.executeSingle(
      'quantads.set-budget',
      {},
      ctx({ permissions: 3, confirmedToolIds: ['quantads.set-budget'] }),
    );
    expect(result.success).toBe(true);
  });

  it('refuses unknown tools even for high tiers', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    const result = await executor.executeSingle('nope.tool', {}, ctx({ permissions: 3 }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('TOOL_FORBIDDEN');
  });

  it('enforces tiers even in dry-run mode (fail-closed)', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    const result = await executor.executeSingle(
      'quantmeet.record',
      {},
      ctx({ permissions: 2, dryRun: true }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('CONFIRMATION_REQUIRED');
  });

  it('does not leak approval across different tools', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    executor.registerHandler('quantmeet.record', async () => ({ recorded: true }));
    // Approval was for quantmail.search, not quantmeet.record.
    const result = await executor.executeSingle(
      'quantmeet.record',
      {},
      ctx({ permissions: 2, confirmedToolIds: ['quantmail.search'] }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('CONFIRMATION_REQUIRED');
  });

  it('audit trail records enforcement refusals', async () => {
    executor.setPermissionEngine(new PermissionEngine(allTools));
    await executor.executeSingle('quantmeet.record', {}, ctx({ permissions: 2 }));
    const entries = executor.getAuditEntries();
    const failure = entries.find((e) => e.action === 'failure');
    expect(failure).toBeDefined();
    expect(String(failure?.details?.error)).toContain('CONFIRMATION_REQUIRED');
  });
});
