import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CallRingGeneratorService } from '../services/call-ring-generator.service';
import { CallService } from '../services/call.service';
import { VoiceBotAgentService } from '../services/voice-bot-agent.service';
import { MeetingReminderDialogueService } from '../services/meeting-reminder-dialogue.service';

vi.mock('livekit-server-sdk', () => {
  const mockCreateRoom = vi.fn().mockResolvedValue({
    name: 'chat-call:test-call',
    sid: 'RM_call123',
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

  const mockToJwt = vi.fn().mockResolvedValue('eyJhbGciOiJIUzI1NiJ9.user-token.sig');
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

describe('CallRingGeneratorService (Task VC-02)', () => {
  let callService: CallService;
  let voiceBot: VoiceBotAgentService;
  let dialogue: MeetingReminderDialogueService;
  let ringGenerator: CallRingGeneratorService;
  let broadcastEvents: Array<{ event: string; payload: Record<string, unknown> }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

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
    broadcastEvents = [];

    const broadcaster = {
      publish: (event: string, payload: Record<string, unknown>) => {
        broadcastEvents.push({ event, payload });
      },
    };

    ringGenerator = new CallRingGeneratorService({
      callService,
      voiceBot,
      dialogueService: dialogue,
      broadcaster,
      ringTimeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers meeting call alert and dispatches ring broadcast', async () => {
    const alert = await ringGenerator.triggerMeetingCallAlert({
      userId: 'user-789',
      meetingId: 'mtg-999',
      title: 'Executive Sync',
      organizer: 'Raj',
      startTime: new Date().toISOString(),
      minutesUntilStart: 5,
      userName: 'Astra',
    });

    expect(alert.callId).toMatch(/^call_/);
    expect(alert.state).toBe('ringing');
    expect(alert.userToken).toBeDefined();
    expect(alert.botToken).toBeDefined();
    expect(alert.userId).toBe('user-789');

    expect(broadcastEvents).toHaveLength(1);
    expect(broadcastEvents[0].event).toBe('user:user-789:call_ring');
    expect(broadcastEvents[0].payload['caller']).toBe('Quanty AI Assistant');
    expect(broadcastEvents[0].payload['meetingTitle']).toBe('Executive Sync');
  });

  it('handles call answer, speaks opening greeting, and sets in-progress state', async () => {
    const alert = await ringGenerator.triggerMeetingCallAlert({
      userId: 'user-789',
      meetingId: 'mtg-999',
      title: 'Sprint Planning',
      organizer: 'Sarah',
      startTime: new Date().toISOString(),
      minutesUntilStart: 5,
    });

    const answer = await ringGenerator.answerCall(alert.callId, 'user-789');

    expect(answer.call.state).toBe('in-progress');
    expect(answer.call.answeredAt).toBeDefined();
    expect(answer.call.voiceSessionId).toBeDefined();
    expect(answer.greetingText).toContain('Sarah');
    expect(answer.greetingAudio.format).toBe('wav');
  });

  it('handles call decline and cleans up active call', async () => {
    const alert = await ringGenerator.triggerMeetingCallAlert({
      userId: 'user-789',
      meetingId: 'mtg-999',
      title: 'Sprint Planning',
      organizer: 'Sarah',
      startTime: new Date().toISOString(),
      minutesUntilStart: 5,
    });

    await ringGenerator.declineCall(alert.callId, 'user-789');

    const call = ringGenerator.getCall(alert.callId);
    expect(call?.state).toBe('declined');
    expect(call?.endedAt).toBeDefined();
  });

  it('marks call as missed when ring timeout expires without answer', async () => {
    const alert = await ringGenerator.triggerMeetingCallAlert({
      userId: 'user-789',
      meetingId: 'mtg-999',
      title: 'Standup',
      organizer: 'Team',
      startTime: new Date().toISOString(),
      minutesUntilStart: 5,
    });

    expect(alert.state).toBe('ringing');

    // Advance past ringTimeoutMs (5000ms)
    vi.advanceTimersByTime(5500);

    const call = ringGenerator.getCall(alert.callId);
    expect(call?.state).toBe('missed');
    expect(call?.endedAt).toBeDefined();
  });

  it('processes dialogue turn and terminates call on completion', async () => {
    const alert = await ringGenerator.triggerMeetingCallAlert({
      userId: 'user-789',
      meetingId: 'mtg-999',
      title: 'Strategy Meeting',
      organizer: 'Raj',
      startTime: new Date().toISOString(),
      minutesUntilStart: 5,
    });

    await ringGenerator.answerCall(alert.callId, 'user-789');

    const result = await ringGenerator.processDialogueTurn(alert.callId, 'I will join now please');

    expect(result.dialogueResult.intent).toBe('JOIN_NOW');
    expect(result.dialogueResult.actionRequired).toBe('CONNECT_MEETING');
    expect(result.dialogueResult.shouldEndCall).toBe(true);

    const call = ringGenerator.getCall(alert.callId);
    expect(call?.state).toBe('completed');
    expect(call?.endedAt).toBeDefined();
  });
});
