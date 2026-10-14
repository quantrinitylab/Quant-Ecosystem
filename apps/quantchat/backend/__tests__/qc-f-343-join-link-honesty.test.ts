// QC-F-343 — the meeting-reminder dialogue fabricated a join link on
// the branch the flagship Calendar -> Quanty -> Chat journey always
// takes: when the producer supplied no joinUrl (the in-repo calendar
// producer never sends one), JOIN_NOW returned
// `joinUrl: '/meetings/join/<meetingId>'` — a route that is not
// registered anywhere in QuantChat (route-access.ts has no `meetings`
// entry; live probe: /meetings/join/test123 -> 404) — while the speech
// unconditionally claimed "join link taiyaar hai / is ready".
//
// Honest contract pinned here:
//   1. No supplied joinUrl -> actionPayload.joinUrl is `null`, never a
//      fabricated route, in both speech locales.
//   2. No supplied joinUrl -> speech makes NO link-ready claim and
//      discloses that no join link is available, telling the user to
//      open the meeting from their calendar.
//   3. No `/meetings/join` string is emitted anywhere when the context
//      has no joinUrl.
//   4. A producer-supplied joinUrl passes through verbatim and the
//      ready-link speech is retained (QC-F-070 semantics preserved).
//   5. The request contract is unchanged when no link exists:
//      actionRequired CONNECT_MEETING, actionExecuted false,
//      state RESOLVED, meetingId still in the payload.
//
// Negative control: on the pre-fix dialogue service tests 1-3 FAIL
// (original returns the fabricated `/meetings/join/<id>` string and
// the ready-link speech in both locales); tests 4-5 pass on both
// (pass-through guard + contract pin). Expected NC signature:
// 3 FAIL / 2 PASS on original; 5/5 PASS on fixed.
import { describe, expect, it } from 'vitest';
import {
  MeetingReminderDialogueService,
  type MeetingReminderContext,
} from '../services/meeting-reminder-dialogue.service';

const service = new MeetingReminderDialogueService();

// Context WITHOUT a joinUrl — this is what the calendar producer's
// meeting_call_alert jobs always produce (payload carries meetingId,
// title, organizer, startTime, minutesUntilStart, location; no joinUrl).
const contextWithoutJoinUrl: MeetingReminderContext = {
  meetingId: 'mtg-qc-f-343',
  title: 'Roadmap Review',
  organizer: 'Vikram',
  startTime: new Date(Date.now() + 5 * 60000).toISOString(),
  minutesUntilStart: 5,
  userName: 'Astra',
  locale: 'hinglish',
};

describe('QC-F-343 JOIN_NOW join-link honesty', () => {
  it('JOIN_NOW without a supplied joinUrl returns joinUrl null, never a fabricated route (hinglish)', () => {
    const result = service.handleUserResponse('Yes please connect me', contextWithoutJoinUrl);

    expect(result.intent).toBe('JOIN_NOW');
    expect(result.actionPayload?.['joinUrl']).toBeNull();
    expect(result.speechText).not.toContain('join link taiyaar hai');
    expect(result.speechText).toContain('join link mere paas nahi hai');
    expect(result.speechText).toContain('calendar se meeting kholkar join kar dein');
  });

  it('JOIN_NOW without a supplied joinUrl returns joinUrl null and honest speech (en)', () => {
    const result = service.handleUserResponse('Yes please connect me', {
      ...contextWithoutJoinUrl,
      locale: 'en',
    });

    expect(result.intent).toBe('JOIN_NOW');
    expect(result.actionPayload?.['joinUrl']).toBeNull();
    expect(result.speechText).not.toContain('is ready');
    expect(result.speechText).toContain("don't have a join link for this meeting");
    expect(result.speechText).toContain('open it from your calendar');
  });

  it('JOIN_NOW never emits a /meetings/join URL when the context has none', () => {
    for (const locale of ['hinglish', 'en'] as const) {
      const result = service.handleUserResponse('Yes please connect me', {
        ...contextWithoutJoinUrl,
        locale,
      });

      expect(JSON.stringify(result.actionPayload), locale).not.toContain('meetings/join');
      expect(result.speechText, locale).not.toContain('meetings/join');
    }
  });

  it('JOIN_NOW with a producer-supplied joinUrl passes it through verbatim', () => {
    const supplied = 'https://example.test/rooms/room-abc-123';
    const hinglish = service.handleUserResponse('Yes please connect me', {
      ...contextWithoutJoinUrl,
      joinUrl: supplied,
    });
    expect(hinglish.actionPayload?.['joinUrl']).toBe(supplied);
    expect(hinglish.speechText).toContain('join link taiyaar hai');

    const en = service.handleUserResponse('Yes please connect me', {
      ...contextWithoutJoinUrl,
      locale: 'en',
      joinUrl: supplied,
    });
    expect(en.actionPayload?.['joinUrl']).toBe(supplied);
    expect(en.speechText).toContain('is ready');
  });

  it('JOIN_NOW request contract is preserved when no link exists', () => {
    const result = service.handleUserResponse('Yes please connect me', contextWithoutJoinUrl);

    expect(result.actionRequired).toBe('CONNECT_MEETING');
    expect(result.actionExecuted).toBe(false);
    expect(result.state).toBe('RESOLVED');
    expect(result.shouldEndCall).toBe(true);
    expect(result.actionPayload?.['meetingId']).toBe('mtg-qc-f-343');
  });
});
