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
  CSAMHashProvider,
} from '@quant/moderation';
import {
  TextClassifier,
  ImageClassifier,
  PerceptualHasher,
  PolicyEngine,
  KeyframeExtractor,
  MockFrameExtractorBackend,
  FfmpegFrameExtractorBackend,
  FailClosedFrameExtractorBackend,
  AudioTranscriber,
  createWhisperProviderFromEnv,
  CSAMMatchService,
  NullProvider,
  PhotoDNAProvider,
  TestHashProvider,
} from '@quant/moderation';
import type { FrameExtractorBackend } from '@quant/moderation';
import { ModerationJobSchema, type ModerationJob } from '@quant/queue';

import { TextModerationHandler } from './handlers/text-handler';
import { ImageModerationHandler } from './handlers/image-handler';
import type { ContentFetcher } from './handlers/image-handler';
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
 * Create a real HTTP image moderation client backed by OpenAI's
 * omni-moderation model, which accepts image URLs and returns category scores.
 * Maps the OpenAI categories onto the ImageModerationResponse shape.
 */
function createHttpImageClient(apiKey: string): ImageModerationAPIClient {
  return {
    moderateImage: async (input) => {
      const imageUrl = input.url ?? (input.base64 ? `data:image/*;base64,${input.base64}` : null);
      if (!imageUrl) {
        throw new Error('Image moderation requires a url or base64 input');
      }

      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'omni-moderation-latest',
          input: [{ type: 'image_url', image_url: { url: imageUrl } }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Image moderation API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results: Array<{
          category_scores: Record<string, number>;
          categories: Record<string, boolean>;
        }>;
      };
      const r = data.results[0]!;
      const score = (k: string): number => r.category_scores[k] ?? 0;
      const flag = (k: string): boolean => r.categories[k] ?? false;

      // OpenAI sexual + sexual/minors -> nsfw; hate -> hateSymbols; etc.
      const sexualScore = Math.max(score('sexual'), score('sexual/minors'));
      const sexualFlag = flag('sexual') || flag('sexual/minors');
      const violenceScore = Math.max(score('violence'), score('violence/graphic'));
      const violenceFlag = flag('violence') || flag('violence/graphic');
      const selfHarmScore = Math.max(
        score('self-harm'),
        score('self-harm/intent'),
        score('self-harm/instructions'),
      );
      const selfHarmFlag =
        flag('self-harm') || flag('self-harm/intent') || flag('self-harm/instructions');

      return {
        nsfw: { flagged: sexualFlag, score: sexualScore },
        violence: { flagged: violenceFlag, score: violenceScore },
        hateSymbols: { flagged: flag('hate'), score: score('hate') },
        selfHarm: { flagged: selfHarmFlag, score: selfHarmScore },
      };
    },
  };
}

/**
 * HTTP content fetcher: downloads the actual image bytes for perceptual hashing
 * and CSAM hash matching. Hashing the URL string (instead of the bytes) would
 * make hash matching useless, so the worker must fetch real bytes.
 */
