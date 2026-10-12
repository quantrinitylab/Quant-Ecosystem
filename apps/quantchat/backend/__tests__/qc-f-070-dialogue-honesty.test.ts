// QC-F-070 — the meeting-reminder voice bot claimed actions were DONE
// ("Maine <organizer> ko note bhej diya hai", "calendar par decline mark
// kar diya", "2 minute baad dobara alert karunga") while no code anywhere
// executed them: the only consumer of `actionRequired` echoed it in the
// /turn HTTP response. There is still no executor (no organizer
// notification path, no calendar write, no snooze re-queue producer), so
// these tests pin the honest contract:
//
//   1. Speech NEVER claims an unexecuted action happened (any locale).
//   2. Speech discloses the real state (the bot cannot do it from this
//      call) for RUNNING_LATE / SNOOZE / DECLINE.
//   3. Every turn result carries `actionExecuted: false`, and the /turn
//      route surfaces it, so no consumer can mistake the echoed
//      `actionRequired` for proof of execution.
//   4. The action request itself (intent, actionRequired, payload, state)
//      is unchanged — a future executor receives exactly what it did
//      before; only the false claim is gone.
//
// Negative control: on the pre-fix dialogue service every speech assertion
// below fails (the old strings are exactly the forbidden patterns) and
// `actionExecuted` is undefined.
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MeetingReminderDialogueService,
  type MeetingReminderContext,
} from '../services/meeting-reminder-dialogue.service';
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
    return { addGrant: mockAddGrant, toJwt: mockToJwt };
  });
  return { RoomServiceClient, AccessToken };
});

// Completion claims for actions that were never executed. Any of these in
// bot speech is the QC-F-070 lie coming back.
const FALSE_COMPLETION_PATTERNS: RegExp[] = [
  /bhej diya/i,
  /i have notified/i,
  /has been notified/i,
  /mark kar diya/i,
  /i have updated your calendar/i,
  /dobara alert karunga/i,
  /i will ring you again/i,
  /redirect kar raha/i,
  /^connecting you to/i,
];

const service = new MeetingReminderDialogueService();

const baseContext: MeetingReminderContext = {
  meetingId: 'mtg-qc-f-070',
  title: 'Honesty Review',
  organizer: 'Vikram',
  startTime: new Date(Date.now() + 5 * 60000).toISOString(),
  minutesUntilStart: 5,
  userName: 'Astra',
  locale: 'hinglish',
  joinUrl: '/meetings/join/mtg-qc-f-070',
};

const ACTION_UTTERANCES: Array<{
  utterance: string;
  actionRequired: string;
}> = [
  { utterance: 'Please tell Vikram I will be 15 minutes late', actionRequired: 'SEND_LATE_NOTICE' },
  { utterance: 'Snooze this reminder', actionRequired: 'SNOOZE_ALERT' },
  { utterance: "I can't attend, decline it", actionRequired: 'CANCEL_ATTENDANCE' },
  { utterance: 'Yes please connect me', actionRequired: 'CONNECT_MEETING' },
];

