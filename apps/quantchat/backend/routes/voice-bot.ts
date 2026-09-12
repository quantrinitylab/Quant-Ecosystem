import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CallService } from '../services/call.service';
import { VoiceBotAgentService } from '../services/voice-bot-agent.service';
import { MeetingReminderDialogueService } from '../services/meeting-reminder-dialogue.service';
import { CallRingGeneratorService } from '../services/call-ring-generator.service';

export function validVoiceBotSignature(
  body: string,
  supplied: string | undefined,
  secret: string,
): boolean {
  if (!supplied?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('hex'), 'hex');
  const actualHex = supplied.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(actualHex)) return false;
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const triggerAlertSchema = z.object({
  userId: z.string().min(1),
  meetingId: z.string().min(1),
  title: z.string().min(1),
  organizer: z.string().min(1),
  startTime: z.string(),
  minutesUntilStart: z.number().default(5),
  userName: z.string().optional(),
  locale: z.enum(['en', 'hi', 'hinglish']).optional().default('hinglish'),
  joinUrl: z.string().optional(),
});

const dialogueTurnSchema = z.object({
  userUtterance: z.string().min(1),
});

export function createVoiceBotServices(fastify: FastifyInstance) {
  const callService = new CallService({
    apiKey: process.env['LIVEKIT_API_KEY'] ?? 'devkey',
    apiSecret: process.env['LIVEKIT_API_SECRET'] ?? 'devsecret',
    wsUrl: process.env['LIVEKIT_WS_URL'] ?? 'ws://localhost:7880',
  });

  const voiceBot = new VoiceBotAgentService({
    apiKey: process.env['LIVEKIT_API_KEY'] ?? 'devkey',
    apiSecret: process.env['LIVEKIT_API_SECRET'] ?? 'devsecret',
    wsUrl: process.env['LIVEKIT_WS_URL'] ?? 'ws://localhost:7880',
  });

  const dialogue = new MeetingReminderDialogueService();

  const broadcaster = {
    publish: (event: string, payload: Record<string, unknown>) => {
      fastify.log.info({ event, payload }, 'Broadcasting voice bot call event');
    },
  };

  const ringGenerator = new CallRingGeneratorService({
    callService,
    voiceBot,
    dialogueService: dialogue,
    broadcaster,
  });

  return { callService, voiceBot, dialogue, ringGenerator };
}

export interface VoiceBotRouteOptions {
  ringGenerator?: CallRingGeneratorService;
  voiceBot?: VoiceBotAgentService;
  dialogue?: MeetingReminderDialogueService;
}

