// ============================================================================
// signal-projector — Redis Streams consumer
// ============================================================================
import Redis from 'ioredis';
import pino from 'pino';
import { projectEvent, type InterestSignal, type StreamEvent } from './projection.js';

const logger = pino({ name: 'signal-consumer' });

/** Where projected signals are written. Injected so the consumer is testable. */
export interface SignalStore {
  /** Insert, ignoring an event already folded. Returns true when a row was added. */
  save(signal: InterestSignal): Promise<boolean>;
}

export interface ConsumerOptions {
  redisUrl: string;
  /** Streams to read, e.g. `outbox.Video`. */
  streams: string[];
  group?: string;
  consumerName?: string;
  /** Max events per read. */
  batchSize?: number;
  /** How long XREADGROUP blocks waiting for new events. */
  blockMs?: number;
  /** Minimum idle time in ms for an unacked message to be claimed (default: 10000ms). */
  minIdleMs?: number;
  /** Maximum deliveries before routing an unprocessable entry to DLQ (default: 5). */
  maxDeliveries?: number;
  /** Suffix for dead-letter stream, e.g. '.DLQ' (default: '.DLQ'). */
  dlqStreamSuffix?: string;
}

const DEFAULT_GROUP = 'signal-projector';

export class SignalConsumer {
  private readonly client: Redis;
  private readonly store: SignalStore;
  private readonly streams: string[];
  private readonly group: string;
  private readonly consumerName: string;
  private readonly batchSize: number;
  private readonly blockMs: number;
  private readonly minIdleMs: number;
  private readonly maxDeliveries: number;
  private readonly dlqStreamSuffix: string;
  private writeFailures = 0;
  private dlqCount = 0;
  private running = false;

