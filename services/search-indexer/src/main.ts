// ============================================================================
// Search Indexer Service - Kafka consumer for CDC event indexing
// ============================================================================

import { Kafka, type Consumer, type EachMessagePayload, type Producer } from 'kafkajs';
import pino from 'pino';
import { startHealthServer } from '@quant/health-server';
import { SearchClient, VectorClient, SavedSearchService, ReindexJobManager } from '@quant/search';
import { BatchEmbedder, type EmbeddingProvider } from './embedder';
import { EmailIndexHandler } from './handlers/email.handler';
import { MessageIndexHandler } from './handlers/message.handler';
import { PostIndexHandler } from './handlers/post.handler';
import { VideoIndexHandler } from './handlers/video.handler';
import { FileIndexHandler } from './handlers/file.handler';
import { UserIndexHandler } from './handlers/user.handler';
import { registerReindexRoutes } from './api/reindex';

const logger = pino({ name: 'search-indexer' });

export interface EventPayload {
  type: string;
  payload: unknown;
}

export interface IndexerDeps {
  searchClient: SearchClient;
  vectorClient: VectorClient;
  embedder: BatchEmbedder;
  savedSearchService: SavedSearchService;
}

export type EventHandler = (payload: unknown) => Promise<void>;

/**
 * Build the event type to handler mapping
 */
export function buildHandlerMap(deps: IndexerDeps): Map<string, EventHandler> {
  const { searchClient, vectorClient, embedder } = deps;

  const emailHandler = new EmailIndexHandler(searchClient, vectorClient, embedder);
  const messageHandler = new MessageIndexHandler(searchClient, vectorClient, embedder);
  const postHandler = new PostIndexHandler(searchClient, vectorClient, embedder);
  const videoHandler = new VideoIndexHandler(searchClient, vectorClient, embedder);
  const fileHandler = new FileIndexHandler(searchClient, vectorClient, embedder);
  const userHandler = new UserIndexHandler(searchClient);

  const handlers = new Map<string, EventHandler>();
  handlers.set('email.created', (p) => emailHandler.handle(p));
  handlers.set('message.created', (p) => messageHandler.handle(p));
  handlers.set('post.created', (p) => postHandler.handle(p));
  handlers.set('post.updated', (p) => postHandler.handle(p));
  handlers.set('video.transcribed', (p) => videoHandler.handle(p));
  handlers.set('file.uploaded', (p) => fileHandler.handle(p));
  handlers.set('user.created', (p) => userHandler.handle(p));
  handlers.set('user.updated', (p) => userHandler.handle(p));

  return handlers;
}

/**
 * Route a single event to the appropriate handler.
 * After successful handling, checks saved searches for matching alerts.
 */
export async function routeEvent(
  handlers: Map<string, EventHandler>,
  event: EventPayload,
  savedSearchService?: SavedSearchService,
): Promise<void> {
  const handler = handlers.get(event.type);
  if (!handler) {
    logger.warn({ type: event.type }, 'No handler registered for event type');
    return;
  }
  await handler(event.payload);

  // Post-processing: check if the indexed document matches any saved searches
  if (savedSearchService && event.payload && typeof event.payload === 'object') {
    try {
      const payload = event.payload as Record<string, unknown>;
      const id = String(payload['id'] ?? '');
      const content = String(
        payload['bodyPlain'] ??
          payload['content'] ??
          payload['description'] ??
          payload['title'] ??
          '',
      );
      const type = event.type.split('.')[0] ?? 'unknown';

      if (id && content) {
        const matches = savedSearchService.matchNewDocument({ id, content, type });
        if (matches.length > 0) {
          logger.info(
            { documentId: id, matchCount: matches.length },
            'Document matched saved searches',
          );
        }
      }
    } catch (err) {
      logger.warn({ error: err, type: event.type }, 'Failed to check saved searches');
    }
  }
}

/**
 * Publish a failed event to a dead letter topic for later inspection/reprocessing.
 * Accepts a pre-connected Producer instance to avoid connection churn under sustained failures.
 */
export async function deadLetterPublish(
  producer: Producer,
  originalTopic: string,
  event: EventPayload,
  error: unknown,
  pinoLogger: typeof logger,
): Promise<void> {
  const dlqTopic = `${originalTopic}.dlq`;
  try {
    await producer.send({
      topic: dlqTopic,
      messages: [
        {
          value: JSON.stringify({
            originalEvent: event,
            error: error instanceof Error ? error.message : String(error),
            failedAt: new Date().toISOString(),
          }),
        },
      ],
    });
    pinoLogger.warn({ type: event.type, dlqTopic }, 'Event sent to dead letter queue');
  } catch (dlqError) {
    pinoLogger.error({ dlqError, type: event.type }, 'Failed to publish to dead letter queue');
  }
}