describe('QC-F-070 dialogue honesty (service level)', () => {
  it.each(['hinglish', 'en'] as const)(
    'no action turn claims completion in %s speech, and actionExecuted is false',
    (locale) => {
      for (const { utterance, actionRequired } of ACTION_UTTERANCES) {
        const result = service.handleUserResponse(utterance, { ...baseContext, locale });
        expect(result.actionRequired).toBe(actionRequired);
        expect(result.actionExecuted).toBe(false);
        for (const pattern of FALSE_COMPLETION_PATTERNS) {
          expect(result.speechText, `${actionRequired}/${locale}`).not.toMatch(pattern);
        }
      }
    },
  );

  it('RUNNING_LATE speech discloses the notice was NOT sent (both locales)', () => {
    const hinglish = service.handleUserResponse('Tell Vikram I am 10 minutes late', baseContext);
    expect(hinglish.speechText).toContain('notice nahi bhej sakta');
    expect(hinglish.speechText).toContain('khud');
    // The drafted notice is still handed over as a request payload — only
    // the claim that it was delivered is gone.
    expect(hinglish.actionPayload?.['message']).toContain('10 minutes late');

    const en = service.handleUserResponse('Tell Vikram I am 10 minutes late', {
      ...baseContext,
      locale: 'en',
    });
    expect(en.speechText).toContain('cannot send a notice');
    expect(en.speechText).toContain('message them directly');
  });

  it('DECLINE speech discloses the calendar was NOT updated (both locales)', () => {
    const hinglish = service.handleUserResponse("I can't attend, decline it", baseContext);
    expect(hinglish.speechText).toContain('decline mark nahi kar sakta');
    expect(hinglish.speechText).toContain('khud decline kar dein');

    const en = service.handleUserResponse("I can't attend, decline it", {
      ...baseContext,
      locale: 'en',
    });
    expect(en.speechText).toContain('cannot update your calendar');
    expect(en.speechText).toContain('decline the meeting in your calendar');
  });

  it('SNOOZE speech discloses no follow-up alert will come (both locales)', () => {
    const hinglish = service.handleUserResponse('Snooze this reminder', baseContext);
    expect(hinglish.speechText).toContain('dobara alert ki suvidha');
    expect(hinglish.speechText).toContain('dobara call nahi karunga');
    expect(hinglish.actionPayload?.['snoozeSeconds']).toBe(120);

    const en = service.handleUserResponse('Snooze this reminder', {
      ...baseContext,
      locale: 'en',
    });
    expect(en.speechText).toContain('cannot schedule a follow-up alert');
    expect(en.speechText).toContain('will not ring you again');
  });

  it('JOIN_NOW speech points at the real join link instead of a fake redirect', () => {
    const hinglish = service.handleUserResponse('Yes please connect me', baseContext);
    expect(hinglish.speechText).toContain('join link taiyaar hai');
    expect(hinglish.actionPayload?.['joinUrl']).toBe('/meetings/join/mtg-qc-f-070');

    const en = service.handleUserResponse('Yes please connect me', {
      ...baseContext,
      locale: 'en',
    });
    expect(en.speechText).toContain('join link');
    expect(en.speechText).toContain('is ready');
  });

  it('UNKNOWN turn also carries actionExecuted false and asks for clarification', () => {
    const result = service.handleUserResponse('xyz abc', baseContext);
    expect(result.actionRequired).toBe('NONE');
    expect(result.actionExecuted).toBe(false);
    expect(result.shouldEndCall).toBe(false);
  });

  it('opening greeting names the actual organizer, not a hardcoded one', () => {
    const greeting = service.generateOpeningGreeting({
      ...baseContext,
      organizer: 'Priya',
    });
    expect(greeting).toContain('Priya');
    expect(greeting).not.toContain('Raj aur team');
  });
});

describe('QC-F-070 dialogue honesty (route level)', () => {
  let app: FastifyInstance;
  let savedLiveKitEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    savedLiveKitEnv = {};
    for (const key of ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_WS_URL']) {
      savedLiveKitEnv[key] = process.env[key];
    }
    process.env['LIVEKIT_API_KEY'] = 'test-livekit-key';
    process.env['LIVEKIT_API_SECRET'] = 'test-livekit-secret';
    process.env['LIVEKIT_WS_URL'] = 'ws://livekit.test:7880';
    app = Fastify({ logger: false });
    await app.register(voiceBotRoutes, { prefix: '/voice-bot' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    for (const key of ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_WS_URL']) {
      if (savedLiveKitEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedLiveKitEnv[key];
      }
    }
  });

  it('POST /turn surfaces actionExecuted:false and honest speech for RUNNING_LATE', async () => {
    const initRes = await app.inject({
      method: 'POST',
      url: '/voice-bot/alert',
      payload: {
        userId: 'usr-qc-f-070',
        meetingId: 'mtg-qc-f-070',
        title: 'Honesty Review',
        organizer: 'Vikram',
        startTime: new Date().toISOString(),
        minutesUntilStart: 5,
        locale: 'hinglish',
      },
    });
    expect(initRes.statusCode).toBe(201);
    const { callId } = initRes.json().data;

    await app.inject({
      method: 'POST',
      url: `/voice-bot/calls/${callId}/answer`,
      payload: {},
    });

    const turnRes = await app.inject({
      method: 'POST',
      url: `/voice-bot/calls/${callId}/turn`,
      payload: { userUtterance: 'Please tell Vikram I will be 15 minutes late' },
    });

    expect(turnRes.statusCode).toBe(200);
    const data = turnRes.json().data;
    expect(data.intent).toBe('RUNNING_LATE');
    expect(data.actionRequired).toBe('SEND_LATE_NOTICE');
    expect(data.actionExecuted).toBe(false);
    expect(data.speechText).toContain('notice nahi bhej sakta');
    for (const pattern of FALSE_COMPLETION_PATTERNS) {
      expect(data.speechText).not.toMatch(pattern);
    }

    // The persisted lastDialogueResult carries the same honest flag, so a
    // later status read cannot present the action as done either.
    const statusRes = await app.inject({
      method: 'GET',
      url: `/voice-bot/calls/${callId}`,
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().data.lastDialogueResult.actionExecuted).toBe(false);
    expect(statusRes.json().data.lastDialogueResult.actionRequired).toBe('SEND_LATE_NOTICE');
  });
});
