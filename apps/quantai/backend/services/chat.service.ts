import { createAppError } from '@quant/server-core';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface AIMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  attachments: unknown;
  functionCall: unknown;
  tokenCount: number | null;
  model: string | null;
  latencyMs: number | null;
  feedback: string | null;
  createdAt: Date;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface AIInferenceResponse {
  id: string;
  content: string;
  model: string;
  finishReason: string;
  usage: TokenUsage;
  latencyMs: number;
  cached: boolean;
}

export interface StreamChunk {
  id: string;
  content: string;
  done: boolean;
  finishReason?: string;
}

export interface AIInferenceRequest {
  prompt: string;
  systemPrompt?: string;
  context?: Array<{ role: string; content: string }>;
  model?: string;
  userId: string;
  app: string;
  feature: string;
  stream?: boolean;
}

export interface AIEngineInterface {
  infer: (request: AIInferenceRequest) => Promise<AIInferenceResponse>;
  stream: (request: AIInferenceRequest) => AsyncGenerator<StreamChunk>;
}

export interface ChatPrismaClient {
  aISession: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: string;
      userId: string;
      model: string;
      systemPrompt: string | null;
    } | null>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  aIMessage: {
    create: (args: { data: Record<string, unknown> }) => Promise<AIMessage>;
    findMany: (args: Record<string, unknown>) => Promise<AIMessage[]>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<AIMessage | null>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<AIMessage>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
}

/** Feedback a user can attach to an assistant message. `null` clears it. */
export type FeedbackValue = 'POSITIVE' | 'NEGATIVE' | null;

export interface SendMessageResult {
  message: AIMessage;
  usage: TokenUsage;
}

export class ChatService {
  constructor(
    private readonly prisma: ChatPrismaClient,
    private readonly engine?: AIEngineInterface,
  ) {}

  private requireEngine(): AIEngineInterface {
    if (!this.engine) {
      throw createAppError('AI engine not configured', 500, 'ENGINE_NOT_CONFIGURED');
    }
    return this.engine;
  }

  async sendMessage(
    sessionId: string,
    userId: string,
    content: string,
    attachments?: Record<string, unknown>[],
  ): Promise<SendMessageResult> {
    // Verify session ownership
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    // Create user message
    await this.prisma.aIMessage.create({
      data: {
        sessionId,
        role: 'USER',
        content,
        attachments: attachments ?? [],
      },
    });

    // Get session history for context
    const messages = await this.prisma.aIMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const context = messages.map((msg: AIMessage) => ({
      role: msg.role.toLowerCase(),
      content: msg.content,
    }));

    // Call AI engine
    const startTime = Date.now();
    const response = await this.requireEngine().infer({
      prompt: content,
      systemPrompt: session.systemPrompt ?? undefined,
      context,
      model: session.model,
      userId,
      app: 'quantai',
      feature: 'chat',
    });
    const latencyMs = Date.now() - startTime;

    // Create assistant message
    const assistantMessage = await this.prisma.aIMessage.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: response.content,
        tokenCount: response.usage.totalTokens,
        model: response.model,
        latencyMs,
      },
    });

    // Update session totals
    await this.prisma.aISession.update({
      where: { id: sessionId },
      data: {
        totalTokensUsed: { increment: response.usage.totalTokens },
        totalCost: { increment: response.usage.estimatedCost },
        updatedAt: new Date(),
      },
    });

    return {
      message: assistantMessage,
      usage: response.usage,
    };
  }

  async *streamMessage(
    sessionId: string,
    userId: string,
    content: string,
  ): AsyncGenerator<StreamChunk> {
    // Verify session ownership
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    // Create user message
    await this.prisma.aIMessage.create({
      data: {
        sessionId,
        role: 'USER',
        content,
        attachments: [],
      },
    });

    // Get session history for context
    const messages = await this.prisma.aIMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const context = messages.map((msg: AIMessage) => ({
      role: msg.role.toLowerCase(),
      content: msg.content,
    }));

    // Stream from AI engine
    const stream = this.requireEngine().stream({
      prompt: content,
      systemPrompt: session.systemPrompt ?? undefined,
      context,
      model: session.model,
      userId,
      app: 'quantai',
      feature: 'chat-stream',
      stream: true,
    });

    let accumulated = '';
    for await (const chunk of stream) {
      accumulated += chunk.content;
      yield chunk;
    }

    // Store assistant message after stream completes
    const tokenCount = Math.ceil(accumulated.length / 4);
    await this.prisma.aIMessage.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: accumulated,
        tokenCount,
        model: session.model,
      },
    });

    // Update session totals
    await this.prisma.aISession.update({
      where: { id: sessionId },
      data: {
        totalTokensUsed: { increment: tokenCount },
        updatedAt: new Date(),
      },
    });
  }

  async getHistory(
    sessionId: string,
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<AIMessage>> {
    // Verify session ownership
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.aIMessage.findMany({
        where: { sessionId },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.aIMessage.count({ where: { sessionId } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Attach (or clear) thumbs-up / thumbs-down feedback on an assistant message.
   * Verifies the session is owned by the user and the message belongs to it.
   * Feedback drives the quality/eval loop and is safe to call repeatedly.
   */
  async setFeedback(
    sessionId: string,
    userId: string,
    messageId: string,
    feedback: FeedbackValue,
  ): Promise<AIMessage> {
    const session = await this.prisma.aISession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }
    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    const message = await this.prisma.aIMessage.findUnique({ where: { id: messageId } });
    if (!message || message.sessionId !== sessionId) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }
    if (message.role !== 'ASSISTANT') {
      throw createAppError(
        'Feedback can only be set on assistant messages',
        400,
        'INVALID_FEEDBACK_TARGET',
      );
    }

    return this.prisma.aIMessage.update({
      where: { id: messageId },
      data: { feedback },
    });
  }
}