export default async function voiceBotRoutes(
  fastify: FastifyInstance,
  options: VoiceBotRouteOptions = {},
) {
  // Store or retrieve singleton instance on fastify
  const decorated = (
    fastify as unknown as {
      voiceBotServices?: ReturnType<typeof createVoiceBotServices>;
    }
  ).voiceBotServices;
  const services = decorated || createVoiceBotServices(fastify);
  const ringGenerator = options.ringGenerator || services.ringGenerator;
  const voiceBot = options.voiceBot || services.voiceBot;

  // POST /voice-bot/alert — Trigger outbound call alert for a meeting
  fastify.post('/alert', async (request, reply) => {
    const signature = request.headers['x-quant-signature'] as string | undefined;
    const internalSecret = process.env['VOICE_BOT_SECRET'] || process.env['LIVEKIT_API_SECRET'];
    const isDeployed =
      process.env['NODE_ENV'] === 'production' || process.env['NODE_ENV'] === 'staging';
    if (!internalSecret && isDeployed) {
      throw createAppError(
        'VOICE_BOT_SECRET environment variable is required in production and staging',
        500,
        'INTERNAL_SERVER_ERROR',
      );
    }
    const secret =
      internalSecret ||
      (process.env['NODE_ENV'] === 'test' || process.env['NODE_ENV'] === 'development'
        ? 'devsecret'
        : '');

    // Fail-closed HMAC validation:
    // Required in all non-test environments or when ENFORCE_VOICE_BOT_HMAC is true
    const isEnforced =
      process.env['NODE_ENV'] !== 'test' || process.env['ENFORCE_VOICE_BOT_HMAC'] === 'true';
    if (isEnforced) {
      if (!signature) {
        throw createAppError('Missing x-quant-signature header', 401, 'UNAUTHORIZED');
      }
      const payloadString =
        typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      if (!validVoiceBotSignature(payloadString, signature, secret)) {
        throw createAppError('Invalid HMAC signature', 401, 'UNAUTHORIZED');
      }
    } else if (signature) {
      const payloadString =
        typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      if (!validVoiceBotSignature(payloadString, signature, secret)) {
        throw createAppError('Invalid HMAC signature', 401, 'UNAUTHORIZED');
      }
    }

    const parseResult = triggerAlertSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const activeCall = await ringGenerator.triggerMeetingCallAlert(parseResult.data);
    return reply.status(201).send({
      success: true,
      data: {
        callId: activeCall.callId,
        roomName: activeCall.roomName,
        userId: activeCall.userId,
        state: activeCall.state,
        ringStartedAt: activeCall.ringStartedAt,
      },
    });
  });

  // POST /voice-bot/calls/:callId/answer — User answers incoming call
  fastify.post<{ Params: { callId: string } }>('/calls/:callId/answer', async (request, reply) => {
    const authUserId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    const call = ringGenerator.getCall(request.params.callId);

    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    if (authUserId) {
      if (authUserId !== call.userId) {
        throw createAppError('You are not authorized to answer this call', 403, 'FORBIDDEN');
      }
    } else if (process.env['NODE_ENV'] !== 'test') {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const targetUserId = authUserId || call.userId;
    const result = await ringGenerator.answerCall(request.params.callId, targetUserId);
    return reply.send({
      success: true,
      data: {
        callId: result.call.callId,
        state: result.call.state,
        roomName: result.call.roomName,
        userToken: result.call.userToken,
        voiceSessionId: result.call.voiceSessionId,
        greetingText: result.greetingText,
        greetingAudioDurationMs: result.greetingAudio.durationMs,
        greetingAudioBase64: result.greetingAudio.audioBuffer.toString('base64'),
      },
    });
  });

  // POST /voice-bot/calls/:callId/decline — User declines call
  fastify.post<{ Params: { callId: string } }>('/calls/:callId/decline', async (request, reply) => {
    const authUserId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    const call = ringGenerator.getCall(request.params.callId);

    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    if (authUserId) {
      if (authUserId !== call.userId) {
        throw createAppError('You are not authorized to decline this call', 403, 'FORBIDDEN');
      }
    } else if (process.env['NODE_ENV'] !== 'test') {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const targetUserId = authUserId || call.userId;
    await ringGenerator.declineCall(request.params.callId, targetUserId);

    return reply.send({
      success: true,
      data: { message: 'Call declined' },
    });
  });

  // POST /voice-bot/calls/:callId/turn — User sends conversational turn (voice or text)
  fastify.post<{ Params: { callId: string } }>('/calls/:callId/turn', async (request, reply) => {
    const authUserId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    const call = ringGenerator.getCall(request.params.callId);

    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    if (authUserId) {
      if (authUserId !== call.userId) {
        throw createAppError(
          'You are not authorized to send turns for this call',
          403,
          'FORBIDDEN',
        );
      }
    } else if (process.env['NODE_ENV'] !== 'test') {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = dialogueTurnSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const result = await ringGenerator.processDialogueTurn(
      request.params.callId,
      parseResult.data.userUtterance,
    );

    return reply.send({
      success: true,
      data: {
        intent: result.dialogueResult.intent,
        speechText: result.botSpeech,
        actionRequired: result.dialogueResult.actionRequired,
        actionPayload: result.dialogueResult.actionPayload,
        shouldEndCall: result.dialogueResult.shouldEndCall,
        audioDurationMs: result.botAudio.durationMs,
        audioBase64: result.botAudio.audioBuffer.toString('base64'),
      },
    });
  });

  // GET /voice-bot/calls/:callId — Get call & transcript status
  fastify.get<{ Params: { callId: string } }>('/calls/:callId', async (request, reply) => {
    const authUserId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    const call = ringGenerator.getCall(request.params.callId);
    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    if (authUserId) {
      if (authUserId !== call.userId) {
        throw createAppError('You are not authorized to view this call', 403, 'FORBIDDEN');
      }
    } else if (process.env['NODE_ENV'] !== 'test') {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const session = call.voiceSessionId ? voiceBot.getSession(call.voiceSessionId) : undefined;

    return reply.send({
      success: true,
      data: {
        callId: call.callId,
        roomName: call.roomName,
        userId: call.userId,
        state: call.state,
        context: call.context,
        transcript: session?.transcript || [],
        lastDialogueResult: call.lastDialogueResult,
        ringStartedAt: call.ringStartedAt,
        answeredAt: call.answeredAt,
        endedAt: call.endedAt,
      },
    });
  });
}
