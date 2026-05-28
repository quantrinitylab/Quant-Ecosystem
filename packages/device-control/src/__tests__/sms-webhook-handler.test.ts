import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SMSWebhookHandler } from '../providers/sms-webhook-handler.js';
import { MessageStore } from '../providers/message-store.js';

vi.mock('twilio', () => ({
  default: { validateRequest: vi.fn() },
}));

import twilio from 'twilio';
const mockValidate = twilio.validateRequest as ReturnType<typeof vi.fn>;

describe('SMSWebhookHandler', () => {
  let handler: SMSWebhookHandler;
  let store: MessageStore;

  beforeEach(() => {
    store = new MessageStore();
    handler = new SMSWebhookHandler(
      { authToken: 'token', webhookUrl: 'http://test.com/sms' },
      store,
    );
    mockValidate.mockReset();
  });

  it('handleInbound stores message and fires callbacks on valid signature', () => {
    mockValidate.mockReturnValue(true);
    const cb = vi.fn();
    handler.onIncoming(cb);

    const payload = {
      MessageSid: 'SM1',
      From: '+1111',
      To: '+2222',
      Body: 'Hi',
      AccountSid: 'AC1',
    };
    const result = handler.handleInbound(payload, 'sig', 'http://test.com/sms');

    expect(result).toBe(true);
    expect(store.get('SM1')).toBeDefined();
    expect(store.get('SM1')?.direction).toBe('inbound');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ id: 'SM1', body: 'Hi' }));
  });

  it('handleInbound rejects invalid signature', () => {
    mockValidate.mockReturnValue(false);
    const payload = { MessageSid: 'SM2', From: '+1', To: '+2', Body: 'X', AccountSid: 'AC1' };
    const result = handler.handleInbound(payload, 'bad', 'http://test.com/sms');
    expect(result).toBe(false);
    expect(store.get('SM2')).toBeUndefined();
  });

  it('handleStatusUpdate updates message status', () => {
    mockValidate.mockReturnValue(true);
    store.store({
      id: 'SM3',
      from: '+1',
      to: '+2',
      body: 'msg',
      timestamp: 1,
      status: 'sent',
      direction: 'outbound',
    });
    const payload = {
      MessageSid: 'SM3',
      From: '+1',
      To: '+2',
      Body: '',
      MessageStatus: 'delivered',
      AccountSid: 'AC1',
    };
    const result = handler.handleStatusUpdate(payload, 'sig', 'http://test.com/sms');
    expect(result).toBe(true);
    expect(store.get('SM3')?.status).toBe('delivered');
  });

  it('onIncoming unsubscribe removes callback', () => {
    mockValidate.mockReturnValue(true);
    const cb = vi.fn();
    const unsub = handler.onIncoming(cb);
    unsub();
    handler.handleInbound(
      { MessageSid: 'SM4', From: '+1', To: '+2', Body: 'Z', AccountSid: 'AC1' },
      'sig',
      'url',
    );
    expect(cb).not.toHaveBeenCalled();
  });
});
