// F-190: per-call write confirmation for the real mail/drive skills.
// - Tier-2 write tools (quantmail.send/...) are HELD by checkPermissions;
//   the held payload names the tool for the Sentinel approval card.
// - Denied plans cannot execute: confirm(approved:false) runs nothing, an
//   unknown/expired planId 404s, and a mismatched user 403s.
// - The real direct read handlers win over the generic HTTP pass-through
//   (non-clobbering registration): quantmail.search executes as the user's
//   validated handler, not as a raw HTTP forward.
import { describe, it, expect } from 'vitest';
import { getAgentGateway } from '../services/agent-gateway.service';
import type { ToolPlan } from '@quant/quant-tools';

function planWith(steps: Array<{ toolId: string; params: Record<string, unknown> }>): ToolPlan {
  return {
    id: `plan-test-${Date.now()}`,
    steps: steps.map((s, i) => ({
      stepId: `s${i}`,
      toolId: s.toolId,
      params: s.params,
      dependsOn: [],
      outputKey: `out${i}`,
    })),
    estimatedCost: 'free',
    requiredPermission: 2,
    description: 'test plan',
  };
}

describe('AgentGateway write confirmation (F-190)', () => {
  it('holds a tier-2 write plan and names the tool for the approval card', () => {
    const gw = getAgentGateway();
    const gate = gw.checkPermissions(
      planWith([{ toolId: 'quantmail.send', params: { to: 'a@b.c', subject: 'hi', body: 'x' } }]),
      2,
    );
    expect(gate.held).toBe(true);
    if (!gate.held) return;
    expect(typeof gate.planId).toBe('string');
    expect(gate.reason).toContain('confirmation');
    const step = gate.steps[0] as { toolId: string; toolName: string; params: unknown };
    expect(step.toolId).toBe('quantmail.send');
    // Human-facing name, not the raw toolId, for the Sentinel approval card.
    expect(step.toolName).toBe('Send Email');
    expect(step.toolName).not.toBe('quantmail.send');
  });

  it('does not hold a read-only plan', () => {
    const gw = getAgentGateway();
    const gate = gw.checkPermissions(
      planWith([{ toolId: 'quantmail.search', params: { query: 'invoice' } }]),
      2,
    );
    expect(gate).toEqual({ held: false });
  });

  it('denies tier-2 tools for tier-1 users outright', () => {
    const gw = getAgentGateway();
    expect(() =>
      gw.checkPermissions(
        planWith([{ toolId: 'quantdrive.upload', params: {} }]),
        1,
      ),
    ).toThrow(/TOOL_FORBIDDEN|Insufficient permissions/);
  });

  it('approved:false runs nothing and consumes the held plan', async () => {
    const gw = getAgentGateway();
    const gate = gw.checkPermissions(
      planWith([{ toolId: 'quantmail.send', params: { to: 'a@b.c' } }]),
      2,
    );
    expect(gate.held).toBe(true);
    if (!gate.held) return;
    gw.bindHeldPlan(gate.planId, 'user-1');
    const results = await gw.confirm(gate.planId, {
      userId: 'user-1',
      jwt: 'jwt',
      approved: false,
    });
    expect(results).toEqual([]);
    // Second use is gone: fail closed.
    const err = await gw
      .confirm(gate.planId, { userId: 'user-1', jwt: 'jwt', approved: true })
      .catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('PLAN_NOT_FOUND');
  });

  it('rejects a confirm from a different user', async () => {
    const gw = getAgentGateway();
    const gate = gw.checkPermissions(
      planWith([{ toolId: 'quantmail.archive', params: { messageId: 'm1' } }]),
      2,
    );
    expect(gate.held).toBe(true);
    if (!gate.held) return;
    gw.bindHeldPlan(gate.planId, 'user-1');
    const err = await gw
      .confirm(gate.planId, { userId: 'user-2', jwt: 'jwt', approved: true })
      .catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('PLAN_USER_MISMATCH');
  });

  it('404s on unknown planIds', async () => {
    const gw = getAgentGateway();
    const err = await gw
      .confirm('plan-nope-123', { userId: 'user-1', jwt: 'jwt', approved: true })
      .catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('PLAN_NOT_FOUND');
  });

  it('an approved held plan executes in dryRun without touching the network', async () => {
    const gw = getAgentGateway();
    const gate = gw.checkPermissions(
      planWith([{ toolId: 'quantmail.send', params: { to: 'a@b.c', subject: 's', body: 'b' } }]),
      2,
    );
    expect(gate.held).toBe(true);
    if (!gate.held) return;
    gw.bindHeldPlan(gate.planId, 'user-1');
    const results = await gw.confirm(gate.planId, {
      userId: 'user-1',
      jwt: 'jwt',
      dryRun: true,
      approved: true,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.toolId).toBe('quantmail.send');
  });
});

describe('AgentGateway real read handlers win over HTTP pass-through (F-190)', () => {
  it('registers genuine executors for the read skills', () => {
    const gw = getAgentGateway();
    for (const toolId of ['quantmail.search', 'quantmail.listUnread', 'quantmail.getMessage']) {
      expect(gw.getExecutor().hasHandler(toolId)).toBe(true);
    }
  });

  it('quantmail.search runs the validated direct handler, not the HTTP forward', async () => {
    const gw = getAgentGateway();
    // No JWT in context: the direct read handler refuses with its own honest
    // message ("quantmail tool refused: no caller JWT"); the generic HTTP
    // handler would say "Cannot execute ... missing user JWT". This proves
    // non-clobbering registration kept the real handler.
    const [result] = await gw.getExecutor().execute(
      planWith([{ toolId: 'quantmail.search', params: { query: 'invoice' } }]),
      { userId: 'user-1', sessionId: 's', permissions: 2, dryRun: false, metadata: {} },
    );
    expect(result!.success).toBe(false);
    expect(result!.error).toContain('no caller JWT');
  });
});
