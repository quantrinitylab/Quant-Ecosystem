import { describe, it, expect } from 'vitest';
import {
  MeetingReminderDialogueService,
  type MeetingReminderContext,
} from '../services/meeting-reminder-dialogue.service';

describe('MeetingReminderDialogueService (Task VC-03)', () => {
  const service = new MeetingReminderDialogueService();

  const baseContext: MeetingReminderContext = {
    meetingId: 'mtg-sync-101',
    title: 'Q3 Architecture Deep Dive',
    organizer: 'Raj',
    startTime: new Date(Date.now() + 5 * 60000).toISOString(),
    minutesUntilStart: 5,
    userName: 'Astra',
    locale: 'hinglish',
    joinUrl: '/meetings/join/mtg-sync-101',
  };

  describe('generateOpeningGreeting', () => {
    it('generates Hinglish greeting with personalized name, organizer and title', () => {
      const greeting = service.generateOpeningGreeting(baseContext);

      expect(greeting).toContain('Namaste Astra!');
      expect(greeting).toContain('5 minute');
      expect(greeting).toContain('Q3 Architecture Deep Dive');
      expect(greeting).toContain('Raj');
      expect(greeting).toContain('meeting room mein connect karu');
    });

    it('generates Hindi greeting when locale is hi', () => {
      const greeting = service.generateOpeningGreeting({
        ...baseContext,
        locale: 'hi',
      });

      expect(greeting).toContain('नमस्ते Astra जी!');
      expect(greeting).toContain('Q3 Architecture Deep Dive');
      expect(greeting).toContain('Raj');
    });

    it('generates English greeting when locale is en', () => {
      const greeting = service.generateOpeningGreeting({
        ...baseContext,
        locale: 'en',
      });

      expect(greeting).toContain('Namaste Astra!');
      expect(greeting).toContain('meeting in 5 minutes');
      expect(greeting).toContain('Q3 Architecture Deep Dive');
      expect(greeting).toContain('Raj');
    });
  });

  describe('classifyIntent', () => {
    it('classifies join utterances', () => {
      expect(service.classifyIntent('Please join the meeting')).toBe('JOIN_NOW');
      expect(service.classifyIntent('Yes connect me now')).toBe('JOIN_NOW');
      expect(service.classifyIntent('Haan chalo room open karo')).toBe('JOIN_NOW');
      expect(service.classifyIntent('Sure, start it')).toBe('JOIN_NOW');
    });

    it('classifies running late utterances', () => {
      expect(service.classifyIntent('I am running 5 minutes late')).toBe('RUNNING_LATE');
      expect(service.classifyIntent('Please inform them I have a 10 min delay')).toBe(
        'RUNNING_LATE',
      );
      expect(service.classifyIntent('Thoda late hunga, tell them')).toBe('RUNNING_LATE');
    });

    it('classifies snooze utterances', () => {
      expect(service.classifyIntent('Please snooze')).toBe('SNOOZE');
      expect(service.classifyIntent('Remind me in 2 minutes')).toBe('SNOOZE');
      expect(service.classifyIntent('Baad me call karo')).toBe('SNOOZE');
    });

    it('classifies decline utterances', () => {
      expect(service.classifyIntent('Decline please')).toBe('DECLINE');
      expect(service.classifyIntent("I can't make it, too busy")).toBe('DECLINE');
      expect(service.classifyIntent('Nahi cancel kar do')).toBe('DECLINE');
    });

    it('classifies unclear utterances as UNKNOWN', () => {
      expect(service.classifyIntent('What is the weather today?')).toBe('UNKNOWN');
      expect(service.classifyIntent('Random sound 123')).toBe('UNKNOWN');
    });
  });

  describe('handleUserResponse', () => {
    it('handles JOIN_NOW: connects meeting and marks resolved', () => {
      const result = service.handleUserResponse('Yes please connect me', baseContext);

      expect(result.intent).toBe('JOIN_NOW');
      expect(result.actionRequired).toBe('CONNECT_MEETING');
      expect(result.actionPayload?.['meetingId']).toBe('mtg-sync-101');
      expect(result.actionPayload?.['joinUrl']).toBe('/meetings/join/mtg-sync-101');
      expect(result.shouldEndCall).toBe(true);
      expect(result.state).toBe('RESOLVED');
    });

    it('handles RUNNING_LATE: extracts custom minutes and drafts notification', () => {
      const result = service.handleUserResponse('Tell Raj I will be 15 minutes late', baseContext);

      expect(result.intent).toBe('RUNNING_LATE');
      expect(result.actionRequired).toBe('SEND_LATE_NOTICE');
      expect(result.actionPayload?.['lateMinutes']).toBe(15);
      expect(result.actionPayload?.['organizer']).toBe('Raj');
      expect(result.actionPayload?.['message']).toContain('15 minutes late');
      expect(result.shouldEndCall).toBe(true);
      expect(result.state).toBe('RESOLVED');
    });

    it('handles SNOOZE: sets snooze payload and ends call', () => {
      const result = service.handleUserResponse('Snooze this reminder', baseContext);

      expect(result.intent).toBe('SNOOZE');
      expect(result.actionRequired).toBe('SNOOZE_ALERT');
      expect(result.actionPayload?.['snoozeSeconds']).toBe(120);
      expect(result.shouldEndCall).toBe(true);
      expect(result.state).toBe('RESOLVED');
    });

    it('handles DECLINE: marks attendance cancelled and ends call', () => {
      const result = service.handleUserResponse("I can't attend, decline it", baseContext);

      expect(result.intent).toBe('DECLINE');
      expect(result.actionRequired).toBe('CANCEL_ATTENDANCE');
      expect(result.shouldEndCall).toBe(true);
      expect(result.state).toBe('RESOLVED');
    });

    it('handles UNKNOWN: asks for clarification without ending call', () => {
      const result = service.handleUserResponse('xyz abc', baseContext);

      expect(result.intent).toBe('UNKNOWN');
      expect(result.actionRequired).toBe('NONE');
      expect(result.shouldEndCall).toBe(false);
      expect(result.state).toBe('AWAITING_ACTION');
      expect(result.speechText).toContain('samajh nahi paaya');
    });
  });
});
