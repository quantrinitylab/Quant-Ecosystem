// Quanty Next mapper — backend <-> frontend shape translation.
import { describe, it, expect } from 'vitest';
import {
  mapTask,
  mapStep,
  mapTaskStatus,
  mapStepStatus,
  mapPopupData,
  targetSelectorFor,
  translateStreamEvent,
  type BackendTask,
  type BackendPopupData,
} from '../quanty-mapper';

function backendTask(overrides: Partial<BackendTask> = {}): BackendTask {
  return {
    id: 'task-1',
    command: 'archive unread',
    status: 'running',
    planSummary: 'Archive all unread emails',
    steps: [],
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:01:00.000Z',
    ...overrides,
  };
}

describe('quanty-mapper', () => {
  it('maps task statuses to the frontend vocabulary', () => {
    expect(mapTaskStatus('planning')).toBe('thinking');
    expect(mapTaskStatus('running')).toBe('working');
    expect(mapTaskStatus('waiting-confirm')).toBe('waiting-confirm');
    expect(mapTaskStatus('done')).toBe('done');
    expect(mapTaskStatus('failed')).toBe('failed');
    // 'interrupted' has no frontend equivalent — surface as failed with the outcome.
    expect(mapTaskStatus('interrupted')).toBe('failed');
  });

  it('maps step statuses (failed -> error)', () => {
    expect(mapStepStatus('failed')).toBe('error');
    expect(mapStepStatus('done')).toBe('done');
    expect(mapStepStatus('waiting-confirm')).toBe('waiting-confirm');
  });

  it('mapTask drops backend-only fields and computes reversible/error', () => {
    const task = mapTask(
      backendTask({
        status: 'done',
        outcome: 'Archived 2 threads.',
        steps: [
          { id: 's1', toolName: 'mail.archiveUnread', label: 'Archiving', args: {}, status: 'done', reversible: true, endedAt: '2026-10-06T10:01:00.000Z' },
        ],
      }),
    );
    expect(task.status).toBe('done');
    expect(task.resultSummary).toBe('Archived 2 threads.');
    expect(task.reversible).toBe(true);
    expect(task.error).toBeUndefined();
    expect(task).not.toHaveProperty('userId');
    expect(task).not.toHaveProperty('planSummary');
  });

  it('mapTask surfaces failed/interrupted outcomes as errors', () => {
    const failed = mapTask(backendTask({ status: 'failed', outcome: 'Failed: boom' }));
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('Failed: boom');
    const interrupted = mapTask(backendTask({ status: 'interrupted', outcome: 'Interrupted by user.' }));
    expect(interrupted.error).toBe('Interrupted by user.');
  });

  it('mapStep derives the spotlight targetSelector from thread args', () => {
    const step = mapStep({
      id: 's1',
      toolName: 'mail.archiveThread',
      label: 'Archiving',
      args: { threadId: 't-123' },
      status: 'running',
      destructive: true,
    });
    expect(step.targetSelector).toBe('[data-thread-id="t-123"]');
    expect(step.destructive).toBe(true);
    expect(step.status).toBe('running');
  });

  it('targetSelectorFor handles git repos and unknown tools', () => {
    expect(targetSelectorFor('git.listPrs', { repoRef: 'my-repo' })).toBe('[data-repo="my-repo"]');
    expect(targetSelectorFor('mail.searchEmails', { query: 'x' })).toBeUndefined();
  });

  it('translateStreamEvent maps step.done with its summary as detail', () => {
    const out = translateStreamEvent(
      {
        type: 'step.done',
        taskId: 'task-1',
        step: { id: 's1', toolName: 'mail.archiveThread', label: 'Archiving', args: {}, status: 'done' },
        summary: 'Archived thread (2 messages).',
      },
      null,
    );
    expect(out?.type).toBe('step');
    if (out?.type === 'step') {
      expect(out.step.status).toBe('done');
      expect(out.step.detail).toBe('Archived thread (2 messages).');
    }
  });

  it('translateStreamEvent turns waiting-confirm into a consent-ready task snapshot', () => {
    const lastTask = backendTask({
      status: 'running',
      steps: [
        { id: 's1', toolName: 'mail.deleteSpam', label: 'Deleting spam', args: {}, status: 'pending', destructive: true },
      ],
    });
    const out = translateStreamEvent(
      { type: 'waiting-confirm', taskId: 'task-1', toolName: 'mail.deleteSpam', label: 'Deleting spam' },
      lastTask,
    );
    expect(out?.type).toBe('task');
    if (out?.type === 'task') {
      expect(out.task.status).toBe('waiting-confirm');
      expect(out.task.steps[0].status).toBe('waiting-confirm');
      expect(out.task.steps[0].destructive).toBe(true);
    }
  });

  it('translateStreamEvent maps terminal events to done snapshots', () => {
    const lastTask = backendTask({ status: 'running' });
    const done = translateStreamEvent({ type: 'task.done', taskId: 'task-1', outcome: 'Done. 1/1 steps completed.' }, lastTask);
    expect(done?.type).toBe('done');
    if (done?.type === 'done') {
      expect(done.task.status).toBe('done');
      expect(done.task.resultSummary).toBe('Done. 1/1 steps completed.');
    }
    const interrupted = translateStreamEvent({ type: 'task.interrupted', taskId: 'task-1' }, lastTask);
    if (interrupted?.type === 'done') {
      expect(interrupted.task.status).toBe('failed');
      expect(interrupted.task.error).toBe('Interrupted by user.');
    }
  });

  it('mapPopupData produces the frontend contract with honest empty states', () => {
    const backend: BackendPopupData = {
      status: { status: 'idle', detail: 'Waiting for your command' },
      activity: { today: [], yesterday: [], older: [] },
      approvals: [],
      browserTasks: [],
      schedule: {
        daily: [{ id: 'd1', name: 'Daily audit', type: 'daily', schedule: 'Daily at 09:41', nextRunAt: '2026-10-07T09:41:00' }],
        interval: [],
        weekly: [],
      },
      identity: {
        soul: { title: 'Quanty Soul', updatedAt: '2026-10-06T09:00:00Z' },
        memory: { title: 'Quanty Memory', updatedAt: '2026-10-06T09:00:00Z' },
      },
    };
    const popup = mapPopupData(backend);
    expect(popup.status).toBe('Quanty taiyaar hai');
    expect(popup.activity).toEqual([]);
    expect(popup.approvals).toEqual([]);
    expect(popup.schedule).toHaveLength(1);
    expect(popup.schedule[0]).toMatchObject({ id: 'd1', kind: 'daily', scheduleText: 'Daily at 09:41' });
    expect(popup.identity.soul.updatedAt).toBe('2026-10-06T09:00:00Z');
  });

  it('mapPopupData maps activity icons and live status detail', () => {
    const backend: BackendPopupData = {
      status: { status: 'is working', detail: 'Archiving unread emails' },
      activity: {
        today: [{ id: 'a1', icon: '📧', title: 'archive unread', description: 'Archived 2 threads.', timestamp: '2026-10-06T10:00:00Z' }],
        yesterday: [],
        older: [],
      },
      approvals: [],
      browserTasks: [],
      schedule: { daily: [], interval: [], weekly: [] },
      identity: {
        soul: { title: 's', updatedAt: '2026-10-06T09:00:00Z' },
        memory: { title: 'm', updatedAt: '2026-10-06T09:00:00Z' },
      },
    };
    const popup = mapPopupData(backend);
    expect(popup.status).toBe('Archiving unread emails');
    expect(popup.activity[0].icon).toBe('mail');
  });
});
