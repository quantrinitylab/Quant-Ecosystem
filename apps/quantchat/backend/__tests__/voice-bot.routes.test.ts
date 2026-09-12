import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
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
    expect(body.data.userToken).toBeUndefined();
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

  it('validates HMAC SHA-256 signatures on POST /voice-bot/alert', async () => {
    const payload = {
      userId: 'usr-secure',
      meetingId: 'mtg-hmac',
      title: 'Secret Sync',
      organizer: 'Security',
      startTime: new Date().toISOString(),
      minutesUntilStart: 5,
    };
    const bodyStr = JSON.stringify(payload);

    // Invalid signature should fail with 401
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      headers: {
        'x-quant-signature':
          'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      },
      payload,
    });
    expect(invalidRes.statusCode).toBe(401);

    // Missing signature when enforced should fail with 401
    const originalEnforce = process.env['ENFORCE_VOICE_BOT_HMAC'];
    process.env['ENFORCE_VOICE_BOT_HMAC'] = 'true';
    try {
      const missingSigRes = await app.inject({
        method: 'POST',
        url: '/voice-bot/alert',
        payload,
      });
      expect(missingSigRes.statusCode).toBe(401);
      expect(missingSigRes.json().message).toContain('Missing x-quant-signature');
    } finally {
      if (originalEnforce !== undefined) {
        process.env['ENFORCE_VOICE_BOT_HMAC'] = originalEnforce;
      } else {
        delete process.env['ENFORCE_VOICE_BOT_HMAC'];
      }
    }

    // Valid signature should succeed with 201
    const secret =
      process.env['VOICE_BOT_SECRET'] || process.env['LIVEKIT_API_SECRET'] || 'devsecret';
    const validSig = 'sha256=' + createHmac('sha256', secret).update(bodyStr).digest('hex');

    const validRes = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      headers: {
        'x-quant-signature': validSig,
      },
      payload,
    });
    expect(validRes.statusCode).toBe(201);
  });

  it('rejects unauthorized users from answering, declining, or sending turns for another user call', async () => {
    const initRes = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      payload: {
        userId: 'usr-victim',
        meetingId: 'mtg-auth-test',
        title: 'Confidential Call',
        organizer: 'Boss',
        startTime: new Date().toISOString(),
        minutesUntilStart: 5,
      },
    });
    const { callId } = initRes.json().data;

    // Fastify request simulation with mismatched auth.userId
    const unauthorizedApp = Fastify({ logger: false });
    unauthorizedApp.addHook('preHandler', async (req) => {
      (req as unknown as { auth: { userId: string } }).auth = { userId: 'usr-attacker' };
    });
    await unauthorizedApp.register(voiceBotRoutes, { prefix: '/voice-bot' });
    await unauthorizedApp.ready();

    try {
      // First initiate on unauthorizedApp instance
      const attackerInit = await unauthorizedApp.inject({
        method: 'POST',
        url: '/voice-bot/alert',
        payload: {
          userId: 'usr-victim',
          meetingId: 'mtg-auth-test-2',
          title: 'Victim Meeting',
          organizer: 'Boss',
          startTime: new Date().toISOString(),
          minutesUntilStart: 5,
        },
      });
      const victimCallId = attackerInit.json().data.callId;

      // Attacker tries to answer victim's call -> 403
      const answerRes = await unauthorizedApp.inject({
        method: 'POST',
        url: `/voice-bot/calls/${victimCallId}/answer`,
        payload: {},
      });
      expect(answerRes.statusCode).toBe(403);

      // Attacker tries to decline victim's call -> 403
      const declineRes = await unauthorizedApp.inject({
        method: 'POST',
        url: `/voice-bot/calls/${victimCallId}/decline`,
        payload: {},
      });
      expect(declineRes.statusCode).toBe(403);

      // Attacker tries to send turn to victim's call -> 403
      const turnRes = await unauthorizedApp.inject({
        method: 'POST',
        url: `/voice-bot/calls/${victimCallId}/turn`,
        payload: { userUtterance: 'hello' },
      });
      expect(turnRes.statusCode).toBe(403);

      // Attacker tries to view victim's call -> 403
      const viewRes = await unauthorizedApp.inject({
        method: 'GET',
        url: `/voice-bot/calls/${victimCallId}`,
      });
      expect(viewRes.statusCode).toBe(403);
    } finally {
      await unauthorizedApp.close();
    }
  });
});
