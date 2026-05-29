import { describe, it, expect, beforeEach } from 'vitest';
import { AgenticSession } from '../agentic-session.js';
import { allTools } from '@quant/quant-tools';

describe('Phase 72 - Phone-free agentic living', () => {
  let session: AgenticSession;

  beforeEach(() => {
    session = new AgenticSession(allTools);
  });

  it('voice commands route to correct tools and execute across 5+ apps', async () => {
    session.startSession({ voiceOnly: true });

    session.registerHandler('quantdrive.search', async () => ({
      files: ['doc.pdf'],
      success: true,
    }));
    session.registerHandler('quantmail.send', async () => ({
      messageId: 'msg-1',
      sent: true,
    }));
    session.registerHandler('quantcalendar.create-event', async () => ({
      eventId: 'evt-1',
      created: true,
    }));
    session.registerHandler('quantchat.send', async () => ({
      chatId: 'chat-1',
      delivered: true,
    }));
    session.registerHandler('quantmeet.join', async () => ({
      meetingId: 'meet-1',
      joined: true,
    }));

    const r1 = await session.executeVoiceCommand('search files in drive');
    expect(r1.success).toBe(true);

    const r2 = await session.executeVoiceCommand('send email to test@example.com');
    expect(r2.success).toBe(true);

    const r3 = await session.executeVoiceCommand('create event on calendar schedule');
    expect(r3.success).toBe(true);

    const r4 = await session.executeVoiceCommand('send chat message to team');
    expect(r4.success).toBe(true);

    const r5 = await session.executeVoiceCommand('join meeting');
    expect(r5.success).toBe(true);

    const summary = session.getSessionSummary();
    expect(summary.appsUsed.length).toBeGreaterThanOrEqual(5);
    expect(summary.commandsExecuted).toBeGreaterThanOrEqual(5);
  });

  it('phone-free mode full session with no screen touch', async () => {
    session.startSession({ voiceOnly: true });
    expect(session.isActive()).toBe(true);

    session.registerHandler('quantdrive.search', async () => ({ found: true }));
    session.registerHandler('quantmail.send', async () => ({ sent: true }));
    session.registerHandler('quantchat.send', async () => ({ delivered: true }));

    const r1 = await session.executeVoiceCommand('search files in drive');
    expect(r1.success).toBe(true);

    const r2 = await session.executeVoiceCommand('send email to user@test.com');
    expect(r2.success).toBe(true);

    const r3 = await session.executeVoiceCommand('send chat message');
    expect(r3.success).toBe(true);

    expect(session.isActive()).toBe(true);

    const summary = session.getSessionSummary();
    expect(summary.duration).toBeGreaterThan(0);
    expect(summary.commandsExecuted).toBe(3);

    session.endSession();
    expect(session.isActive()).toBe(false);
  });

  it('voice-only session spanning build, automation, mail, meeting, and device', async () => {
    session.startSession({ voiceOnly: true });

    session.registerHandler('quant-studio.deploy', async () => ({
      deploymentId: 'd-1',
      url: 'https://app.example.com',
      status: 'deployed',
    }));
    session.registerHandler('quantsync.sync-files', async () => ({
      uploaded: 5,
      downloaded: 2,
      conflicts: 0,
    }));
    session.registerHandler('quantmail.send', async () => ({
      messageId: 'msg-2',
      sent: true,
    }));
    session.registerHandler('quantmeet.join', async () => ({
      meetingId: 'meet-2',
      joined: true,
    }));
    session.registerHandler('device-control.control', async () => ({
      success: true,
      currentState: 'max',
    }));

    const r1 = await session.executeVoiceCommand('deploy app studio infrastructure');
    expect(r1.success).toBe(true);

    const r2 = await session.executeVoiceCommand('sync files storage');
    expect(r2.success).toBe(true);

    const r3 = await session.executeVoiceCommand('send email to team@test.com');
    expect(r3.success).toBe(true);

    const r4 = await session.executeVoiceCommand('join meeting');
    expect(r4.success).toBe(true);

    const r5 = await session.executeVoiceCommand('control device');
    expect(r5.success).toBe(true);

    expect([r1, r2, r3, r4, r5].every((r) => r.success)).toBe(true);

    const summary = session.getSessionSummary();
    const uniqueApps = new Set(summary.appsUsed);
    expect(uniqueApps.size).toBeGreaterThanOrEqual(5);
  });
});
