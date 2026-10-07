import { Kafka, type Producer } from 'kafkajs';
import pino from 'pino';

const logger = pino({ name: 'kafka-producer' });

export interface KafkaProducerConfig {
  brokers: string[];
  clientId: string;
}

export interface KafkaMessage {
  key: string;
  value: string;
}

export interface TopicMessages {
  topic: string;
  messages: KafkaMessage[];
}

export class KafkaProducerClient {
  private readonly producer: Producer;

  constructor(config: KafkaProducerConfig) {
    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
    });
    this.producer = kafka.producer({ idempotent: true });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    logger.info('Kafka producer connected');
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
    logger.info('Kafka producer disconnected');
  }

  async send(topic: string, messages: KafkaMessage[]): Promise<void> {
    await this.producer.send({
      topic,
      messages: messages.map((m) => ({ key: m.key, value: m.value })),
    });
  }

  async sendBatch(topicMessages: TopicMessages[]): Promise<void> {
    await this.producer.sendBatch({
      topicMessages: topicMessages.map((tm) => ({
        topic: tm.topic,
        messages: tm.messages.map((m) => ({ key: m.key, value: m.value })),
      })),
    });
  }
}
