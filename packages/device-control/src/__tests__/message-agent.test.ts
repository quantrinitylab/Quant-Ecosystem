import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageAgent } from '../agents/message-agent.js';
import { PermissionManager } from '../permissions/permission-manager.js';
import type { SMSCapability } from '../capabilities/sms.js';

function createMockSMS(): SMSCapability {
  return {
    capability: 'sms',
    isAvailable: async () => true,
    initialize: async () => {},
    dispose: () => {},
    sendSMS: vi.fn().mockResolvedValue('SM_sent_1'),
    readSMS: vi
      .fn()
      .mockResolvedValue({ id: 'SM1', from: '+1111', body: 'read msg', timestamp: 1 }),
    onIncomingSMS: vi.fn().mockReturnValue(() => {}),
  };
}

describe('MessageAgent', () => {
  let agent: MessageAgent;
  let permissions: PermissionManager;
  let sms: ReturnType<typeof createMockSMS>;

  beforeEach(() => {
    permissions = new PermissionManager();
    permissions.setState('sms', 'granted');
    sms = createMockSMS();
    agent = new MessageAgent({
      smsProvider: sms,
      permissionManager: permissions,
      contactsResolver: async (name) => (name === 'Alice' ? '+15551111111' : null),
    });
  });

  it('blocks when permission denied', async () => {
    permissions.setState('sms', 'denied');
    const result = await agent.handleIntent({ action: 'send', target: '+1', body: 'hi' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('denied');
  });

  it('sends SMS to target number', async () => {
    const result = await agent.handleIntent({
      action: 'send',
      target: '+15559999999',
      body: 'Hello',
    });
    expect(result.success).toBe(true);
    expect(result.messageSid).toBe('SM_sent_1');
    expect(sms.sendSMS).toHaveBeenCalledWith('+15559999999', 'Hello');
  });

  it('resolves contact name to number', async () => {
    const result = await agent.handleIntent({ action: 'send', contactName: 'Alice', body: 'Hey' });
    expect(result.success).toBe(true);
    expect(sms.sendSMS).toHaveBeenCalledWith('+15551111111', 'Hey');
  });

  it('returns error when contact not found', async () => {
    const result = await agent.handleIntent({
      action: 'send',
      contactName: 'Unknown',
      body: 'Hey',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No target');
  });

  it('returns error when no body for send', async () => {
    const result = await agent.handleIntent({ action: 'send', target: '+1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No message body');
  });

  it('reads message by ID', async () => {
    const result = await agent.handleIntent({ action: 'read', target: 'SM1' });
    expect(result.success).toBe(true);
    expect(result.messages![0]!.body).toBe('read msg');
  });

  it('replies to a target number', async () => {
    const result = await agent.handleIntent({
      action: 'reply',
      target: '+15551111111',
      body: 'Reply',
    });
    expect(result.success).toBe(true);
    expect(sms.sendSMS).toHaveBeenCalledWith('+15551111111', 'Reply');
  });

  it('returns error for missing target on reply', async () => {
    const result = await agent.handleIntent({ action: 'reply', body: 'Reply' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No target');
  });
});
