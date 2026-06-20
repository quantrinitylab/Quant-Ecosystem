import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from '../services/chat.service';

function createMockPrisma() {
  return {
    aISession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    aIMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  };
}

function createMockEngine() {
  return {
    infer: vi.fn(),
    stream: vi.fn(),
  };
}

describe('ChatService', () => {
  let service: ChatService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(() => {
    prisma = createMockPrisma();
    engine = createMockEngine();
    service = new ChatService(prisma as never, engine as never);
  });

  describe('sendMessage', () => {
    it('creates user message, calls engine, and stores assistant response', async () => {
      const session = {
        id: 'session-1',
        userId: 'user-1',
        model: 'gpt-4',
        systemPrompt: 'You are helpful.',
      };
      prisma.aISession.findUnique.mockResolvedValue(session);
      prisma.aIMessage.create
        .mockResolvedValueOnce({ id: 'msg-user', role: 'USER', content: 'Hello' })
        .mockResolvedValueOnce({
          id: 'msg-assistant',
          role: 'ASSISTANT',
          content: 'Hi there!',
          tokenCount: 100,
          model: 'gpt-4',
          latencyMs: 500,
        });
      prisma.aIMessage.findMany.mockResolvedValue([
        { role: 'USER', content: 'Hello', createdAt: new Date() },
      ]);
      prisma.aISession.update.mockResolvedValue({});

      engine.infer.mockResolvedValue({
        id: 'resp-1',
        content: 'Hi there!',
        model: 'gpt-4',
        finishReason: 'stop',
        usage: {
          promptTokens: 50,
          completionTokens: 50,
          totalTokens: 100,
          estimatedCost: 0.003,
        },
        latencyMs: 500,
        cached: false,
      });

      const result = await service.sendMessage('session-1', 'user-1', 'Hello');

      // Verify user message was created
      expect(prisma.aIMessage.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          role: 'USER',
          content: 'Hello',
          attachments: [],
        },
      });

      // Verify engine was called with context
      expect(engine.infer).toHaveBeenCalledWith({
        prompt: 'Hello',
        systemPrompt: 'You are helpful.',
        context: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
        userId: 'user-1',
        app: 'quantai',
        feature: 'chat',
      });

      // Verify assistant message was created
      expect(prisma.aIMessage.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          role: 'ASSISTANT',
          content: 'Hi there!',
          tokenCount: 100,
          model: 'gpt-4',
          latencyMs: expect.any(Number),
        },
      });

      // Verify session totals updated
      expect(prisma.aISession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: {
          totalTokensUsed: { increment: 100 },
          totalCost: { increment: 0.003 },
          updatedAt: expect.any(Date),
        },
      });

      expect(result.message.role).toBe('ASSISTANT');
      expect(result.usage.totalTokens).toBe(100);
    });

    it('throws SESSION_NOT_FOUND for non-existent session', async () => {
      prisma.aISession.findUnique.mockResolvedValue(null);

      await expect(service.sendMessage('missing', 'user-1', 'Hello')).rejects.toThrow(
        'Session not found',
      );
    });

    it('throws ACCESS_DENIED when user does not own session', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-other',
      });

      await expect(service.sendMessage('session-1', 'user-1', 'Hello')).rejects.toThrow(
        'Access denied',
      );
    });

    it('propagates engine errors', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        model: 'gpt-4',
        systemPrompt: null,
      });
      prisma.aIMessage.create.mockResolvedValue({ id: 'msg-1' });
      prisma.aIMessage.findMany.mockResolvedValue([]);
      engine.infer.mockRejectedValue(new Error('AI engine unavailable'));

      await expect(service.sendMessage('session-1', 'user-1', 'Hello')).rejects.toThrow(
        'AI engine unavailable',
      );
    });

    it('includes attachments in user message', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        model: 'gpt-4',
        systemPrompt: null,
      });
      prisma.aIMessage.create.mockResolvedValue({ id: 'msg-1', role: 'ASSISTANT', content: 'ok' });
      prisma.aIMessage.findMany.mockResolvedValue([]);
      prisma.aISession.update.mockResolvedValue({});
      engine.infer.mockResolvedValue({
        content: 'ok',
        model: 'gpt-4',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 },
      });

      const attachments = [{ type: 'image', url: 'https://example.com/img.png' }];
      await service.sendMessage('session-1', 'user-1', 'Check this', attachments);

      expect(prisma.aIMessage.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          role: 'USER',
          content: 'Check this',
          attachments,
        },
      });
    });
  });

  describe('getHistory', () => {
    it('returns paginated messages for owned session', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
      });
      const messages = [
        { id: 'msg-1', role: 'USER', content: 'Hello' },
        { id: 'msg-2', role: 'ASSISTANT', content: 'Hi' },
      ];
      prisma.aIMessage.findMany.mockResolvedValue(messages);
      prisma.aIMessage.count.mockResolvedValue(2);

      const result = await service.getHistory('session-1', 'user-1', { page: 1, pageSize: 50 });

      expect(result.data).toEqual(messages);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it('throws ACCESS_DENIED when user does not own session', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-other',
      });

      await expect(service.getHistory('session-1', 'user-1')).rejects.toThrow('Access denied');
    });
  });

  describe('setFeedback', () => {
    beforeEach(() => {
      prisma.aISession.findUnique.mockResolvedValue({ id: 'session-1', userId: 'user-1' });
    });

    it('sets POSITIVE feedback on an owned assistant message', async () => {
      prisma.aIMessage.findUnique.mockResolvedValue({
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'ASSISTANT',
      });
      prisma.aIMessage.update.mockResolvedValue({
        id: 'msg-1',
        role: 'ASSISTANT',
        feedback: 'POSITIVE',
      });

      const result = await service.setFeedback('session-1', 'user-1', 'msg-1', 'POSITIVE');

      expect(result.feedback).toBe('POSITIVE');
      expect(prisma.aIMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { feedback: 'POSITIVE' },
      });
    });

    it('clears feedback when passed null', async () => {
      prisma.aIMessage.findUnique.mockResolvedValue({
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'ASSISTANT',
      });
      prisma.aIMessage.update.mockResolvedValue({ id: 'msg-1', feedback: null });

      await service.setFeedback('session-1', 'user-1', 'msg-1', null);

      expect(prisma.aIMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { feedback: null },
      });
    });

    it('throws ACCESS_DENIED when user does not own the session', async () => {
      prisma.aISession.findUnique.mockResolvedValue({ id: 'session-1', userId: 'someone-else' });

      await expect(service.setFeedback('session-1', 'user-1', 'msg-1', 'POSITIVE')).rejects.toThrow(
        'Access denied',
      );
    });

    it('throws MESSAGE_NOT_FOUND when the message belongs to another session', async () => {
      prisma.aIMessage.findUnique.mockResolvedValue({
        id: 'msg-1',
        sessionId: 'other-session',
        role: 'ASSISTANT',
      });

      await expect(service.setFeedback('session-1', 'user-1', 'msg-1', 'POSITIVE')).rejects.toThrow(
        'Message not found',
      );
    });

    it('rejects feedback on non-assistant messages', async () => {
      prisma.aIMessage.findUnique.mockResolvedValue({
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'USER',
      });

      await expect(service.setFeedback('session-1', 'user-1', 'msg-1', 'NEGATIVE')).rejects.toThrow(
        'Feedback can only be set on assistant messages',
      );
    });
  });

  describe('streamMessage', () => {
    it('creates user message, streams from engine, stores response', async () => {
      prisma.aISession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        model: 'gpt-4',
        systemPrompt: null,
      });
      prisma.aIMessage.create.mockResolvedValue({ id: 'msg-1' });
      prisma.aIMessage.findMany.mockResolvedValue([]);
      prisma.aISession.update.mockResolvedValue({});

      async function* mockStream() {
        yield { id: 'req-1', content: 'Hello ', done: false };
        yield { id: 'req-1', content: 'world!', done: false };
        yield { id: 'req-1', content: '', done: true, finishReason: 'stop' };
      }

      engine.stream.mockReturnValue(mockStream());

      const chunks: unknown[] = [];
      for await (const chunk of service.streamMessage('session-1', 'user-1', 'Hi')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(prisma.aIMessage.create).toHaveBeenCalledTimes(2); // user + assistant
    });
  });
});
