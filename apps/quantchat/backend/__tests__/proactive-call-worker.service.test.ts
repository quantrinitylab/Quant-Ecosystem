import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProactiveCallWorker } from '../services/proactive-call-worker.service';
import type { CallRingGeneratorService } from '../services/call-ring-generator.service';
import type { ProactiveAgentJob } from '@quant/queue';

describe('ProactiveCallWorker (Task VC-02)', () => {
  let mockRingGenerator: CallRingGeneratorService;
  let triggeredAlerts: unknown[];

  beforeEach(() => {
    triggeredAlerts = [];
    mockRingGenerator = {
      triggerMeetingCallAlert: vi.fn(async (payload) => {
        triggeredAlerts.push(payload);
        return {} as any;
      }),
    } as unknown as CallRingGeneratorService;
  });

  it('processes meeting_call_alert job and triggers outbound ring alert', async () => {
    const worker = new ProactiveCallWorker({
      ringGenerator: mockRingGenerator,
    });

    const job: ProactiveAgentJob = {
      jobType: 'meeting_call_alert',
      userId: 'user-vip',
      targetApp: 'quantchat',
      scheduledFor: new Date().toISOString(),
      priority: 'urgent',
      payload: {
        meetingId: 'mtg-q3-sync',
        title: 'Q3 Board Review',
        organizer: 'Raj',
        minutesUntilStart: 5,
        userName: 'Astra',
        locale: 'hinglish',
      },
    };

    const handled = await worker.processJob(job);

    expect(handled).toBe(true);
    expect(mockRingGenerator.triggerMeetingCallAlert).toHaveBeenCalledTimes(1);
    expect(triggeredAlerts).toHaveLength(1);
    expect(triggeredAlerts[0]).toMatchObject({
      userId: 'user-vip',
      meetingId: 'mtg-q3-sync',
      title: 'Q3 Board Review',
      organizer: 'Raj',
      minutesUntilStart: 5,
      userName: 'Astra',
      locale: 'hinglish',
    });
  });

  it('ignores non-meeting-call-alert job types', async () => {
    const worker = new ProactiveCallWorker({
      ringGenerator: mockRingGenerator,
    });

    const job: ProactiveAgentJob = {
      jobType: 'daily_digest',
      userId: 'user-vip',
      targetApp: 'quantchat',
      scheduledFor: new Date().toISOString(),
      priority: 'normal',
      payload: {},
    };

    const handled = await worker.processJob(job);

    expect(handled).toBe(false);
    expect(mockRingGenerator.triggerMeetingCallAlert).not.toHaveBeenCalled();
  });

  it('ignores jobs targeted to other apps', async () => {
    const worker = new ProactiveCallWorker({
      ringGenerator: mockRingGenerator,
    });

    const job: ProactiveAgentJob = {
      jobType: 'meeting_call_alert',
      userId: 'user-vip',
      targetApp: 'quantmail',
      scheduledFor: new Date().toISOString(),
      priority: 'urgent',
      payload: {
        title: 'Mail Sync',
      },
    };

    const handled = await worker.processJob(job);

    expect(handled).toBe(false);
    expect(mockRingGenerator.triggerMeetingCallAlert).not.toHaveBeenCalled();
  });

  it('manages start and stop lifecycle', async () => {
    const worker = new ProactiveCallWorker({
      ringGenerator: mockRingGenerator,
    });

    expect(worker.active).toBe(false);
    worker.start();
    expect(worker.active).toBe(true);
    await worker.stop();
    expect(worker.active).toBe(false);
  });
});
