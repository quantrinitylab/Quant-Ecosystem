import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

export interface BillableAdEvent {
  eventId: string;
  creatorId: string;
  adId: string;
  campaignId: string;
  eventType: 'click' | 'cpm_impression';
  clearingPriceCents: number;
  creatorShareCents: number; // 70% of gross
  timestamp: string;
}

export class CreatorRevShareWorker {
  private worker: Worker | null = null;
  private redis: Redis;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }

  public start(): void {
    this.worker = new Worker<BillableAdEvent, { credited: boolean; creditsAdded: number }>(
      'creator-ad-rev-share',
      async (job: Job<BillableAdEvent>) => {
        return this.processPayout(job.data);
      },
      {
        connection: this.redis,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(
        `[RevShareWorker] Disbursed 70% ad rev to creator ${job.data.creatorId} (Event: ${job.data.eventId})`,
      );
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[RevShareWorker] Job ${job?.id} failed:`, err.message);
    });

    console.log('[RevShareWorker] Listening on creator-ad-rev-share queue...');
  }

  public async processPayout(
    event: BillableAdEvent,
  ): Promise<{ credited: boolean; creditsAdded: number }> {
    // 1 credit = $1.00 (100 cents)
    const creditsAdded = event.creatorShareCents / 100;

    // In production, appends to credit_ledger_entries with bucket = 'PURCHASED'
    // allowing immediate withdrawal via UPI or Stripe Connect
    return {
      credited: true,
      creditsAdded,
    };
  }

  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    await this.redis.quit();
  }
}