/**
 * Retry a handler up to maxRetries times with exponential backoff.
 * If all retries fail, publish to dead letter queue.
 */
export async function retryWithBackoff(
  fn: () => Promise<void>,
  maxRetries: number,
  event: EventPayload,
  dlqProducer: Producer,
  originalTopic: string,
  pinoLogger: typeof logger,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      pinoLogger.warn(
        { type: event.type, attempt, maxRetries, error },
        'Event processing failed, retrying',
      );
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  await deadLetterPublish(dlqProducer, originalTopic, event, lastError, pinoLogger);
  throw lastError;
}

async function main(): Promise<void> {
  const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
  const clientId = process.env['KAFKA_CLIENT_ID'] ?? 'search-indexer';
  const groupId = process.env['KAFKA_GROUP_ID'] ?? 'search-indexer-group';
  const topic = process.env['KAFKA_TOPIC'] ?? 'outbox.events';

  const meiliHost = process.env['MEILISEARCH_HOST'] ?? 'http://localhost:7700';
  const meiliKey = process.env['MEILISEARCH_API_KEY'];
  const qdrantHost = process.env['QDRANT_HOST'] ?? 'http://localhost';
  const qdrantPort = Number(process.env['QDRANT_PORT'] ?? '6333');

  const searchClient = new SearchClient(meiliHost, meiliKey);
  const qdrantApiKey = process.env['QDRANT_API_KEY'];
  const qdrantHttps = process.env['QDRANT_HTTPS'] === 'true';
  const vectorClient = new VectorClient(qdrantHost, qdrantPort, {
    apiKey: qdrantApiKey,
    https: qdrantHttps,
  });

  // Check if a real embedding provider is configured. If EMBEDDING_PROVIDER is not set,
  // a zero-vector fallback is used which makes vector search non-functional.
  // This is acceptable for local dev but must be replaced in production.
  const embeddingProviderEnv = process.env['EMBEDDING_PROVIDER'];
  if (!embeddingProviderEnv) {
    logger.warn(
      'EMBEDDING_PROVIDER env is not set. Vector search will be non-functional. ' +
        'All embeddings will be zero vectors. Set EMBEDDING_PROVIDER to enable real embeddings.',
    );
  }

  // Fallback: returns zero vectors for all inputs. In production, use
  // RoutingTable.getRoute("embedding_bulk") to route to bge-large-en-v1.5 or similar.
  const embeddingProvider: EmbeddingProvider = {
    embed: async (texts: string[]) => {
      return texts.map(() => new Array(1024).fill(0) as number[]);
    },
  };
  const embedder = new BatchEmbedder(embeddingProvider);

  const deps: IndexerDeps = {
    searchClient,
    vectorClient,
    embedder,
    savedSearchService: new SavedSearchService(),
  };
  const handlers = buildHandlerMap(deps);

  const kafka = new Kafka({ clientId, brokers });
  const consumer: Consumer = kafka.consumer({ groupId });
  const dlqProducer: Producer = kafka.producer();

  await consumer.connect();
  await dlqProducer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  logger.info({ topic, groupId }, 'Search indexer started, consuming events');

  const healthPort = Number(process.env['HEALTH_PORT'] ?? '3022');
  const healthServer = await startHealthServer(healthPort);
  const reindexJobManager = new ReindexJobManager();
  registerReindexRoutes(healthServer, reindexJobManager);
  logger.info({ healthPort }, 'Health server started');

  await consumer.run({
    eachMessage: async ({ message }: EachMessagePayload) => {
      try {
        const value = message.value?.toString();
        if (!value) return;

        const event = JSON.parse(value) as EventPayload;
        await retryWithBackoff(
          () => routeEvent(handlers, event, deps.savedSearchService),
          3,
          event,
          dlqProducer,
          topic,
          logger,
        );

        logger.debug({ type: event.type }, 'Event processed successfully');
      } catch (error) {
        logger.error(
          { error, offset: message.offset },
          'Failed to process event after all retries',
        );
      }
    },
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down search indexer...');
    await consumer.disconnect();
    await dlqProducer.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();
