// ============================================================================
// cdc-relay — event transport protocol
// ============================================================================
//
// The relay used to take a concrete `KafkaProducerClient` in its constructor,
// which made the whole event spine unrunnable without a Kafka cluster. That
// violates Quant Foundation Law 4 ("never direct coupling, always a contract")
// and Law 5 ("every module must be replaceable"): the poller's job is to drain
// the outbox exactly once, not to know what a broker is.
//
// So the poller now depends on this interface. Kafka is one implementation;
// Redis Streams is another. Staging already runs Redis (`REDIS_URL` is in the
// staging ConfigMap) and runs no Kafka, so the spine can be switched on today
// without provisioning MSK, and production can move to Kafka later by changing
// one env var instead of the poller.

/**
 * One outbox row, projected for publication.
 *
 * `eventType` is carried explicitly because the previous relay dropped it: it
 * published bare `JSON.stringify(event.payload)` into a topic named only after
 * the aggregate type, so `User.created` and `User.deleted` both landed in
 * `outbox.User` and no consumer could tell them apart. An event without its type
 * is not an event, it is a blob.
 */
export interface OutboxRecord {
  /** The outbox row id. Consumers use it to deduplicate on redelivery. */
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  /** When the producer appended the row (not when it was relayed). */
  occurredAt: Date;
}

/**
 * The wire envelope. Every field a consumer needs to route, order and
 * deduplicate an event, without reading the database.
 */
export interface EventEnvelope {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  occurredAt: string;
  payload: unknown;
}

/** Build the envelope for a record. Shared so every transport agrees on shape. */
export function toEnvelope(record: OutboxRecord): EventEnvelope {
  return {
    eventId: record.eventId,
    aggregateType: record.aggregateType,
    aggregateId: record.aggregateId,
    eventType: record.eventType,
    occurredAt: record.occurredAt.toISOString(),
    payload: record.payload,
  };
}

/**
 * The stream/topic an aggregate's events are published to. One per aggregate
 * type, so a consumer can subscribe to the slice it cares about and events for
 * one aggregate stay in append order.
 */
export function streamFor(aggregateType: string): string {
  return `outbox.${aggregateType}`;
}

/**
 * Where the relay publishes drained outbox rows.
 *
 * Implementations MUST be all-or-nothing per call: the poller marks rows
 * published only after `publish` resolves, inside the same transaction that read
 * them, so a partial success that resolves would silently drop events. Throwing
 * is the correct response to any failure — the transaction rolls back and the
 * rows are retried on the next tick.
 */
export interface EventTransport {
  /** Human-readable name, for logs and the health endpoint. */
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Publish a batch. Throws if any record could not be accepted. */
  publish(records: OutboxRecord[]): Promise<void>;
}
