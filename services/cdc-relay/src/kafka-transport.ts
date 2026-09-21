// ============================================================================
// cdc-relay — Kafka transport (adapter over the existing producer client)
// ============================================================================
//
// Kept so production can keep using Kafka/MSK. The only change is that it now
// satisfies `EventTransport` instead of being the poller's hardcoded dependency,
// and it publishes the full envelope rather than a bare payload — the previous
// relay stringified only `event.payload`, so `eventType` never reached a
// consumer.
import { KafkaProducerClient } from './kafka-producer.js';
import { streamFor, toEnvelope, type EventTransport, type OutboxRecord } from './transport.js';

export class KafkaEventTransport implements EventTransport {
  readonly name = 'kafka';
  private readonly producer: KafkaProducerClient;

  constructor(config: { brokers: string[]; clientId: string }) {
    this.producer = new KafkaProducerClient(config);
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(records: OutboxRecord[]): Promise<void> {
    if (records.length === 0) return;

    const byTopic = new Map<string, { key: string; value: string }[]>();
    for (const record of records) {
      const topic = streamFor(record.aggregateType);
      let messages = byTopic.get(topic);
      if (!messages) {
        messages = [];
        byTopic.set(topic, messages);
      }
      // Key by aggregateId so all events for one aggregate land on the same
      // partition and therefore stay in order.
      messages.push({ key: record.aggregateId, value: JSON.stringify(toEnvelope(record)) });
    }

    await this.producer.sendBatch(
      Array.from(byTopic.entries()).map(([topic, messages]) => ({ topic, messages })),
    );
  }
}
