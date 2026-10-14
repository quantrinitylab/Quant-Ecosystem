// ============================================================================
// AI Core - Central AI Engine (Real Implementation)
// ============================================================================

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type SystemContentBlock as BedrockSystemBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  AIEngineConfig,
  AIInferenceRequest,
  AIInferenceResponse,
  AIModelConfig,
  AIProvider,
  StreamChunk,
  TokenUsage,
} from '../types';
import { ContextManager } from './context-manager';
import { EngineMemoryFacade, LegacyEngineMemory, type EngineMemory } from './engine-memory';
import { ModelRouter } from './model-router';
import { CircuitBreakerRegistry } from './circuit-breaker';
import { retryWithBackoff } from './retry';
import { SemanticCache } from './semantic-cache';
import type { CacheScope } from './semantic-cache';
import { SafetyPipeline } from './safety';
import { CostTracker } from './cost-tracker';
import { UnknownModelError } from './errors';
import {
  compatChatCompletion,
  compatChatCompletionStream,
  toCompatMessages,
  type OpenAICompatibleEndpoint,
} from './openai-compatible-transport';
import {
  toVercelTools,
  validateToolDefinitions,
  parseToolCall,
  type ToolCall,
  type ToolDefinition,
  type ToolLoopContext,
  type HeldToolCalls,
  type ToolResult as LlmToolResult,
} from './tool-calling';

/**
 * Message shape used across tool-loop rounds. Content may be plain text
 * (initial user/system turns) or Vercel AI SDK content parts (assistant
 * tool-call parts + tool-result parts fed back to the model).
 */
type LoopMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | Array<Record<string, unknown>>;
};

/**
 * Normalized result of one model round. `unexecutedToolCalls` carries calls
 * the model requested but which were NOT executed — the legacy single-round
 * path, or a loop that hit its step cap.
 */
interface RoundResult {
  text: string;
  unexecutedToolCalls: ToolCall[];
  promptTokens: number;
  completionTokens: number;
  pendingConfirmation?: AIInferenceResponse['pendingConfirmation'];
  truncated?: boolean;
}

/**
 * Read a required env var for the deployed-environment adapter. Throws at
 * engine startup (fail-closed) instead of building a broken endpoint URL.
 */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `AI_PROVIDER=${(process.env['AI_PROVIDER'] ?? '').toLowerCase()} requires ${name} to be set.`,
    );
  }
  return value;
}

/** Default engine configuration */
const DEFAULT_CONFIG: AIEngineConfig = {
  defaultModel: process.env['AI_DEFAULT_MODEL'] ?? 'muse-spark-1.3',
  maxConcurrentRequests: 50,
  requestTimeoutMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
  enableStreaming: true,
  enableCaching: true,
  cacheTtlMs: 300000,
  costBudgetPerUser: 10.0,
  costBudgetPerDay: 1000.0,
};

/**
 * Central AI Engine
 *
 * The brain of the Quant Ecosystem's AI capabilities.
 * Uses Vercel AI SDK with OpenAI and Anthropic providers.
 * Integrates circuit breaker, retry, caching, safety, and cost tracking.
 */
export class AIEngine {
  private config: AIEngineConfig;
  private contextManager: ContextManager;
  /**
   * Memory seam (M11c, ADR-011). Defaults to `legacy` mode, which delegates
   * byte-identically to `contextManager`. The engine never calls
   * `contextManager` directly for enrich/record — it goes through this facade so
   * the memory backend can migrate (legacy → dual_write → shadow → new) with
   * zero behavioral change and instant rollback.
   */
  private memory: EngineMemory;
  private modelRouter: ModelRouter;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private semanticCache: SemanticCache;
  private safetyPipeline: SafetyPipeline;
  private costTracker: CostTracker;
  private activeRequests: number = 0;
  private cloudflareProvider: ReturnType<typeof createOpenAI> | null = null;
  /**
   * Direct OpenAI-compatible endpoint for Cloudflare Workers AI. Tool-free
   * rounds use it instead of the AI SDK, whose v1 OpenAI provider is rejected
   * by `ai@5` (see openai-compatible-transport.ts).
   */
  private cloudflareEndpoint: OpenAICompatibleEndpoint | null = null;
  /**
   * Deployed-environment model pin (CODEX-REVIEW gate, PR #1119):
   * AI_PROVIDER=custom → AI_MODEL (staging); AI_PROVIDER=cloudflare →
   * CLOUDFLARE_AI_MODEL ?? AI_DEFAULT_MODEL (production). When set and the
   * caller did not name a model, the pin wins over router scoring so the
   * deployed contract is honored exactly.
   */
  private deployedModelPin: string | null = null;
  private openaiProvider: ReturnType<typeof createOpenAI> | null = null;
  private anthropicProvider: ReturnType<typeof createAnthropic> | null = null;
  private googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
  private openrouterProvider: ReturnType<typeof createOpenAI> | null = null;
  private metaProvider: ReturnType<typeof createOpenAI> | null = null;
  private bedrockClient: BedrockRuntimeClient | null = null;

