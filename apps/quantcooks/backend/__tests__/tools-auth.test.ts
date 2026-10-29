// ============================================================================
// CP-1 — invoke-pipeline discipline (§13.3/§13.4): delegation claims
// refuse DELEGATION_NOT_CONFIGURED (CP-3 is not in this unit), tier-2
// agent-surface invokes require confirmation with the quote attached,
// UI/REST invokes are the user's own hands, and job reads are
// owner-scoped (404, never 403, never data).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createToolsTestRig, expectCode, userCtx, OTHER } from './tools-test-rig';

describe('delegation (§7.1/§8 — CP-3 not in this unit)', () => {
  it('an invoke claiming an agentId refuses 401 DELEGATION_NOT_CONFIGURED', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.list_projects', {}, userCtx({ surface: 'quantai', agentId: 'agent-7' })),
      'DELEGATION_NOT_CONFIGURED',
      401,
    );
  });

  it('an invoke claiming a delegationId refuses the same way, on any surface', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.list_projects', {}, userCtx({ surface: 'mcp', delegationId: 'del-1' })),
      'DELEGATION_NOT_CONFIGURED',
      401,
    );
    await expectCode(
      rig.registry.invoke('quantcooks.list_projects', {}, userCtx({ surface: 'cli', agentId: 'mcp-host' })),
      'DELEGATION_NOT_CONFIGURED',
      401,
    );
  });

  it('the refusal precedes validation and execution (no job, no audit success)', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.invoke('quantcooks.export_project', { projectId: 'p' }, userCtx({ surface: 'mcp', agentId: 'h' })),
      'DELEGATION_NOT_CONFIGURED',
      401,
    );
    expect(rig.jobFake.rows).toHaveLength(0);
    const record = rig.auditLog.records.at(-1);
    expect(record?.outcome).not.toBe('success');
    expect(record?.errorCode).toBe('DELEGATION_NOT_CONFIGURED');
  });

  it('an agent-surface context with NO claim is the user’s own session — allowed', async () => {
    const rig = createToolsTestRig();
    const result = await rig.registry.invoke(
      'quantcooks.list_projects', {}, userCtx({ surface: 'quantai' }),
    );
    expect(result['tool']).toBe('quantcooks.list_projects');
  });
});

describe('tier-2 confirmation (§7.4)', () => {
  async function rigWithJob() {
    const rig = createToolsTestRig();
    const invoked = await rig.registry.invoke(
      'quantcooks.export_project', { projectId: 'p1' }, userCtx(),
    );
    const jobId = (invoked['job'] as { id: string }).id;
    return { rig, jobId };
  }

  it('agent surface, tier-2, unconfirmed → 409 CONFIRMATION_REQUIRED with the quote attached', async () => {
    const { rig, jobId } = await rigWithJob();
    try {
      await rig.registry.invoke(
        'quantcooks.cancel_job', { jobId }, userCtx({ surface: 'quantai' }),
      );
      throw new Error('invoke should have refused');
    } catch (err) {
      const e = err as { code?: string; statusCode?: number; details?: { quote?: unknown } };
      expect(e.code).toBe('CONFIRMATION_REQUIRED');
      expect(e.statusCode).toBe(409);
      expect(e.details?.quote).toBeTruthy();
      expect((e.details?.quote as { credits?: number }).credits).toBe(0);
    }
    // Nothing was cancelled by the refused invoke.
    const status = await rig.registry.invoke(
      'quantcooks.get_job_status', { jobId }, userCtx(),
    );
    expect((status['job'] as { status: string }).status).toBe('QUEUED');
  });

  it('agent surface, tier-2, confirmed → proceeds', async () => {
    const { rig, jobId } = await rigWithJob();
    const result = await rig.registry.invoke(
      'quantcooks.cancel_job',
      { jobId },
      userCtx({ surface: 'quantai', confirmedToolIds: ['quantcooks.cancel_job'] }),
    );
    expect((result['job'] as { status: string }).status).toBe('FAILED');
    expect((result['job'] as { error: string | null }).error).toBe('USER_CANCELLED');
  });

  it('UI surface, tier-2, no confirmation list → proceeds (the surface owns its UX)', async () => {
    const { rig, jobId } = await rigWithJob();
    const result = await rig.registry.invoke(
      'quantcooks.cancel_job', { jobId }, userCtx({ surface: 'ui' }),
    );
    expect((result['job'] as { status: string }).status).toBe('FAILED');
  });

  it('tier-0/1 agent-surface invokes need no confirmation', async () => {
    const rig = createToolsTestRig();
    const result = await rig.registry.invoke(
      'quantcooks.list_projects', {}, userCtx({ surface: 'quantai' }),
    );
    expect(result['tool']).toBe('quantcooks.list_projects');
  });
});

describe('owner scoping through the registry', () => {
  it('another user’s job via get_job_status → 404 JOB_NOT_FOUND', async () => {
    const rig = createToolsTestRig();
    const invoked = await rig.registry.invoke(
      'quantcooks.export_project', { projectId: 'p1' }, userCtx(),
    );
    const jobId = (invoked['job'] as { id: string }).id;
    await expectCode(
      rig.registry.invoke('quantcooks.get_job_status', { jobId }, userCtx({ actorUserId: OTHER })),
      'JOB_NOT_FOUND',
      404,
    );
  });
});