function createContentFetcher(): ContentFetcher {
  return {
    async fetch(url: string): Promise<Buffer> {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image content: ${response.status} ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

/**
 * Resolve the CSAM hash provider from env. Fail-closed by default:
 *   - PHOTODNA_SUBSCRIPTION_KEY set        -> Microsoft PhotoDNA (real)
 *   - CSAM_TEST_PROVIDER=true              -> NCMEC synthetic test hashes (dev/CI)
 *   - otherwise                            -> NullProvider (throws -> upload BLOCKED)
 */
function resolveCsamProvider(): CSAMHashProvider {
  const photoDnaKey = process.env['PHOTODNA_SUBSCRIPTION_KEY'];
  if (photoDnaKey) {
    return new PhotoDNAProvider({
      subscriptionKey: photoDnaKey,
      ...(process.env['PHOTODNA_API_ENDPOINT']
        ? { apiEndpoint: process.env['PHOTODNA_API_ENDPOINT'] }
        : {}),
    });
  }
  if (process.env['CSAM_TEST_PROVIDER'] === 'true') {
    logger.warn('CSAM_TEST_PROVIDER=true - using synthetic NCMEC test hashes (dev/CI only)');
    return new TestHashProvider();
  }
  logger.warn(
    'No CSAM hash provider configured (PHOTODNA_SUBSCRIPTION_KEY unset) - image uploads will FAIL CLOSED',
  );
  return new NullProvider();
}

/**
 * Build the CSAM match service when media uploads are enabled. With no real
 * provider configured this wraps NullProvider, whose checkHash throws, so the
 * image handler blocks the upload (fail-closed) rather than approving it.
 * Returns undefined when UGC media is disabled (images should not be uploaded).
 */
function resolveCsamMatchService(): CSAMMatchService | undefined {
  if (process.env['UGC_MEDIA_ENABLED'] !== 'true') {
    return undefined;
  }
  return new CSAMMatchService({
    provider: resolveCsamProvider(),
    ...(process.env['CSAM_PAGING_WEBHOOK_URL']
      ? { pagingWebhookUrl: process.env['CSAM_PAGING_WEBHOOK_URL'] }
      : {}),
  });
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

  // Resolve image API client: use the real omni-moderation client when an
  // image moderation key is configured; otherwise an unconfigured client that
  // throws (classification fails -> upload BLOCKED, never silently approved).
  const imageApiKey =
    process.env['IMAGE_MODERATION_API_KEY'] ?? process.env['OPENAI_API_KEY'] ?? undefined;
  const imageApiClient = imageApiKey
    ? createHttpImageClient(imageApiKey)
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

  // The image handler must (1) fetch real bytes for hashing and (2) run the
  // CSAM hash check before classification. Both were previously omitted, so the
  // CSAM gate never ran and hashes were computed over the URL string.
  const csamMatchService = resolveCsamMatchService();
  const imageHandler = new ImageModerationHandler({
    classifier: imageClassifier,
    hasher,
    policyEngine,
    actionExecutor,
    contentFetcher: createContentFetcher(),
    ...(csamMatchService ? { csamMatchService } : {}),
  });

  const videoHandler = new VideoModerationHandler({
    imageClassifier,
    keyframeExtractor: new KeyframeExtractor(resolveFrameExtractorBackend()),
    policyEngine,
    actionExecutor,
  });

  const audioHandler = new AudioModerationHandler({
    transcriptionService: resolveTranscriptionService(),
    textClassifier,
    policyEngine,
    actionExecutor,
  });

  return { textHandler, imageHandler, videoHandler, audioHandler };
}

/**
 * Resolve the video frame-extractor backend.
 *   - FFMPEG_ENABLED=true                  -> real ffmpeg backend
 *   - MODERATION_ALLOW_MOCK_FRAMES=true    -> mock backend (explicit dev opt-in)
 *   - otherwise                            -> FAIL CLOSED (video jobs error, never
 *                                             silently approved with fake frames)
 */
function resolveFrameExtractorBackend(): FrameExtractorBackend {
  if (process.env['FFMPEG_ENABLED'] === 'true') {
    return new FfmpegFrameExtractorBackend(() => {
      throw new Error('ffmpeg command factory not configured');
    });
  }
  if (process.env['MODERATION_ALLOW_MOCK_FRAMES'] === 'true') {
    logger.warn(
      'MODERATION_ALLOW_MOCK_FRAMES=true - using mock frame extractor (NO real frames; dev only)',
    );
    return new MockFrameExtractorBackend();
  }
  logger.warn(
    'No video frame extractor configured (FFMPEG_ENABLED not set) - video moderation will FAIL CLOSED',
  );
  return new FailClosedFrameExtractorBackend();
}

/**
 * Resolve the audio transcription service. Uses the real Whisper provider when
 * OPENAI_API_KEY / TRANSCRIPTION_API_KEY is configured; otherwise fails closed
 * (audio jobs error instead of being analyzed against an empty transcript).
 */
function resolveTranscriptionService(): { transcribe(audioUrl: string): Promise<string> } {
  const apiKey = process.env['TRANSCRIPTION_API_KEY'] ?? process.env['OPENAI_API_KEY'];
  const provider = apiKey
    ? createWhisperProviderFromEnv({ language: process.env['TRANSCRIPTION_LANGUAGE'] })
    : null;

  if (provider) {
    const transcriber = new AudioTranscriber(provider);
    return {
      transcribe: async (audioUrl: string): Promise<string> => {
        const result = await transcriber.transcribe(audioUrl);
        return result.text;
      },
    };
  }

  return {
    transcribe: (): Promise<string> => {
      throw new Error(
        'Transcription service not configured. Set TRANSCRIPTION_API_KEY (or OPENAI_API_KEY) environment variable.',
      );
    },
  };
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
