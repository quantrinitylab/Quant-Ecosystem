import { describe, it, expect } from 'vitest';
import { VoiceToolBridge } from '../integrations/voice-tool-bridge.js';

describe('VoiceToolBridge', () => {
  const createBridge = (maxTier = 3) =>
    new VoiceToolBridge({
      maxTier,
      enabledApps: [
        'quantmail',
        'quantdrive',
        'quantcalendar',
        'quantchat',
        'quantneon',
        'quantphotos',
      ],
    });

  it('routes voice command to mail tool (send email)', async () => {
    const bridge = createBridge();
    const result = await bridge.handleVoiceCommand(
      'send an email to John about the meeting',
      'user1',
    );
    expect(result).not.toBeNull();
    expect(result!.toolId).toBe('quantmail.send');
    expect(result!.appId).toBe('quantmail');
    expect(result!.success).toBe(true);
    expect(result!.spokenResponse).toContain('John');
  });

  it('routes voice command to drive tool (search files)', async () => {
    const bridge = createBridge();
    const result = await bridge.handleVoiceCommand('search for budget report in drive', 'user1');
    expect(result).not.toBeNull();
    expect(result!.toolId).toBe('quantdrive.search');
    expect(result!.appId).toBe('quantdrive');
    expect(result!.success).toBe(true);
  });

  it('routes voice command to calendar tool (create event)', async () => {
    const bridge = createBridge();
    const result = await bridge.handleVoiceCommand('create event called standup at 9am', 'user1');
    expect(result).not.toBeNull();
    expect(result!.toolId).toBe('quantcalendar.create');
    expect(result!.appId).toBe('quantcalendar');
    expect(result!.success).toBe(true);
  });

  it('permission check: tier 2+ requires confirmation', () => {
    const bridge = createBridge();
    expect(bridge.requiresConfirmation('quantmail.send')).toBe(true);
    expect(bridge.requiresConfirmation('quantdrive.search')).toBe(false);
  });

  it('handles unrecognized command by returning null', async () => {
    const bridge = createBridge();
    const result = await bridge.handleVoiceCommand('what time is it on Mars', 'user1');
    expect(result).toBeNull();
  });

  it('gets available tools respecting tier and enabled apps', () => {
    const bridge = new VoiceToolBridge({
      maxTier: 1,
      enabledApps: ['quantdrive', 'quantchat'],
    });
    const tools = bridge.getAvailableTools();
    expect(tools.length).toBeGreaterThanOrEqual(2);
    expect(tools.every((t) => t.appId === 'quantdrive' || t.appId === 'quantchat')).toBe(true);
  });

  it('executes from voice with params', async () => {
    const bridge = createBridge();
    const result = await bridge.executeFromVoice(
      'quantchat.send',
      { to: 'Alice', message: 'Hello!' },
      'user1',
    );
    expect(result.success).toBe(true);
    expect(result.toolId).toBe('quantchat.send');
    expect(result.appId).toBe('quantchat');
  });

  it('multi-app: routes to different apps based on keywords', async () => {
    const bridge = createBridge();
    const mailResult = await bridge.handleVoiceCommand('send email to Bob about lunch', 'user1');
    const chatResult = await bridge.handleVoiceCommand('send message to Alice saying hi', 'user1');
    expect(mailResult!.appId).toBe('quantmail');
    expect(chatResult!.appId).toBe('quantchat');
  });

  it('blocks when app is not enabled', async () => {
    const bridge = new VoiceToolBridge({
      maxTier: 3,
      enabledApps: ['quantdrive'],
    });
    const result = await bridge.handleVoiceCommand(
      'send an email to John about the meeting',
      'user1',
    );
    expect(result).toBeNull();
  });

  it('getSupportedApps returns only enabled apps', () => {
    const bridge = new VoiceToolBridge({
      maxTier: 3,
      enabledApps: ['quantmail', 'quantdrive'],
    });
    const apps = bridge.getSupportedApps();
    expect(apps).toContain('quantmail');
    expect(apps).toContain('quantdrive');
    expect(apps).not.toContain('quantneon');
  });
});
