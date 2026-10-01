// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import {
  ProactiveReminderWorker,
  type ReminderWorkerPrisma,
  type ReminderUserRecord,
} from '../services/proactive-reminder-worker.service';
import type { ProactiveAgentJob } from '@quant/queue';
import type { SesSendOptions } from '../lib/ses-sender';

function makeReminderJob(overrides: Partial<ProactiveAgentJob> = {}): ProactiveAgentJob {
  return {
    jobType: 'meeting_reminder',
    userId: 'user-1',
    targetApp: 'quantmail',
    scheduledFor: '2026-09-15T09:50:00.000Z',
    priority: 'normal',
    payload: {
      eventId: 'evt-1',
      title: 'Board Review',
      startTime: '2026-09-15T10:00:00.000Z',
      minutesUntilStart: 10,
      reminderType: 'push',
      location: 'Room A',
    },
    ...overrides,
  };
}

function makeEmailReminderJob(): ProactiveAgentJob {
  return makeReminderJob({
    payload: {
      eventId: 'evt-1',
      title: 'Board Review',
      startTime: '2026-09-15T10:00:00.000Z',
      minutesUntilStart: 10,
      reminderType: 'email',
      location: 'Room A',
    },
  });
}

interface Harness {
  prisma: ReminderWorkerPrisma;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeHarness(
  user: ReminderUserRecord | null,
  createImpl?: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>,
): Harness {
  const findUnique = vi.fn(async () => user);
  const create = vi.fn(
    createImpl ??
      (async ({ data }: { data: Record<string, unknown> }) => ({ id: String(data['id']) })),
  );
  const update = vi.fn(async () => ({}));
  const prisma = {
    user: { findUnique },
    notification: { create, update },
  } as unknown as ReminderWorkerPrisma;
  return { prisma, findUnique, create, update };
}

describe('ProactiveReminderWorker.processJob', () => {
  it('ignores jobs addressed to another app without touching prisma', async () => {
    const { prisma, findUnique } = makeHarness({
      id: 'user-1',
      email: 'u@quantmail.app',
      displayName: 'U',
    });
    const worker = new ProactiveReminderWorker({ prisma, isSesConfigured: () => false });

    const result = await worker.processJob(makeReminderJob({ targetApp: 'quantchat' }));

    expect(result).toBe('ignored_wrong_target');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('drops a reminder when the user cannot be resolved from prisma', async () => {
    const { prisma, create } = makeHarness(null);
    const worker = new ProactiveReminderWorker({ prisma, isSesConfigured: () => false });

    const result = await worker.processJob(makeReminderJob());

    expect(result).toBe('user_not_found');
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a durable in-app Notification for a meeting_reminder', async () => {
    const { prisma, create } = makeHarness({ id: 'user-1', email: null, displayName: 'Dana' });
    const worker = new ProactiveReminderWorker({ prisma, isSesConfigured: () => false });

    const result = await worker.processJob(makeReminderJob());

    expect(result).toBe('created');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'rem_evt-1_10_push',
        userId: 'user-1',
        type: 'calendar_reminder',
        sourceApp: 'quantmail',
        sourceEntityId: 'evt-1',
        priority: 'NORMAL',
      }),
    });
  });

  it('treats a unique-violation (P2002) as already-delivered and never re-sends', async () => {
    const sendViaSes = vi.fn(async (_opts: SesSendOptions): Promise<string> => 'ses-id');
    const { prisma } = makeHarness(
      { id: 'user-1', email: 'u@quantmail.app', displayName: 'U' },
      async () => {
        throw { code: 'P2002' };
      },
    );
    const worker = new ProactiveReminderWorker({ prisma, sendViaSes, isSesConfigured: () => true });

    const result = await worker.processJob(makeEmailReminderJob());

    expect(result).toBe('already_delivered');
    expect(sendViaSes).not.toHaveBeenCalled();
  });

  it('emails via SES using the prisma-resolved address (never the payload)', async () => {
    const sendViaSes = vi.fn(async (_opts: SesSendOptions): Promise<string> => 'ses-id');
    const { prisma, update } = makeHarness({
      id: 'user-1',
      email: 'real@quantmail.app',
      displayName: 'Real User',
    });
    const worker = new ProactiveReminderWorker({ prisma, sendViaSes, isSesConfigured: () => true });

    const job = makeEmailReminderJob();
    // A forged recipient in the (untrusted) payload must be ignored entirely.
    job.payload['email'] = 'attacker@evil.example';

    const result = await worker.processJob(job);

    expect(result).toBe('created');
    expect(sendViaSes).toHaveBeenCalledTimes(1);
    expect(sendViaSes).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['real@quantmail.app'] }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'rem_evt-1_10_email' },
      data: { sentVia: ['email'] },
    });
  });

  it('does not call SES for an email reminder when SES is unconfigured (notification only)', async () => {
    const sendViaSes = vi.fn(async (_opts: SesSendOptions): Promise<string> => 'ses-id');
    const { prisma, create } = makeHarness({
      id: 'user-1',
      email: 'real@quantmail.app',
      displayName: 'U',
    });
    const worker = new ProactiveReminderWorker({ prisma, sendViaSes, isSesConfigured: () => false });

    const result = await worker.processJob(makeEmailReminderJob());

    expect(result).toBe('created');
    expect(create).toHaveBeenCalledTimes(1);
    expect(sendViaSes).not.toHaveBeenCalled();
  });

  it('does not email a push reminder even when SES is configured', async () => {
    const sendViaSes = vi.fn(async (_opts: SesSendOptions): Promise<string> => 'ses-id');
    const { prisma } = makeHarness({
      id: 'user-1',
      email: 'real@quantmail.app',
      displayName: 'U',
    });
    const worker = new ProactiveReminderWorker({ prisma, sendViaSes, isSesConfigured: () => true });

    const result = await worker.processJob(makeReminderJob());

    expect(result).toBe('created');
    expect(sendViaSes).not.toHaveBeenCalled();
  });
});

