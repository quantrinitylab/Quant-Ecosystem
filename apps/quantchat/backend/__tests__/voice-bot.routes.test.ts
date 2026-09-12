import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import voiceBotRoutes from '../routes/voice-bot';

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

  const mockToJwt = vi.fn().mockResolvedValue('header.jwt-token.signature');
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

describe('voice-bot Fastify routes (Task VC-01 & VC-02)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(voiceBotRoutes, { prefix: '/voice-bot' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /voice-bot/alert initiates an outbound call alert', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      payload: {
        userId: 'usr-100',
        meetingId: 'mtg-abc',
        title: 'Weekly Standup',
        organizer: 'Raj',
        startTime: new Date().toISOString(),
        minutesUntilStart: 5,
        userName: 'Astra',
        locale: 'hinglish',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.callId).toMatch(/^call_/);
    expect(body.data.state).toBe('ringing');
    expect(body.data.userId).toBe('usr-100');
    expect(body.data.userToken).toBeDefined();
  });

  it('POST /voice-bot/calls/:callId/answer answers call and returns audio greeting', async () => {
    // Initiate first
    const initRes = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      payload: {
        userId: 'usr-200',
        meetingId: 'mtg-def',
        title: 'Design Review',
        organizer: 'Vikram',
        startTime: new Date().toISOString(),
        minutesUntilStart: 5,
      },
    });
    const { callId } = initRes.json().data;

    // Answer call
    const answerRes = await app.inject({
      method: 'POST',
      url: `/voice-bot/calls/${callId}/answer`,
      payload: {},
    });

    expect(answerRes.statusCode).toBe(200);
    const answerBody = answerRes.json();
    expect(answerBody.success).toBe(true);
    expect(answerBody.data.callId).toBe(callId);
    expect(answerBody.data.state).toBe('in-progress');
    expect(answerBody.data.greetingText).toContain('Vikram');
    expect(answerBody.data.greetingAudioBase64).toBeDefined();
    expect(answerBody.data.voiceSessionId).toBeDefined();
  });

  it('POST /voice-bot/calls/:callId/turn handles conversational user speech', async () => {
    // Initiate & answer
    const initRes = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      payload: {
        userId: 'usr-300',
        meetingId: 'mtg-ghi',
        title: 'Quarterly Sync',
        organizer: 'Raj',
        startTime: new Date().toISOString(),
        minutesUntilStart: 5,
      },
    });
    const { callId } = initRes.json().data;

    await app.inject({
      method: 'POST',
      url: `/voice-bot/calls/${callId}/answer`,
      payload: {},
    });

    // Send turn: "Tell Raj I am 10 minutes late"
    const turnRes = await app.inject({
      method: 'POST',
      url: `/voice-bot/calls/${callId}/turn`,
      payload: {
        userUtterance: 'Please tell Raj I am 10 minutes late',
      },
    });

    expect(turnRes.statusCode).toBe(200);
    const turnBody = turnRes.json();
    expect(turnBody.success).toBe(true);
    expect(turnBody.data.intent).toBe('RUNNING_LATE');
    expect(turnBody.data.actionRequired).toBe('SEND_LATE_NOTICE');
    expect(turnBody.data.actionPayload.lateMinutes).toBe(10);
    expect(turnBody.data.shouldEndCall).toBe(true);
    expect(turnBody.data.audioBase64).toBeDefined();
  });

  it('GET /voice-bot/calls/:callId retrieves live call status and transcript', async () => {
    const initRes = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      payload: {
        userId: 'usr-400',
        meetingId: 'mtg-jkl',
        title: 'Architecture Review',
        organizer: 'Priya',
        startTime: new Date().toISOString(),
        minutesUntilStart: 5,
      },
    });
    const { callId } = initRes.json().data;

    const getRes = await app.inject({
      method: 'GET',
      url: `/voice-bot/calls/${callId}`,
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.success).toBe(true);
    expect(getBody.data.callId).toBe(callId);
    expect(getBody.data.state).toBe('ringing');
    expect(getBody.data.context.organizer).toBe('Priya');
  });

  it('POST /voice-bot/calls/:callId/decline declines the call', async () => {
    const initRes = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      payload: {
        userId: 'usr-500',
        meetingId: 'mtg-mno',
        title: 'Quick Check-in',
        organizer: 'Ananya',
        startTime: new Date().toISOString(),
        minutesUntilStart: 5,
      },
    });
    const { callId } = initRes.json().data;

    const declineRes = await app.inject({
      method: 'POST',
      url: `/voice-bot/calls/${callId}/decline`,
      payload: {},
    });

    expect(declineRes.statusCode).toBe(200);
    expect(declineRes.json().data.message).toBe('Call declined');
  });
});
