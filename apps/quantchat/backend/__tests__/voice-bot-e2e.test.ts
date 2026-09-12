import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import voiceBotRoutes from '../routes/voice-bot';
import { ProactiveCallWorker } from '../services/proactive-call-worker.service';
import { CallRingGeneratorService } from '../services/call-ring-generator.service';
import { CallService } from '../services/call.service';
import { VoiceBotAgentService } from '../services/voice-bot-agent.service';
import { MeetingReminderDialogueService } from '../services/meeting-reminder-dialogue.service';
import type { ProactiveAgentJob } from '@quant/queue';

vi.mock('livekit-server-sdk', () => {
  const mockCreateRoom = vi.fn().mockResolvedValue({
    name: 'chat-call:e2e-call',
    sid: 'RM_e2e_123',
    numParticipants: 0,
    maxParticipants: 2,
    creationTime: BigInt(1700000000),
  });

  const mockDeleteRoom = vi.fn().mockResolvedValue(undefined);
  const mockRemoveParticipant = vi.fn().mockResolvedValue(undefined);

  const RoomServiceClient = vi.fn().mockImplementation(function () {
    return {
      createRoom: mockCreateRoom,
      deleteRoom: mockDeleteRoom,
      removeParticipant: mockRemoveParticipant,
    };
  });

  const mockToJwt = vi.fn().mockResolvedValue('eyJhbGciOiJIUzI1NiJ9.e2e-token.sig');
  const mockAddGrant = vi.fn();

  const AccessToken = vi.fn().mockImplementation(function () {
    return {
      addGrant: mockAddGrant,
      toJwt: mockToJwt,
    };
  });

  return {
    RoomServiceClient,
    AccessToken,
  };
});

describe('Sprint 4 End-to-End Voice Bot & Call Alert Flow (Task VC-04)', () => {
  let app: FastifyInstance;
  let callService: CallService;
  let voiceBot: VoiceBotAgentService;
  let dialogue: MeetingReminderDialogueService;
  let ringGenerator: CallRingGeneratorService;
  let worker: ProactiveCallWorker;
  let dispatchedEvents: Array<{ event: string; payload: Record<string, unknown> }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dispatchedEvents = [];

    callService = new CallService({
      apiKey: 'devkey',
      apiSecret: 'devsecret',
      wsUrl: 'ws://localhost:7880',
    });

    voiceBot = new VoiceBotAgentService({
      apiKey: 'devkey',
      apiSecret: 'devsecret',
      wsUrl: 'ws://localhost:7880',
    });

    dialogue = new MeetingReminderDialogueService();

    const broadcaster = {
      publish: (event: string, payload: Record<string, unknown>) => {
        dispatchedEvents.push({ event, payload });
      },
    };

    ringGenerator = new CallRingGeneratorService({
      callService,
      voiceBot,
      dialogueService: dialogue,
      broadcaster,
    });

    worker = new ProactiveCallWorker({
      ringGenerator,
    });
    worker.start();

    app = Fastify({ logger: false });
    await app.register(voiceBotRoutes, {
      prefix: '/voice-bot',
      ringGenerator,
      voiceBot,
      dialogue,
    });
    await app.ready();
  });

  afterEach(async () => {
    await worker.stop();
    await app.close();
  });

  it('completes the entire lifecycle: Calendar Schedule -> Proactive Alert -> Voice Bot Ring -> User Pickup -> Conversational Voice Dialogue -> Action Execution', async () => {
    // 1. Proactive BullMQ job emitted from calendar / proactive scheduler
    const meetingJob: ProactiveAgentJob = {
      jobType: 'meeting_call_alert',
      userId: 'user-rajesh',
      targetApp: 'quantchat',
      scheduledFor: new Date(Date.now() + 5 * 60000).toISOString(),
      priority: 'urgent',
      payload: {
        meetingId: 'mtg-roadmap-review',
        title: 'Q4 Product Strategy',
        organizer: 'Vikram',
        minutesUntilStart: 5,
        userName: 'Rajesh',
        locale: 'hinglish',
        joinUrl: 'https://quantmail.in/meetings/join/mtg-roadmap-review',
      },
    };

    // 2. ProactiveCallWorker processes the job
    const jobHandled = await worker.processJob(meetingJob);
    expect(jobHandled).toBe(true);

    // 3. User receives incoming call ring on connected client
    expect(dispatchedEvents).toHaveLength(1);
    const ringEvent = dispatchedEvents[0];
    expect(ringEvent.event).toBe('user:user-rajesh:call_ring');
    expect(ringEvent.payload['caller']).toBe('Quanty AI Assistant');
    expect(ringEvent.payload['meetingTitle']).toBe('Q4 Product Strategy');
    const callId = ringEvent.payload['callId'] as string;
    expect(callId).toMatch(/^call_/);

    // 4. User inspects incoming call status
    const statusRes = await app.inject({
      method: 'GET',
      url: `/voice-bot/calls/${callId}`,
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().data.state).toBe('ringing');

    // 5. User picks up / answers the call
    const answerRes = await app.inject({
      method: 'POST',
      url: `/voice-bot/calls/${callId}/answer`,
      payload: {},
    });
    expect(answerRes.statusCode).toBe(200);
    const answerData = answerRes.json().data;

    expect(answerData.state).toBe('in-progress');
    // Multilingual opening greeting delivered
    expect(answerData.greetingText).toContain('Namaste Rajesh!');
    expect(answerData.greetingText).toContain('Q4 Product Strategy');
    expect(answerData.greetingText).toContain('Vikram');
    expect(answerData.greetingAudioBase64).toBeTruthy();
    expect(answerData.greetingAudioDurationMs).toBeGreaterThan(0);

    // 6. User speaks conversational intent: "Tell Vikram I am 15 minutes late"
    const turnRes = await app.inject({
      method: 'POST',
      url: `/voice-bot/calls/${callId}/turn`,
      payload: {
        userUtterance: 'Please tell Vikram I will be 15 minutes late for the sync',
      },
    });
    expect(turnRes.statusCode).toBe(200);
    const turnData = turnRes.json().data;

    // 7. Dialogue engine classifies intent, sends late notice action, generates speech
    expect(turnData.intent).toBe('RUNNING_LATE');
    expect(turnData.actionRequired).toBe('SEND_LATE_NOTICE');
    expect(turnData.actionPayload.lateMinutes).toBe(15);
    expect(turnData.actionPayload.organizer).toBe('Vikram');
    expect(turnData.actionPayload.message).toContain('15 minutes late');
    expect(turnData.speechText).toContain('Maine Vikram ko note bhej diya hai');
    expect(turnData.audioBase64).toBeTruthy();
    expect(turnData.shouldEndCall).toBe(true);

    // 8. Verify call reached completion and transcript is preserved
    const finalStatus = await app.inject({
      method: 'GET',
      url: `/voice-bot/calls/${callId}`,
    });
    expect(finalStatus.statusCode).toBe(200);
    const finalData = finalStatus.json().data;
    expect(finalData.state).toBe('completed');
    expect(finalData.transcript).toHaveLength(3); // Bot greeting + user response + bot confirmation
    expect(finalData.transcript[0].speaker).toBe('bot');
    expect(finalData.transcript[1].speaker).toBe('user');
    expect(finalData.transcript[2].speaker).toBe('bot');
  });
});
