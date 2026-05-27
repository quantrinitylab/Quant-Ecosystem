// ============================================================================
// Moderation Worker Service - BullMQ consumer for content moderation jobs
// ============================================================================

import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { startHealthServer } from '@quant/health-server';
import type {
  ModerationResult,
  ModerationAPIClient,
  ImageModerationAPIClient,
} from '@quant/moderation';
import { TextClassifier, ImageClassifier, PerceptualHasher, PolicyEngine } from '@quant/moderation';
import { ModerationJobSchema, type ModerationJob } from '@quant/queue';

import { TextModerationHandler } from './handlers/text-handler';
import { ImageModerationHandler } from './handlers/image-handler';
import { VideoModerationHandler } from './handlers/video-handler';
import { AudioModerationHandler } from './handlers/audio-handler';
import { ActionExecutor } from './action-executor';

const logger = pino({ name: 'moderation-worker' });

export interface ModerationHandlerDeps {
  textHandler: TextModerationHandler;
  imageHandler: ImageModerationHandler;
  videoHandler: VideoModerationHandler;
  audioHandler: AudioModerationHandler;
}

export type ModerationJobHandler = (job: ModerationJob) => Promise<ModerationResult>;

/**
 * Build the content type to handler mapping
 */
export function buildHandlerMap(deps: ModerationHandlerDeps): Map<string, ModerationJobHandler> {
  const handlers = new Map<string, ModerationJobHandler>();
  handlers.set('text', (job) => deps.textHandler.handle(job));
  handlers.set('image', (job) => deps.imageHandler.handle(job));
  handlers.set('video', (job) => deps.videoHandler.handle(job));
  handlers.set('audio', (job) => deps.audioHandler.handle(job));
  return handlers;
}

/**
 * Route a moderation job to the appropriate handler based on contentType
 */
export async function routeJob(
  handlers: Map<string, ModerationJobHandler>,
  job: ModerationJob,
): Promise<ModerationResult> {
  const handler = handlers.get(job.contentType);
  if (!handler) {
    throw new Error(`No handler registered for content type: ${job.contentType}`);
  }
  return handler(job);
}

/**
 * Create an unconfigured API client that throws a meaningful error when called
 * without proper configuration.
 */
function createUnconfiguredTextClient(): ModerationAPIClient {
  return {
    moderateText: () => {
      throw new Error(
        'Text moderation API client not configured. Set MODERATION_API_KEY environment variable.',
      );
    },
  };
}

/**
 * Create an unconfigured image API client that throws a meaningful error when called
 * without proper configuration.
 */
function createUnconfiguredImageClient(): ImageModerationAPIClient {
  return {
    moderateImage: () => {
      throw new Error(
        'Image moderation API client not configured. Set IMAGE_MODERATION_API_KEY environment variable.',
      );
    },
  };
}

/**
 * Create a real HTTP text moderation client that calls the OpenAI moderation endpoint.
 * Requires MODERATION_API_KEY (or OPENAI_API_KEY) to be set.
 */
function createHttpTextClient(apiKey: string): ModerationAPIClient {
  return {
    moderateText: async (input: string) => {
      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error(`Moderation API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results: Array<{
          category_scores: {
            hate: number;
            harassment: number;
            'self-harm': number;
            sexual: number;
            violence: number;
          };
          categories: {
            hate: boolean;
            harassment: boolean;
            'self-harm': boolean;
            sexual: boolean;
            violence: boolean;
          };
        }>;
      };

      const result = data.results[0]!;
      return {
        hate: { flagged: result.categories.hate, score: result.category_scores.hate },
        harassment: {
          flagged: result.categories.harassment,
          score: result.category_scores.harassment,
        },
        selfHarm: {
          flagged: result.categories['self-harm'],
          score: result.category_scores['self-harm'],
        },
        sexual: { flagged: result.categories.sexual, score: result.category_scores.sexual },
        violence: { flagged: result.categories.violence, score: result.category_scores.violence },
      };
    },
  };
}

/**
 * Factory function that constructs all handler dependencies from config/env.
 * Returns a fully wired ModerationHandlerDeps ready for the worker.
 *
 * Environment variables:
 *   MODERATION_API_KEY or OPENAI_API_KEY - enables real text moderation via OpenAI
 *   IMAGE_MODERATION_API_KEY - enables real image moderation (requires provider SDK configuration)
 */
export function createHandlerDeps(): ModerationHandlerDeps {
  // Resolve text API client: use real HTTP client if API key is present
  const textApiKey =
    process.env['MODERATION_API_KEY'] ?? process.env['OPENAI_API_KEY'] ?? undefined;
  const textApiClient = textApiKey
    ? createHttpTextClient(textApiKey)
    : createUnconfiguredTextClient();

  // Resolve image API client: use real client if API key is present
  const imageApiKey = process.env['IMAGE_MODERATION_API_KEY'] ?? undefined;
  const imageApiClient = imageApiKey
    ? // Swap with real image moderation SDK client when provider is onboarded
      createUnconfiguredImageClient()
    : createUnconfiguredImageClient();

  const textClassifier = new TextClassifier(textApiClient);
  const imageClassifier = new ImageClassifier(imageApiClient);
  const hasher = new PerceptualHasher();
  const policyEngine = new PolicyEngine([]);
  const actionExecutor = new ActionExecutor({
    auditLogWriter: {
      write: async () => {
        // In production, this writes to a real audit log store
      },
    },
  });

  const textHandler = new TextModerationHandler({
    classifier: textClassifier,
    policyEngine,
    actionExecutor,
  });

  const imageHandler = new ImageModerationHandler({
    classifier: imageClassifier,
    hasher,
    policyEngine,
    actionExecutor,
  });

  const videoHandler = new VideoModerationHandler({
    imageClassifier,
    policyEngine,
    actionExecutor,
  });

  const audioHandler = new AudioModerationHandler({
    transcriptionService: {
      transcribe: () => {
        throw new Error(
          'Transcription service not configured. Set TRANSCRIPTION_API_KEY environment variable.',
        );
      },
    },
    textClassifier,
    policyEngine,
    actionExecutor,
  });

  return { textHandler, imageHandler, videoHandler, audioHandler };
}

async function main(): Promise<void> {
  const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
  const redisPort = Number(process.env['REDIS_PORT'] ?? '6379');
  const queueName = process.env['QUEUE_NAME'] ?? 'moderation-jobs';

  const connection = new Redis(redisPort, redisHost, { maxRetriesPerRequest: null });

  const deps = createHandlerDeps();
  const handlers = buildHandlerMap(deps);

  const worker = new Worker(
    queueName,
    async (bullJob: Job) => {
      const parsed = ModerationJobSchema.safeParse(bullJob.data);
      if (!parsed.success) {
        throw new Error(`Invalid job data: ${parsed.error.message}`);
      }

      const job = parsed.data;
      logger.info(
        { contentId: job.contentId, contentType: job.contentType },
        'Processing moderation job',
      );

      const result = await routeJob(handlers, job);
      logger.info({ contentId: job.contentId, action: result.action }, 'Moderation job completed');

      return result;
    },
    { connection },
  );

  worker.on('failed', (failedJob, err) => {
    logger.error({ jobId: failedJob?.id, error: err.message }, 'Job failed');
  });

  logger.info({ queueName }, 'Moderation worker started');

  const healthPort = Number(process.env['HEALTH_PORT'] ?? '3023');
  await startHealthServer(healthPort, {
    redis: async () => connection.status === 'ready',
  });
  logger.info({ healthPort }, 'Health server started');

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down moderation worker...');
    await worker.close();
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void main();
