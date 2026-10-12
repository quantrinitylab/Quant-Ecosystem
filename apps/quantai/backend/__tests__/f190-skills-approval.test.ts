// ============================================================================
// QuantAI — F-190: real cross-app tools as first-class skills + per-call
// write confirmation.
//
// Honesty contract: no test may invent tools, tiers, or handlers. Every
// assertion is grounded in the real ToolDefinitions (packages/quant-tools),
// the real gateway executor wiring, and the real MCP catalog.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  PermissionEngine,
  allTools,
  type ToolPlan,
} from '@quant/quant-tools';
import { getAgentGateway } from '../services/agent-gateway.service';
import { MCP_CONNECTOR_CATALOG } from '../services/mcp-connectors.service';

/** Write tools: every call must be held for per-call approval (tier 2). */
const WRITE_TOOLS = [
  'quantmail.send',
  'quantmail.archive',
  'quantmail.label',
  'quantmail.draft',
  'quantdrive.upload',
  'quantdrive.share',
  'quantdrive.organize',
];

/** Read tools: auto-approved, no confirmation UX. */
const READ_TOOLS = [
  'quantmail.search',
  'quantmail.listUnread',
  'quantmail.getMessage',
  'quantdrive.download',
  'quantdrive.search',
];

/** Tools with a genuinely registered executor on the agent gateway. */
const EXECUTABLE_TOOLS = [
  'quantmail.search', // HTTP handler (gateway route)
  'quantmail.listUnread', // mail-read handler (F-190 wiring)
  'quantmail.getMessage', // mail-read handler (F-190 wiring)
  'quantmail.archive', // HTTP handler
  'quantmail.draft', // HTTP handler
  'quantmail.send', // HTTP handler
  'quantdrive.upload', // HTTP handler
];

function writePlan(toolId: string): ToolPlan {
  return {
    id: 'plan-test',
    steps: [
      {
        stepId: 's1',
        toolId,
        params: {},
        dependsOn: [],
        outputKey: 'out',
      },
    ],
    estimatedCost: 'free',
    requiredPermission: 2,
    description: 'test',
  };
}

describe('F-190: write tools demand per-call confirmation', () => {
  const engine = new PermissionEngine(allTools);

  it.each(WRITE_TOOLS)('write tool %s is tier 2 (Confirm)', (toolId) => {
    const tool = allTools.find((t) => t.id === toolId);
    expect(tool, `${toolId} must exist in allTools`).toBeDefined();
    expect(tool!.permissionTier).toBe(2);
  });

  it.each(WRITE_TOOLS)(
    'write tool %s is held for approval at user tier 2',
    (toolId) => {
      const verdict = engine.evaluate(toolId, 2);
      expect(verdict.allowed).toBe(true);
      expect(verdict.confirmationRequired).toBe(true);
    },
  );

  it.each(WRITE_TOOLS)(
    'write tool %s is denied (not silently auto-run) at user tier 1',
    (toolId) => {
      const verdict = engine.evaluate(toolId, 1);
      expect(verdict.allowed).toBe(false);
    },
  );

  it.each(READ_TOOLS)('read tool %s stays tier 0 (Auto)', (toolId) => {
    const tool = allTools.find((t) => t.id === toolId);
    expect(tool, `${toolId} must exist in allTools`).toBeDefined();
    expect(tool!.permissionTier).toBe(0);
    const verdict = engine.evaluate(toolId, 2);
    expect(verdict.allowed).toBe(true);
    expect(verdict.confirmationRequired).toBe(false);
  });

  it('tier-3 (Admin) boundary still holds at user tier 2', () => {
    const verdict = engine.evaluate('quantads.set-budget', 2);
    expect(verdict.allowed).toBe(false);
    expect(verdict.confirmationRequired).toBe(false);
  });
});

describe('F-190: gateway holds write plans for Sentinel approval', () => {
  const gateway = getAgentGateway();

  it('a plan containing quantmail.send is held (not executed)', () => {
    const gate = gateway.checkPermissions(writePlan('quantmail.send'));
    expect(gate.held).toBe(true);
    if (gate.held) {
      expect(gate.planId).toMatch(/^plan-/);
      expect(gate.steps).toHaveLength(1);
    }
  });

  it('a read-only plan is not held', () => {
    const gate = gateway.checkPermissions(writePlan('quantmail.search'));
    expect(gate.held).toBe(false);
  });

  it('a tier-3 step throws 403 instead of being held', () => {
    expect(() => gateway.checkPermissions(writePlan('quantads.set-budget'))).toThrow(
      /not allowed/,
    );
  });
});

describe('F-190: real tools are wired as executable skills', () => {
  const gateway = getAgentGateway();
  const executor = gateway.getExecutor();

  it.each(EXECUTABLE_TOOLS)('gateway executor has a live handler for %s', (toolId) => {
    expect(executor.hasHandler(toolId)).toBe(true);
  });

  it('quantmail.label has no executor (honestly unwired, planned only)', () => {
    expect(executor.hasHandler('quantmail.label')).toBe(false);
  });

  it('mail-read handlers are registered (listUnread/getMessage are real)', () => {
    // These come from registerMailReadHandlers (F-190 wiring), not HTTP routes:
    // app-endpoints.ts has no routes for them, yet they must execute.
    expect(executor.hasHandler('quantmail.listUnread')).toBe(true);
    expect(executor.hasHandler('quantmail.getMessage')).toBe(true);
  });
});

describe('F-190: catalog advertises only executable tools as live', () => {
  const executor = getAgentGateway().getExecutor();

  it('quantmail supportedTools are all executable; label is planned', () => {
    const entry = MCP_CONNECTOR_CATALOG.find((c) => c.id === 'quantmail');
    expect(entry).toBeDefined();
    expect(entry!.toolCount).toBe(entry!.supportedTools.length);
    for (const toolId of entry!.supportedTools) {
      expect(
        executor.hasHandler(toolId),
        `${toolId} advertised as live but has no executor`,
      ).toBe(true);
    }
    expect(entry!.plannedTools).toContain('quantmail.label');
    expect(entry!.supportedTools).not.toContain('quantmail.label');
  });

  it('quantdrive supportedTools are all executable; the rest are planned', () => {
    const entry = MCP_CONNECTOR_CATALOG.find((c) => c.id === 'quantdrive');
    expect(entry).toBeDefined();
    expect(entry!.toolCount).toBe(entry!.supportedTools.length);
    for (const toolId of entry!.supportedTools) {
      expect(
        executor.hasHandler(toolId),
        `${toolId} advertised as live but has no executor`,
      ).toBe(true);
    }
    for (const planned of [
      'quantdrive.download',
      'quantdrive.share',
      'quantdrive.organize',
      'quantdrive.search',
    ]) {
      expect(entry!.plannedTools).toContain(planned);
      expect(entry!.supportedTools).not.toContain(planned);
    }
  });

  it('no snake_case phantom names remain in any live supportedTools list', () => {
    for (const entry of MCP_CONNECTOR_CATALOG) {
      if (entry.availability !== 'live') continue;
      for (const toolId of entry.supportedTools) {
        expect(
          toolId,
          `phantom snake_case tool ${toolId} in ${entry.id} supportedTools`,
        ).not.toMatch(/^(quantmail|quantdrive)_[a-z_]+$/);
      }
    }
  });
});
