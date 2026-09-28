import { describe, it, expect, vi } from 'vitest';
import {
  AutoEditSchedulerService,
  type AutoEditPreferenceRow,
  type OrchestratorPort,
} from '../services/auto-edit-scheduler.service';

function prismaWith(prefs: AutoEditPreferenceRow[]) {
  return {
    autoEditPreference: {
      findMany: async (args: { where?: Record<string, unknown> }) =>
        prefs.filter((p) => (args.where?.['enabled'] === true ? p.enabled : true)),
    },
  };
}

function pref(over: Partial<AutoEditPreferenceRow>): AutoEditPreferenceRow {
  return {
    userId: over.userId ?? 'u1',
    enabled: over.enabled ?? true,
    sourceRef: over.sourceRef ?? null,
    templateId: over.templateId ?? null,
    caption: over.caption ?? null,
  };
}

describe('AutoEditSchedulerService', () => {
  it('rejects a malformed utcDay', async () => {
    const orch: OrchestratorPort = { runDaily: async () => ({ status: 'completed' }) };
    const svc = new AutoEditSchedulerService(prismaWith([]) as never, orch);
    await expect(svc.runDaily('2026/07/01')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('runs the orchestrator for each opted-in user', async () => {
    const seen: string[] = [];
    const orch: OrchestratorPort = {
      runDaily: async (userId) => {
        seen.push(userId);
        return { status: 'completed' };
      },
    };
    const svc = new AutoEditSchedulerService(
      prismaWith([pref({ userId: 'alice' }), pref({ userId: 'bob' })]) as never,
      orch,
    );
    const summary = await svc.runDaily('2026-07-01');
    expect(summary).toMatchObject({ usersConsidered: 2, completed: 2, failed: 0 });
    expect(seen.sort()).toEqual(['alice', 'bob']);
  });

  it('passes the user preference defaults into the orchestrator', async () => {
    const orch: OrchestratorPort = {
      runDaily: vi.fn(async () => ({ status: 'completed' as const })),
    };
    const svc = new AutoEditSchedulerService(
      prismaWith([pref({ userId: 'alice', sourceRef: 'asset-1', caption: 'daily' })]) as never,
      orch,
    );
    await svc.runDaily('2026-07-01');
    expect(orch.runDaily).toHaveBeenCalledWith('alice', {
      utcDay: '2026-07-01',
      sourceRef: 'asset-1',
      caption: 'daily',
    });
  });

  it('counts a failed-status run as failed', async () => {
    const orch: OrchestratorPort = { runDaily: async () => ({ status: 'failed' }) };
    const svc = new AutoEditSchedulerService(prismaWith([pref({ userId: 'a' })]) as never, orch);
    const summary = await svc.runDaily('2026-07-01');
    expect(summary).toMatchObject({ completed: 0, failed: 1 });
  });

  it('is fail-soft: one thrown run does not abort the batch', async () => {
    const orch: OrchestratorPort = {
      runDaily: async (userId) => {
        if (userId === 'a') throw new Error('boom');
        return { status: 'completed' };
      },
    };
    const svc = new AutoEditSchedulerService(
      prismaWith([pref({ userId: 'a' }), pref({ userId: 'b' })]) as never,
      orch,
    );
    const summary = await svc.runDaily('2026-07-01');
    expect(summary).toMatchObject({ usersConsidered: 2, completed: 1, failed: 1 });
  });
});
