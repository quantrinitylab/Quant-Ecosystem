import { describe, it, expect, vi } from 'vitest';
import { ProactiveSchedulerService } from '../services/proactive-scheduler.service';
import type { TypedQueue, ProactiveAgentJob } from '@quant/queue';

describe('ProactiveSchedulerService (BullMQ Background Queue)', () => {
  it('schedules a meeting call alert for QuantChat WebRTC bot', async () => {
    const service = new ProactiveSchedulerService();
    const alertTime = new Date(Date.now() + 300000); // 5 minutes in future

    const jobId = await service.scheduleMeetingCallAlert(
      'user-raj',
      'meeting-sync-101',
      alertTime,
      { topic: 'Sprint Architecture', caller: 'Quanty' },
    );

    expect(jobId).toMatch(/^call-alert-/);
    const jobs = service.getScheduledJobs('user-raj');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.jobType).toBe('meeting_call_alert');
    expect(jobs[0]?.targetApp).toBe('quantchat');
    expect(jobs[0]?.priority).toBe('urgent');
    expect(jobs[0]?.payload['meetingId']).toBe('meeting-sync-101');
  });

  it('schedules a delayed meeting reminder and lists active jobs', async () => {
    const service = new ProactiveSchedulerService();

    const jobId = await service.scheduleReminder('user-raj', 'quantcalendar', 60000, {
      eventTitle: 'Standup in 1 minute',
    });

    expect(jobId).toMatch(/^reminder-/);
    const jobs = service.getScheduledJobs('user-raj');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.jobType).toBe('meeting_reminder');
    expect(jobs[0]?.targetApp).toBe('quantcalendar');
  });

  it('cancels scheduled jobs successfully', async () => {
    const service = new ProactiveSchedulerService();

    const jobId = await service.scheduleDailyDigest('user-cancel', { includeEmails: true });
    expect(service.getScheduledJobs('user-cancel')).toHaveLength(1);

    const cancelled = service.cancelJob(jobId);
    expect(cancelled).toBe(true);
    expect(service.getScheduledJobs('user-cancel')).toHaveLength(0);
  });

  it('delegates to BullMQ TypedQueue when provided', async () => {
    const mockQueue = {
      add: vi.fn(async (_name: string, _data: ProactiveAgentJob, _opts?: unknown) => 'mock-job-id'),
    } as unknown as TypedQueue<ProactiveAgentJob>;

    const service = new ProactiveSchedulerService({ queue: mockQueue });

    const jobId = await service.scheduleMeetingCallAlert(
      'user-bullmq',
      'meet-456',
      new Date(Date.now() + 120000),
      { host: 'Astra' },
    );

    expect(mockQueue.add).toHaveBeenCalledWith(
      'meeting-call-alert',
      expect.objectContaining({
        jobType: 'meeting_call_alert',
        userId: 'user-bullmq',
        targetApp: 'quantchat',
        priority: 'urgent',
      }),
      expect.objectContaining({
        jobId,
        delay: expect.any(Number),
      }),
    );
  });
});