  constructor(config: Partial<AIEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreakerRegistry = new CircuitBreakerRegistry();
    this.modelRouter = new ModelRouter(this.circuitBreakerRegistry);
    this.contextManager = new ContextManager();
    // Route memory through the facade in `legacy` mode: byte-identical to
    // calling contextManager.enrichPrompt / addToHistory directly (ADR-011).
    this.memory = new EngineMemoryFacade({
      mode: 'legacy',
      legacy: new LegacyEngineMemory(this.contextManager),
    });
    this.semanticCache = new SemanticCache(this.config.cacheTtlMs);
    this.safetyPipeline = new SafetyPipeline();
    this.costTracker = new CostTracker({
      dailyBudget: this.config.costBudgetPerDay,
      perUserBudget: this.config.costBudgetPerUser,
    });

    this.initializeProviders();
  }

  /**
   * Initialize AI SDK providers from environment variables.
   *
   * Deployed-environment adapter (CODEX-REVIEW gate, PR #1119): exactly one
   * explicit, fail-closed adapter per environment. `AI_PROVIDER=custom`
   * (staging contract: .github/workflows/setup-k8s.yml) honors `AI_BASE_URL`
   * + `AI_MODEL`; `AI_PROVIDER=cloudflare` (production contract:
   * infra/helm/quant-platform/values-production-v2.yaml) honors
   * `CLOUDFLARE_AI_BASE_URL` + `CLOUDFLARE_ACCOUNT_ID` (+ optional
   * `CLOUDFLARE_AI_MODEL` / `AI_DEFAULT_MODEL` pin). A configured-but-
   * unregistered model throws at startup instead of silently routing to a
   * different (e.g. deprecated) model.
   */
  private initializeProviders(): void {
    const aiProvider = (process.env['AI_PROVIDER'] ?? '').toLowerCase();
    if (aiProvider === 'custom') {
      // Staging: OpenAI-compatible worker at AI_BASE_URL, no account-scoped URL.
      const baseURL = requiredEnv('AI_BASE_URL');
      const pinnedModel = requiredEnv('AI_MODEL');
      this.assertModelRegistered(pinnedModel, 'AI_MODEL');
      this.deployedModelPin = pinnedModel;
      // Optional bearer key, mirroring the backend's ai-provider.service.ts
      // convention (header omitted entirely when no key is configured).
      this.cloudflareEndpoint = { baseURL, apiKey: process.env['AI_API_KEY'] };
    } else if (aiProvider === 'cloudflare') {
      // Production: direct Cloudflare Workers AI account endpoint.
      const baseRoot = (
        process.env['CLOUDFLARE_AI_BASE_URL'] ?? 'https://api.cloudflare.com/client/v4/accounts'
      ).replace(/\/+$/, '');
      const cloudflareAccountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
      const cloudflareToken =
        process.env['CLOUDFLARE_API_TOKEN'] ?? process.env['CLOUDFLARE_API_KEY'];
      if (!cloudflareToken) {
        throw new Error(
          'AI_PROVIDER=cloudflare requires CLOUDFLARE_API_TOKEN (or CLOUDFLARE_API_KEY) to be set.',
        );
      }
      const pinnedModel =
        process.env['CLOUDFLARE_AI_MODEL'] ?? process.env['AI_DEFAULT_MODEL'];
      if (pinnedModel) {
        this.assertModelRegistered(pinnedModel, 'CLOUDFLARE_AI_MODEL/AI_DEFAULT_MODEL');
        this.deployedModelPin = pinnedModel;
      }
      const cloudflareBaseURL = `${baseRoot}/${cloudflareAccountId}/ai/v1`;
      this.cloudflareProvider = createOpenAI({
        apiKey: cloudflareToken,
        baseURL: cloudflareBaseURL,
      });
      this.cloudflareEndpoint = { baseURL: cloudflareBaseURL, apiKey: cloudflareToken };
    } else {
      // Legacy: Cloudflare Workers AI via a Cloudflare API token, ultra-fast
      // edge inference. (Unchanged behavior when AI_PROVIDER is unset.)
      const cloudflareToken =
        process.env['CLOUDFLARE_API_TOKEN'] ?? process.env['CLOUDFLARE_API_KEY'];
      const cloudflareAccountId =
        process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '9af698848a5edd00e756c3a2c908ec8d';
      if (cloudflareToken) {
        const cloudflareBaseURL = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/v1`;
        this.cloudflareProvider = createOpenAI({
          apiKey: cloudflareToken,
          baseURL: cloudflareBaseURL,
        });
        this.cloudflareEndpoint = { baseURL: cloudflareBaseURL, apiKey: cloudflareToken };
      }
    }

    // Meta AI: primary provider for the ecosystem (Muse Spark models,
    // multimodal, voice, agentic). OpenAI-compatible API at api.meta.ai.
    const metaKey = process.env['META_API_KEY'] ?? process.env['META_AI_API_KEY'];
    if (metaKey) {
      this.metaProvider = createOpenAI({
        apiKey: metaKey,
        baseURL: process.env['META_API_BASE_URL'] ?? 'https://api.meta.ai/v1',
      });
    }

    const openaiKey = process.env['OPENAI_API_KEY'];
    const anthropicKey = process.env['ANTHROPIC_API_KEY'];

    if (openaiKey) {
      this.openaiProvider = createOpenAI({ apiKey: openaiKey });
    }
    if (anthropicKey) {
      this.anthropicProvider = createAnthropic({ apiKey: anthropicKey });
    }
    if (process.env['GOOGLE_API_KEY']) {
      this.googleProvider = createGoogleGenerativeAI({ apiKey: process.env['GOOGLE_API_KEY'] });
    }
    // OpenRouter: a single OpenAI-compatible key that unlocks the whole model
    // catalogue (the ecosystem's default multi-model source).
    if (process.env['OPENROUTER_API_KEY']) {
      this.openrouterProvider = createOpenAI({
        apiKey: process.env['OPENROUTER_API_KEY'],
        baseURL: process.env['OPENROUTER_BASE_URL'] ?? 'https://openrouter.ai/api/v1',
      });
    }

    // Amazon Bedrock: uses AWS credentials (no external provider key required).
    // Dedicated BEDROCK_* env vars are passed explicitly so we never clobber the
    // global AWS_* credentials used by SES / S3 elsewhere in the platform. When
    // only BEDROCK_REGION is set and USE_BEDROCK_DEFAULT_CREDS=true, we fall back
    // to the default AWS credential chain (e.g. EKS IRSA role).
    const bedrockRegion = process.env['BEDROCK_REGION'] ?? process.env['AWS_REGION'];
    const bedrockAccessKeyId = process.env['BEDROCK_ACCESS_KEY_ID'];
    const bedrockSecretAccessKey = process.env['BEDROCK_SECRET_ACCESS_KEY'];
    if (bedrockRegion && bedrockAccessKeyId && bedrockSecretAccessKey) {
      this.bedrockClient = new BedrockRuntimeClient({
        region: bedrockRegion,
        credentials: {
          accessKeyId: bedrockAccessKeyId,
          secretAccessKey: bedrockSecretAccessKey,
          ...(process.env['BEDROCK_SESSION_TOKEN']
            ? { sessionToken: process.env['BEDROCK_SESSION_TOKEN'] }
            : {}),
        },
      });
    } else if (bedrockRegion && process.env['USE_BEDROCK_DEFAULT_CREDS'] === 'true') {
      this.bedrockClient = new BedrockRuntimeClient({ region: bedrockRegion });
    }

    // Tell the router which providers are actually configured so it never
    // selects a model whose credentials are missing.
    const configured = new Set<AIProvider>();
    if (this.cloudflareProvider || this.cloudflareEndpoint) configured.add('cloudflare');
    if (this.openaiProvider) configured.add('openai');
    if (this.anthropicProvider) configured.add('anthropic');
    if (this.googleProvider) configured.add('google');
    if (this.openrouterProvider) configured.add('openrouter');
    if (this.metaProvider) configured.add('meta');
    if (this.bedrockClient) configured.add('bedrock');
    this.modelRouter.setAvailableProviders(configured);
  }

  /**
   * Fail-closed startup validation for the deployed-environment adapter: the
   * configured model pin must be registered in the model router. Throws
   * {@link UnknownModelError} instead of letting scoring silently substitute
   * a different (possibly deprecated) model.
   */
  private assertModelRegistered(modelId: string, source: string): void {
    if (!this.modelRouter.getModel(modelId)) {
      throw new UnknownModelError(modelId, source);
    }
  }

  /**
   * Get the appropriate AI SDK model instance for a model config
   */
  private getProviderModel(model: AIModelConfig) {
    if (model.provider === 'cloudflare') {
      if (!this.cloudflareProvider) {
        throw new Error(
          'CLOUDFLARE_API_TOKEN not configured. Set the environment variable to use Cloudflare Workers AI models.',
        );
      }
      return this.cloudflareProvider(model.id);
    }
    if (model.provider === 'openai') {
      if (!this.openaiProvider) {
        throw new Error(
          'OPENAI_API_KEY not configured. Set the environment variable to use OpenAI models.',
        );
      }
      return this.openaiProvider(model.id);
    }
    if (model.provider === 'anthropic') {
      if (!this.anthropicProvider) {
        throw new Error(
          'ANTHROPIC_API_KEY not configured. Set the environment variable to use Anthropic models.',
        );
      }
      return this.anthropicProvider(model.id);
    }
    if (model.provider === 'google') {
      if (!this.googleProvider) {
        throw new Error(
          'GOOGLE_API_KEY not configured. Set the environment variable to use Google models.',
        );
      }
      return this.googleProvider(model.id);
    }
    if (model.provider === 'openrouter') {
      if (!this.openrouterProvider) {
        throw new Error(
          'OPENROUTER_API_KEY not configured. Set the environment variable to use OpenRouter models.',
        );
      }
      return this.openrouterProvider(model.id);
    }
    if (model.provider === 'meta') {
      if (!this.metaProvider) {
        throw new Error(
          'META_API_KEY not configured. Set the environment variable to use Meta AI models.',
        );
      }
      return this.metaProvider(model.id);
    }
    if (model.provider === 'bedrock') {
      // Bedrock does not use the Vercel AI SDK model interface; it is invoked
      // directly via the Converse API (see bedrockConverse / bedrockConverseStream).
      throw new Error('Bedrock models are invoked via the Converse API, not getProviderModel.');
    }
    throw new Error(`Unsupported provider: ${model.provider}`);
  }

  /**
   * Split our flat message list into the Bedrock Converse shape:
   * system prompts go into a dedicated `system` array, the rest become
   * alternating user/assistant turns.
   */
  private toBedrockMessages(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): { system: BedrockSystemBlock[]; conversation: BedrockMessage[] } {
    const system: BedrockSystemBlock[] = [];
    const conversation: BedrockMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system.push({ text: msg.content });
      } else {
        conversation.push({ role: msg.role, content: [{ text: msg.content }] });
      }
    }
    return { system, conversation };
  }

  /**
   * Invoke a Bedrock model via the Converse API (model-agnostic across
   * Anthropic Claude, Amazon Nova, Meta Llama, etc.). Returns a shape aligned
   * with the Vercel AI SDK `generateText` result so downstream usage/token
   * extraction works uniformly.
   */
  private async bedrockConverse(
    model: AIModelConfig,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    opts: { temperature: number; maxTokens: number },
  ): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    if (!this.bedrockClient) {
      throw new Error(
        'Amazon Bedrock is not configured. Set BEDROCK_REGION + BEDROCK_ACCESS_KEY_ID + ' +
          'BEDROCK_SECRET_ACCESS_KEY (or USE_BEDROCK_DEFAULT_CREDS=true).',
      );
    }
    const { system, conversation } = this.toBedrockMessages(messages);
    const command = new ConverseCommand({
      modelId: model.id,
      messages: conversation,
      ...(system.length > 0 ? { system } : {}),
      inferenceConfig: { maxTokens: opts.maxTokens, temperature: opts.temperature },
    });
    const response = await this.bedrockClient.send(command);
    const text = response.output?.message?.content?.map((block) => block.text ?? '').join('') ?? '';
    return {
      text,
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
      },
    };
  }

  /**
   * Stream a Bedrock model response via the ConverseStream API, yielding text
   * deltas as they arrive.
   */
  private async *bedrockConverseStream(
    model: AIModelConfig,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    opts: { temperature: number; maxTokens: number },
  ): AsyncGenerator<string> {
    if (!this.bedrockClient) {
      throw new Error(
        'Amazon Bedrock is not configured. Set BEDROCK_REGION + BEDROCK_ACCESS_KEY_ID + ' +
          'BEDROCK_SECRET_ACCESS_KEY (or USE_BEDROCK_DEFAULT_CREDS=true).',
      );
    }
    const { system, conversation } = this.toBedrockMessages(messages);
    const command = new ConverseStreamCommand({
      modelId: model.id,
      messages: conversation,
      ...(system.length > 0 ? { system } : {}),
      inferenceConfig: { maxTokens: opts.maxTokens, temperature: opts.temperature },
    });
    const response = await this.bedrockClient.send(command);
    if (!response.stream) return;
    for await (const event of response.stream) {
      const delta = event.contentBlockDelta?.delta?.text;
      if (delta) yield delta;
    }
  }

  /** Build the initial message list for an inference (system + context + user). */
  private buildInitialMessages(
    request: AIInferenceRequest,
    enrichedPrompt: string,
  ): LoopMessage[] {
    const messages: LoopMessage[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    if (request.context) {
      for (const msg of request.context) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: enrichedPrompt });
    return messages;
  }

  /**
   * Run a single model round: one generateText call with tools attached.
   * Returns normalized text + parsed tool calls + token counts. Does NOT
   * execute tool calls — the caller (legacy path or runToolLoop) decides.
   */
  private async generateOnce(
    model: AIModelConfig,
    messages: LoopMessage[],
    request: AIInferenceRequest,
    tools: ToolDefinition[],
    promptEstimateText: string,
  ): Promise<RoundResult> {
    // Amazon Bedrock uses the AWS SDK Converse API directly (no tool support here).
    if (model.provider === 'bedrock') {
      const { text, usage } = await this.bedrockConverse(
        model,
        messages as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
        {
          temperature: request.temperature ?? 0.7,
          maxTokens: request.maxTokens ?? model.maxOutputTokens,
        },
      );
      return {
        text,
        unexecutedToolCalls: [],
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
      };
    }

    // Cloudflare Workers AI, tool-free round: direct OpenAI-compatible HTTP.
    // The AI SDK path cannot run here — `@ai-sdk/openai@1` builds v1 models and
    // `ai@5` rejects them before any request is made.
    if (model.provider === 'cloudflare' && tools.length === 0 && this.cloudflareEndpoint) {
      const result = await compatChatCompletion(this.cloudflareEndpoint, toCompatMessages(messages), {
        model: model.id,
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens ?? model.maxOutputTokens,
        timeoutMs: this.config.requestTimeoutMs,
      });
      return {
        text: result.text,
        unexecutedToolCalls: [],
        promptTokens: result.promptTokens ?? Math.ceil(promptEstimateText.length / 4),
        completionTokens: result.completionTokens ?? Math.ceil(result.text.length / 4),
      };
    }

    const providerModel = this.getProviderModel(model);

    const generateOptions: Record<string, unknown> = {
      model: providerModel as any,
      messages,
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? model.maxOutputTokens,
    };
    if (tools.length > 0) {
      generateOptions['tools'] = toVercelTools(tools);
      // Map our toolChoice to Vercel SDK format
      const tc = request.toolChoice ?? 'auto';
      if (tc === 'auto') generateOptions['toolChoice'] = 'auto';
      else if (tc === 'none') generateOptions['toolChoice'] = 'none';
      else if (tc === 'required') generateOptions['toolChoice'] = 'required';
      else generateOptions['toolChoice'] = { type: 'tool', toolName: tc.toolName };
    }

    const result = await generateText(generateOptions as any);
    const text = result.text || '';

    // Extract tool calls requested by the model
    const toolCalls: ToolCall[] = [];
    const rawToolCalls = (result as any).toolCalls as Array<{
      toolCallId: string;
      toolName: string;
      input: unknown;
    }> | undefined;
    if (rawToolCalls && rawToolCalls.length > 0) {
      for (const rtc of rawToolCalls) {
        toolCalls.push(parseToolCall(rtc));
      }
    }

    return {
      text,
      unexecutedToolCalls: toolCalls,
      promptTokens:
        (result.usage as any)?.promptTokens ??
        result.usage?.inputTokens ??
        Math.ceil(promptEstimateText.length / 4),
      completionTokens:
        (result.usage as any)?.completionTokens ??
        result.usage?.outputTokens ??
        Math.ceil(text.length / 4),
    };
  }

  /**
   * Close the LLM tool-calling loop: propose → permission-check → execute →
   * feed back → repeat, until the model answers without tool calls, a call is
   * held for Sentinel confirmation, the step cap is hit, or the total
   * timeout elapses.
   *
   * Fail-closed ordering per round: EVERY proposed call goes through
   * `hooks.checkToolCall` BEFORE any execution. Denied calls are fed back
   * as tool errors; held calls stop the loop with a pending confirmation.
   */
  private async runToolLoop(
    model: AIModelConfig,
    initialMessages: LoopMessage[],
    request: AIInferenceRequest,
    tools: ToolDefinition[],
    enrichedPrompt: string,
    startTime: number,
  ): Promise<RoundResult> {
    const hooks = request.toolHooks!;
    const maxRounds = request.maxToolRounds ?? 5;
    const timeoutMs = request.toolLoopTimeoutMs ?? 60000;
    const deadline = startTime + timeoutMs;
    const loopCtx: ToolLoopContext = {
      userId: request.userId,
      permissionTier: request.permissionTier ?? 1,
    };

    // Fail the whole loop if any awaited step overruns the total budget.
    const withDeadline = async <T>(promise: Promise<T>, what: string): Promise<T> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Tool loop timed out ${what}`);
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Tool loop timed out ${what}`)),
              remaining,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const workingMessages: LoopMessage[] = [...initialMessages];
    let promptTokens = 0;
    let completionTokens = 0;
    let rounds = 0;
    let lastText = '';
    let pendingConfirmation: RoundResult['pendingConfirmation'];
    let unexecutedToolCalls: ToolCall[] = [];
    let truncated = false;

    while (true) {
      const round = await withDeadline(
        retryWithBackoff(
          () => this.generateOnce(model, workingMessages, request, tools, enrichedPrompt),
          { maxRetries: this.config.retryAttempts, baseDelayMs: this.config.retryDelayMs },
        ),
        'waiting for model',
      );
      promptTokens += round.promptTokens;
      completionTokens += round.completionTokens;
      lastText = round.text;

      const proposed = round.unexecutedToolCalls;
      if (proposed.length === 0) {
        break;
      }

      if (rounds >= maxRounds) {
        // Step cap hit: stop looping and hand the unexecuted calls back
        // to the caller instead of executing them.
        unexecutedToolCalls = proposed;
        truncated = true;
        break;
      }
      rounds += 1;

      // Gate EVERY proposed call before execution (fail-closed).
      const executed: LlmToolResult[] = [];
      let held: HeldToolCalls | null = null;
      for (const call of proposed) {
        const verdict = hooks.checkToolCall
          ? await withDeadline(hooks.checkToolCall(call, loopCtx), `checking tool '${call.name}'`)
          : { decision: 'allow' as const };
        if (verdict.decision === 'deny') {
          executed.push({
            toolCallId: call.id,
            name: call.name,
            success: false,
            error: `Denied: ${verdict.reason}`,
          });
          continue;
        }
        if (verdict.decision === 'hold') {
          held = { holdToken: verdict.holdToken, reason: verdict.reason, calls: proposed };
          break;
        }
        if (!hooks.executeToolCall) {
          executed.push({
            toolCallId: call.id,
            name: call.name,
            success: false,
            error: 'No tool executor configured for this loop',
          });
          continue;
        }
        const res = await withDeadline(
          hooks.executeToolCall(call, loopCtx),
          `executing tool '${call.name}'`,
        );
        executed.push(res);
      }

      if (held) {
        pendingConfirmation = {
          holdToken: held.holdToken,
          reason: held.reason,
          calls: held.calls,
        };
        break;
      }

      // Feed tool results back to the model for the next round.
      workingMessages.push({
        role: 'assistant',
        content: [
          ...(lastText ? [{ type: 'text', text: lastText }] : []),
          ...proposed.map((c) => ({
            type: 'tool-call',
            toolCallId: c.id,
            toolName: c.name,
            input: c.arguments,
          })),
        ],
      });
      workingMessages.push({
        role: 'tool',
        content: executed.map((e) => ({
          type: 'tool-result',
          toolCallId: e.toolCallId,
          toolName: e.name,
          output: {
            type: 'text',
            value: JSON.stringify(
              e.success ? (e.result ?? null) : { error: e.error ?? 'Tool execution failed' },
            ),
          },
        })),
      });
    }

    return {
      text: lastText,
      unexecutedToolCalls,
      promptTokens,
      completionTokens,
      pendingConfirmation,
      truncated,
    };
  }

  /**
   * Process an AI inference request
   */
  async infer(request: AIInferenceRequest): Promise<AIInferenceResponse> {
    // Check rate limits and budgets
    this.costTracker.checkBudget(request.userId);
    this.costTracker.checkRateLimit(request.userId);

    // Process input through safety pipeline
    const safetyResult = this.safetyPipeline.processInput(request.prompt);
    const safePrompt = safetyResult.text;

    // Deployed-environment model contract: when the environment pins a model
    // (AI_PROVIDER=custom → AI_MODEL; AI_PROVIDER=cloudflare →
    // CLOUDFLARE_AI_MODEL ?? AI_DEFAULT_MODEL), the pin wins over scoring
    // unless the caller named a model explicitly.
    const effectiveRequest =
      this.deployedModelPin && !request.model
        ? { ...request, model: this.deployedModelPin }
        : request;

    // Route to the model FIRST. Fail-closed: selectModel throws on an
    // unknown/unavailable configured or requested model instead of silently
    // substituting a different (possibly deprecated) model.
    const model = this.modelRouter.selectModel(effectiveRequest);

    // Check semantic cache. The scope (user + app + feature + model) is the
    // CODEX-REVIEW isolation gate: one user's cached result can never serve
    // another user's request, even for byte-identical prompts.
    const cacheScope: CacheScope = {
      userId: effectiveRequest.userId,
      app: effectiveRequest.app,
      feature: effectiveRequest.feature,
      model: model.id,
    };
    if (this.config.enableCaching && !request.stream) {
      const cached = this.semanticCache.get(safePrompt, undefined, cacheScope);
      if (cached) {
        return {
          id: this.generateRequestId(),
          content: cached,
          model: model.id,
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
          latencyMs: 0,
          cached: true,
        };
      }
    }

    // Build context-enriched prompt (via memory facade; legacy mode = unchanged).
    // Stateless requests (one-shot analyses) never read conversation memory.
    const enrichedPrompt = request.stateless
      ? safePrompt
      : await this.memory.enrich(request.userId, safePrompt, request.context || []);

    // Execute with circuit breaker and retry
    const breaker = this.circuitBreakerRegistry.getBreaker(model.provider);

    const startTime = Date.now();
    this.activeRequests++;

    // Function calling: validate tool definitions once up front.
    const tools = request.tools ?? [];
    if (tools.length > 0) {
      validateToolDefinitions(tools);
    }

    const initialMessages = this.buildInitialMessages(request, enrichedPrompt);

    // Close the tool-calling loop internally when the host provided hooks:
    // propose → permission-check → execute → feed back → repeat.
    // (Bedrock has no tool support in this engine — legacy single round.)
    const runToolLoop =
      tools.length > 0 &&
      request.toolHooks != null &&
      (request.maxToolRounds ?? 5) > 0 &&
      model.provider !== 'bedrock';

    try {
      const round: RoundResult = await breaker.execute(async () => {
        if (!runToolLoop) {
          // Legacy single-round path (behavior unchanged).
          return retryWithBackoff(
            () => this.generateOnce(model, initialMessages, request, tools, enrichedPrompt),
            { maxRetries: this.config.retryAttempts, baseDelayMs: this.config.retryDelayMs },
          );
        }
        return this.runToolLoop(
          model,
          initialMessages,
          request,
          tools,
          enrichedPrompt,
          startTime,
        );
      });

      const latencyMs = Date.now() - startTime;

      // Calculate usage (accumulated across loop rounds)
      const usage: TokenUsage = {
        promptTokens: round.promptTokens,
        completionTokens: round.completionTokens,
        totalTokens: round.promptTokens + round.completionTokens,
        estimatedCost: 0,
      };
      usage.estimatedCost =
        usage.promptTokens * model.costPerInputToken +
        usage.completionTokens * model.costPerOutputToken;

      // Track costs
      this.costTracker.trackUsage(
        request.userId,
        model.id,
        usage.promptTokens,
        usage.completionTokens,
        usage.estimatedCost,
      );

      const content = round.text || '';

      // Tool calls the model requested but which were NOT executed: the
      // legacy single-round path, or a loop that hit its step cap.
      const toolCalls = round.unexecutedToolCalls;

      // Process output through safety pipeline
      const outputSafety = this.safetyPipeline.processOutput(content);

      // Cache the response (skip caching when tool calls are involved,
      // since the response depends on tool execution results). Writes carry
      // the same (user, app, feature, model) scope as reads.
      if (this.config.enableCaching && toolCalls.length === 0 && !runToolLoop) {
        this.semanticCache.set(safePrompt, outputSafety.text, undefined, cacheScope);
      }

      // Update conversation context (via memory facade; legacy mode = unchanged)
      if (!request.stateless) {
        await this.memory.record(request.userId, request.prompt, outputSafety.text);
      }

      return {
        id: this.generateRequestId(),
        content: outputSafety.text,
        model: model.id,
        finishReason: round.pendingConfirmation
          ? 'confirmation_required'
          : toolCalls.length > 0
            ? 'tool_calls'
            : 'stop',
        usage,
        latencyMs,
        cached: false,
        pendingConfirmation: round.pendingConfirmation,
        toolLoopTruncated: round.truncated || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Stream an AI inference response
   */
  async *stream(request: AIInferenceRequest): AsyncGenerator<StreamChunk> {
    // Check rate limits and budgets
    this.costTracker.checkBudget(request.userId);
    this.costTracker.checkRateLimit(request.userId);

    // Process input through safety pipeline
    const safetyResult = this.safetyPipeline.processInput(request.prompt);
    const safePrompt = safetyResult.text;

    // Deployed-environment model contract (see infer()): the environment
    // pin wins over scoring unless the caller named a model explicitly.
    const effectiveRequest =
      this.deployedModelPin && !request.model
        ? { ...request, model: this.deployedModelPin }
        : request;
    const model = this.modelRouter.selectModel(effectiveRequest);
    const enrichedPrompt = request.stateless
      ? safePrompt
      : await this.memory.enrich(request.userId, safePrompt, request.context || []);

    const requestId = this.generateRequestId();

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    if (request.context) {
      for (const msg of request.context) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: enrichedPrompt });

    // Wrap the initial stream setup in the circuit breaker
    const breaker = this.circuitBreakerRegistry.getBreaker(model.provider);
    let textStream: AsyncIterable<string>;

    try {
      if (model.provider === 'bedrock') {
        // The AWS call is issued lazily on first iteration of the generator.
        textStream = this.bedrockConverseStream(model, messages, {
          temperature: request.temperature ?? 0.7,
          maxTokens: request.maxTokens ?? model.maxOutputTokens,
        });
      } else if (
        model.provider === 'cloudflare' &&
        (request.tools ?? []).length === 0 &&
        this.cloudflareEndpoint
      ) {
        // Same direct transport as `generateOnce`; the request is issued on
        // first iteration, so failures land in the catch below (breaker).
        textStream = compatChatCompletionStream(this.cloudflareEndpoint, messages, {
          model: model.id,
          temperature: request.temperature ?? 0.7,
          maxTokens: request.maxTokens ?? model.maxOutputTokens,
          timeoutMs: this.config.requestTimeoutMs,
        });
      } else {
        const providerModel = this.getProviderModel(model);
        const result = await breaker.execute(async () => {
          const streamOptions: Record<string, unknown> = {
            model: providerModel as any,
            messages,
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens ?? model.maxOutputTokens,
          };
          const tools = request.tools ?? [];
          if (tools.length > 0) {
            validateToolDefinitions(tools);
            streamOptions['tools'] = toVercelTools(tools);
            const tc = request.toolChoice ?? 'auto';
            if (tc === 'auto') streamOptions['toolChoice'] = 'auto';
            else if (tc === 'none') streamOptions['toolChoice'] = 'none';
            else if (tc === 'required') streamOptions['toolChoice'] = 'required';
            else streamOptions['toolChoice'] = { type: 'tool', toolName: tc.toolName };
          }
          return streamText(streamOptions as any);
        });
        textStream = result.textStream;
        // Capture tool calls from the stream result for the final chunk
        const toolCallsPromise = (async () => {
          try {
            const rtc = (await (result as any).toolCalls) as Array<{
              toolCallId: string;
              toolName: string;
              input: unknown;
            }> | undefined;
            return (rtc ?? []).map(parseToolCall);
          } catch {
            return [];
          }
        })();
        (textStream as any).__toolCallsPromise = toolCallsPromise;
      }
    } catch (error) {
      // Circuit breaker recorded the failure
      throw error;
    }

    let accumulated = '';
    let streamFailed = false;

    try {
      for await (const chunk of textStream) {
        accumulated += chunk;
        yield {
          id: requestId,
          content: chunk,
          done: false,
        };
      }
    } catch (error) {
      // Record streaming failure in the circuit breaker
      streamFailed = true;
      breaker.onFailure();
      throw error;
    }

    if (!streamFailed) {
      // Collect any tool calls the model requested during streaming
      let streamToolCalls: ToolCall[] | undefined;
      try {
        const p = (textStream as any).__toolCallsPromise as Promise<ToolCall[]> | undefined;
        if (p) {
          const tc = await p;
          if (tc.length > 0) streamToolCalls = tc;
        }
      } catch {
        // ignore tool-call collection errors; text already streamed
      }
      yield {
        id: requestId,
        content: '',
        done: true,
        finishReason: streamToolCalls ? 'tool_calls' : 'stop',
        toolCalls: streamToolCalls,
      };
    }

    // Update context with the response (via memory facade; legacy mode = unchanged)
    if (!request.stateless) {
      await this.memory.record(request.userId, request.prompt, accumulated);
    }

    // Track usage (estimated)
    const promptTokens = Math.ceil(enrichedPrompt.length / 4);
    const completionTokens = Math.ceil(accumulated.length / 4);
    const cost =
      promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken;
    this.costTracker.trackUsage(request.userId, model.id, promptTokens, completionTokens, cost);
  }

  /** Monotonic per-process counter guaranteeing collision-free request IDs. */
  private static requestSequence = 0;

  /**
   * Generate a unique request ID (deterministic counter, never Math.random).
   */
  private generateRequestId(): string {
    AIEngine.requestSequence += 1;
    return `ai_req_${Date.now().toString(36)}_${AIEngine.requestSequence.toString(36)}`;
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    activeRequests: number;
    cacheSize: number;
    dailyCost: number;
  } {
    return {
      activeRequests: this.activeRequests,
      cacheSize: this.semanticCache.size(),
      dailyCost: this.costTracker.getDailySpend(),
    };
  }

  /**
   * Clear the response cache
   */
  clearCache(): void {
    this.semanticCache.invalidate();
  }

  /**
   * Get context manager for external access
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get model router for external access
   */
  getModelRouter(): ModelRouter {
    return this.modelRouter;
  }

  /**
   * Get cost tracker for external access
   */
  getCostTracker(): CostTracker {
    return this.costTracker;
  }

  /**
   * Get safety pipeline for external access
   */
  getSafetyPipeline(): SafetyPipeline {
    return this.safetyPipeline;
  }
}
