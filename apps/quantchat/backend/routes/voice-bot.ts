import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CallService } from '../services/call.service';
import { VoiceBotAgentService } from '../services/voice-bot-agent.service';
import { MeetingReminderDialogueService } from '../services/meeting-reminder-dialogue.service';
import { CallRingGeneratorService } from '../services/call-ring-generator.service';

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
        userToken: activeCall.userToken,
        ringStartedAt: activeCall.ringStartedAt,
      },
    });
  });

  // POST /voice-bot/calls/:callId/answer — User answers incoming call
  fastify.post<{ Params: { callId: string } }>('/calls/:callId/answer', async (request, reply) => {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    const call = ringGenerator.getCall(request.params.callId);

    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    // Use authenticated userId or fallback to targeted user in call record
    const targetUserId = userId || call.userId;

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
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    const call = ringGenerator.getCall(request.params.callId);

    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }

    const targetUserId = userId || call.userId;
    await ringGenerator.declineCall(request.params.callId, targetUserId);

    return reply.send({
      success: true,
      data: { message: 'Call declined' },
    });
  });

  // POST /voice-bot/calls/:callId/turn — User sends conversational turn (voice or text)
  fastify.post<{ Params: { callId: string } }>('/calls/:callId/turn', async (request, reply) => {
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
    const call = ringGenerator.getCall(request.params.callId);
    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
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
