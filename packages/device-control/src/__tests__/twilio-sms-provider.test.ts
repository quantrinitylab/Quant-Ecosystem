import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TwilioSMSProvider, type TwilioSMSClientLike } from '../providers/twilio-sms-provider.js';

describe('TwilioSMSProvider', () => {
  describe('mock mode', () => {
    let provider: TwilioSMSProvider;

    beforeEach(() => {
      delete process.env['TWILIO_ACCOUNT_SID'];
      delete process.env['TWILIO_AUTH_TOKEN'];
      delete process.env['TWILIO_FROM_NUMBER'];
      provider = new TwilioSMSProvider();
    });

    it('sendSMS returns mock SID', async () => {
      const sid = await provider.sendSMS('+15551234567', 'Hello');
      expect(sid).toMatch(/^SM_mock_/);
    });

    it('readSMS returns stored message', async () => {
      const sid = await provider.sendSMS('+15551234567', 'Test body');
      const msg = await provider.readSMS(sid);
      expect(msg.body).toBe('Test body');
      expect(msg.from).toBe('mock-from');
    });

    it('readSMS throws for unknown id', async () => {
      await expect(provider.readSMS('unknown')).rejects.toThrow('Message not found');
    });

    it('onIncomingSMS returns unsubscribe function', () => {
      const cb = vi.fn();
      const unsub = provider.onIncomingSMS(cb);
      expect(typeof unsub).toBe('function');
    });
  });

  describe('live mode', () => {
    let provider: TwilioSMSProvider;
    let mockClient: TwilioSMSClientLike;

    beforeEach(() => {
      mockClient = { messages: { create: vi.fn().mockResolvedValue({ sid: 'SM_live_1' }) } };
      provider = new TwilioSMSProvider(
        { accountSid: 'AC123', authToken: 'token', fromNumber: '+15550000000' },
        mockClient,
      );
    });

    it('sendSMS calls client with correct params', async () => {
      const sid = await provider.sendSMS('+15559999999', 'Hi there');
      expect(sid).toBe('SM_live_1');
      expect(mockClient.messages.create).toHaveBeenCalledWith({
        to: '+15559999999',
        from: '+15550000000',
        body: 'Hi there',
      });
    });

    it('readSMS returns message after send', async () => {
      await provider.sendSMS('+15559999999', 'Stored msg');
      const msg = await provider.readSMS('SM_live_1');
      expect(msg.body).toBe('Stored msg');
    });
  });
});
