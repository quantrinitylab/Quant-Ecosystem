import {
  createTypedWorker,
  ProactiveAgentJobSchema,
  type ProactiveAgentJob,
  type TypedJob,
  type Worker,
} from '@quant/queue';
import { CallRingGeneratorService, type RingCallPayload } from './call-ring-generator.service';

export interface ProactiveCallWorkerOptions {
  redisUrl?: string;
  ringGenerator: CallRingGeneratorService;
  onError?: (error: Error) => void;
  concurrency?: number;
}

export class ProactiveCallWorker {
  private worker: Worker | null = null;
  private readonly ringGenerator: CallRingGeneratorService;
  private readonly redisUrl?: string;
  private readonly onError?: (error: Error) => void;
  private readonly concurrency: number;
  private isRunning = false;

  constructor(options: ProactiveCallWorkerOptions) {
    this.ringGenerator = options.ringGenerator;
    this.redisUrl = options.redisUrl || process.env['REDIS_URL'];
    this.onError = options.onError;
    this.concurrency = options.concurrency || 5;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    if (!this.redisUrl) {
      // Offline/test mode: worker stays ready for programmatic dispatch
      return;
    }

    try {
      const parsed = new URL(this.redisUrl);
      this.worker = createTypedWorker<ProactiveAgentJob>(
        'quant:proactive-jobs',
        ProactiveAgentJobSchema,
        async (job: TypedJob<ProactiveAgentJob>) => {
          await this.processJob(job.data);
        },
        {
          connection: {
            host: parsed.hostname || '127.0.0.1',
            port: parseInt(parsed.port, 10) || 6379,
            maxRetriesPerRequest: 1,
          },
          concurrency: this.concurrency,
        },
      );

      this.worker.on('error', (err: Error) => {
        this.onError?.(err);
      });
    } catch (err) {
      this.onError?.(err as Error);
      this.worker = null;
    }
  }

  async processJob(job: ProactiveAgentJob): Promise<boolean> {
    if (job.jobType !== 'meeting_call_alert') {
      return false;
    }

    if (job.targetApp !== 'quantchat' && job.targetApp !== 'all') {
      return false;
    }

    const payload = job.payload;
    const ringPayload: RingCallPayload = {
      userId: job.userId,
      meetingId: String(payload['meetingId'] || `mtg_${Date.now()}`),
      title: String(payload['title'] || 'Upcoming Meeting'),
      organizer: String(payload['organizer'] || 'Meeting Host'),
      startTime: String(payload['startTime'] || job.scheduledFor),
      minutesUntilStart: Number(payload['minutesUntilStart']) || 5,
      userName: payload['userName'] ? String(payload['userName']) : undefined,
      locale: (payload['locale'] as 'en' | 'hi' | 'hinglish') || 'hinglish',
      joinUrl: payload['joinUrl'] ? String(payload['joinUrl']) : undefined,
    };

    await this.ringGenerator.triggerMeetingCallAlert(ringPayload);
    return true;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  get active(): boolean {
    return this.isRunning;
  }
}