  constructor(store: SignalStore, options: ConsumerOptions, client?: Redis) {
    this.store = store;
    this.streams = options.streams;
    this.group = options.group ?? DEFAULT_GROUP;
    // Distinct per pod, so two replicas can share the group without stealing
    // each other's pending entries.
    this.consumerName = options.consumerName ?? `projector-${process.pid}`;
    this.batchSize = options.batchSize ?? 100;
    this.blockMs = options.blockMs ?? 5000;
    this.minIdleMs = options.minIdleMs ?? 10000;
    this.maxDeliveries = options.maxDeliveries ?? 5;
    this.dlqStreamSuffix = options.dlqStreamSuffix ?? '.DLQ';
    this.client =
      client ??
      new Redis(options.redisUrl, {
        // A blocking XREADGROUP must be allowed to sit for blockMs; the default
        // command timeout would abort it.
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
    this.client.on('error', (err) => logger.error({ err }, 'Redis consumer error'));
  }

  async connect(): Promise<void> {
    await this.client.connect();
    // MKSTREAM so the group can be created before the stream has any events —
    // otherwise the projector cannot start until a producer happens to fire.
    // BUSYGROUP just means a previous run already created it.
    for (const stream of this.streams) {
      try {
        await this.client.xgroup('CREATE', stream, this.group, '0', 'MKSTREAM');
        logger.info({ stream, group: this.group }, 'Consumer group created');
      } catch (err) {
        if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
      }
    }
  }

  async disconnect(): Promise<void> {
    this.running = false;
    await this.client.quit();
  }

  /** Read-only metrics and readiness signal for liveness/readiness probes */
  getMetrics() {
    return {
      writeFailures: this.writeFailures,
      dlqCount: this.dlqCount,
      isReady: this.running,
    };
  }

  /**
   * Reclaim and process entries parked in the PEL (Pending Entries List)
   * that have been idle longer than minIdleMs.
   *
   * If an entry has exceeded maxDeliveries, it is forwarded to the stream's DLQ
   * and acknowledged from the main stream so it does not stall the group forever.
   */
  async claimPending(stream: string): Promise<{ claimed: number; saved: number; dlq: number }> {
    try {
      const rawResult = await (this.client as any).xautoclaim(
        stream,
        this.group,
        this.consumerName,
        this.minIdleMs,
        '0-0',
        'COUNT',
        this.batchSize,
      );

      if (!rawResult || !Array.isArray(rawResult) || rawResult.length < 2) {
        return { claimed: 0, saved: 0, dlq: 0 };
      }

      const entries = rawResult[1] as [string, string[]][];
      if (!entries || entries.length === 0) {
        return { claimed: 0, saved: 0, dlq: 0 };
      }

      let claimed = 0;
      let saved = 0;
      let dlq = 0;

      for (const [entryId, fields] of entries) {
        claimed += 1;

        // Query delivery count from XPENDING
        let deliveryCount = 1;
        try {
          const pendingInfo = (await (this.client as any).xpending(
            stream,
            this.group,
            entryId,
            entryId,
            1,
          )) as any[];
          if (
            Array.isArray(pendingInfo) &&
            pendingInfo.length > 0 &&
            Array.isArray(pendingInfo[0])
          ) {
            deliveryCount = Number(pendingInfo[0][3] ?? 1);
          }
        } catch {
          // default delivery count to 1 if probe fails
        }

        if (deliveryCount > this.maxDeliveries) {
          const dlqStream = `${stream}${this.dlqStreamSuffix}`;
          logger.warn(
            { entryId, stream, dlqStream, deliveryCount },
            'Pending entry exceeded max deliveries; moving to DLQ and acknowledging',
          );
          try {
            await (this.client as any).xadd(
              dlqStream,
              '*',
              ...fields,
              'dlqReason',
              'MAX_DELIVERIES_EXCEEDED',
              'dlqOriginalStream',
              stream,
              'dlqOriginalEntryId',
              entryId,
            );
            await this.client.xack(stream, this.group, entryId);
            this.dlqCount += 1;
            dlq += 1;
          } catch (dlqErr) {
            logger.error({ dlqErr, entryId }, 'Failed to write entry to DLQ');
          }
          continue;
        }

        const event = parseEntry(fields);
        if (!event) {
          await this.client.xack(stream, this.group, entryId);
          continue;
        }
        const signal = projectEvent(event);
        if (!signal) {
          await this.client.xack(stream, this.group, entryId);
          continue;
        }

        try {
          const inserted = await this.store.save(signal);
          if (inserted) saved += 1;
          await this.client.xack(stream, this.group, entryId);
        } catch (err) {
          this.writeFailures += 1;
          logger.error(
            { err, entryId, stream, deliveryCount },
            'Failed to persist signal during pending claim retry; will retry up to maxDeliveries',
          );
        }
      }

      return { claimed, saved, dlq };
    } catch (err) {
      logger.error({ err, stream }, 'Error claiming pending stream entries');
      return { claimed: 0, saved: 0, dlq: 0 };
    }
  }

  /**
   * Read one batch and fold it.
   *
   * Every delivered entry is acknowledged, including ones that project to
   * nothing. Leaving an unrecognised event unacked would park it in the pending
   * list forever and it would be redelivered on every claim — a single event the
   * projector does not understand would otherwise become an infinite loop.
   * Failures to WRITE are different: those are left unacked so the entry is
   * redelivered, which is safe because the store is idempotent on eventId.
   */
  async readOnce(): Promise<{ read: number; saved: number; skipped: number }> {
    const streamKeys = this.streams;
    const args = [...streamKeys, ...streamKeys.map(() => '>')];
    const response = (await this.client.xreadgroup(
      'GROUP',
      this.group,
      this.consumerName,
      'COUNT',
      this.batchSize,
      'BLOCK',
      this.blockMs,
      'STREAMS',
      ...args,
    )) as [string, [string, string[]][]][] | null;

    if (!response) return { read: 0, saved: 0, skipped: 0 };

    let read = 0;
    let saved = 0;
    let skipped = 0;

    for (const [stream, entries] of response) {
      const ackable: string[] = [];
      for (const [entryId, fields] of entries) {
        read += 1;
        const event = parseEntry(fields);
        if (!event) {
          skipped += 1;
          ackable.push(entryId);
          continue;
        }
        const signal = projectEvent(event);
        if (!signal) {
          skipped += 1;
          ackable.push(entryId);
          continue;
        }
        try {
          const inserted = await this.store.save(signal);
          if (inserted) saved += 1;
          ackable.push(entryId);
        } catch (err) {
          // Deliberately NOT acked: redelivery is the retry, and the unique
          // constraint on eventId makes replaying it harmless.
          this.writeFailures += 1;
          logger.error({ err, entryId, stream }, 'Failed to persist signal; will retry');
        }
      }
      if (ackable.length > 0) {
        await this.client.xack(stream, this.group, ...ackable);
      }
    }

    if (read > 0) logger.info({ read, saved, skipped }, 'Folded stream batch');
    return { read, saved, skipped };
  }

  /** Loop until `disconnect()`. XREADGROUP's BLOCK provides the pacing. */
  async run(): Promise<void> {
    this.running = true;
    logger.info(
      { streams: this.streams, group: this.group, consumer: this.consumerName },
      'Signal consumer started',
    );
    while (this.running) {
      try {
        await this.readOnce();
        // Periodically reclaim pending entries across configured streams
        for (const stream of this.streams) {
          await this.claimPending(stream);
        }
      } catch (err) {
        logger.error({ err }, 'Consumer loop error');
        // Back off rather than spin on a persistent failure (Redis down, group
        // deleted) and bury the logs.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

/**
 * Turn Redis's flat field array into an event.
 *
 * Returns null on anything unexpected: this reads a stream written by another
 * service, and a malformed entry must be skippable rather than fatal.
 */
export function parseEntry(fields: string[]): StreamEvent | null {
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (typeof key === 'string' && typeof value === 'string') map[key] = value;
  }
  const { eventId, eventType, aggregateId, occurredAt, payload } = map;
  if (!eventId || !eventType || !aggregateId || !occurredAt) return null;

  let parsed: Record<string, unknown> = {};
  if (payload) {
    try {
      const candidate = JSON.parse(payload) as unknown;
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return { eventId, eventType, aggregateId, occurredAt, payload: parsed };
}
