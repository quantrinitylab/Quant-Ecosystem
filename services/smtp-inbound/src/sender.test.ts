// ============================================================================
// Email Sender - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailSender, SendEmailOptionsSchema } from './sender';

// Mock nodemailer
const mockSendMail = vi.fn();
const mockVerify = vi.fn();

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({
    sendMail: mockSendMail,
    verify: mockVerify,
  })),
}));

describe('EmailSender', () => {
  let sender: EmailSender;

  beforeEach(() => {
    vi.clearAllMocks();
    sender = new EmailSender({
      host: 'localhost',
      port: 1025,
      secure: false,
    });
  });

  describe('SendEmailOptionsSchema', () => {
    it('should validate correct email options', () => {
      const result = SendEmailOptionsSchema.parse({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Hello',
      });
      expect(result.from).toBe('sender@example.com');
      expect(result.to).toBe('recipient@example.com');
    });

    it('should accept array of recipients', () => {
      const result = SendEmailOptionsSchema.parse({
        from: 'sender@example.com',
        to: ['a@example.com', 'b@example.com'],
        subject: 'Test',
      });
      expect(result.to).toEqual(['a@example.com', 'b@example.com']);
    });

    it('should reject invalid from email', () => {
      expect(() =>
        SendEmailOptionsSchema.parse({
          from: 'not-an-email',
          to: 'recipient@example.com',
          subject: 'Test',
        }),
      ).toThrow();
    });

    it('should reject invalid to email', () => {
      expect(() =>
        SendEmailOptionsSchema.parse({
          from: 'sender@example.com',
          to: 'not-an-email',
          subject: 'Test',
        }),
      ).toThrow();
    });
  });

  describe('send', () => {
    it('should send email successfully and return messageId', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<msg-456@example.com>' });

      const result = await sender.send({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Hello World',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<msg-456@example.com>');
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: undefined,
        text: 'Hello World',
        replyTo: undefined,
      });
    });

    it('should send to multiple recipients', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<msg-789@example.com>' });

      const result = await sender.send({
        from: 'sender@example.com',
        to: ['a@example.com', 'b@example.com'],
        subject: 'Broadcast',
        html: '<p>Hi all</p>',
      });

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@example.com, b@example.com',
        }),
      );
    });

    it('should handle transport errors gracefully', async () => {
      mockSendMail.mockRejectedValue(new Error('Connection refused'));

      const result = await sender.send({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should handle non-Error thrown values', async () => {
      mockSendMail.mockRejectedValue('Unknown error string');

      const result = await sender.send({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should return error result for invalid email options instead of throwing', async () => {
      const result = await sender.send({
        from: 'invalid',
        to: 'recipient@example.com',
        subject: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should include replyTo when provided', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<msg-reply@example.com>' });

      await sender.send({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Reply test',
        replyTo: 'noreply@example.com',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'noreply@example.com',
        }),
      );
    });
  });

  describe('verify', () => {
    it('should return true when transport is verified', async () => {
      mockVerify.mockResolvedValue(true);

      const result = await sender.verify();

      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalled();
    });

    it('should return false when verification fails', async () => {
      mockVerify.mockRejectedValue(new Error('Connection failed'));

      const result = await sender.verify();

      expect(result).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should use default config when none provided', async () => {
      const { createTransport } = await import('nodemailer');
      vi.mocked(createTransport).mockClear();

      new EmailSender();

      expect(createTransport).toHaveBeenCalledWith({
        host: 'localhost',
        port: 1025,
        secure: false,
        auth: undefined,
      });
    });

    it('should use custom auth config', async () => {
      const { createTransport } = await import('nodemailer');
      vi.mocked(createTransport).mockClear();

      new EmailSender({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'user@gmail.com', pass: 'secret' },
      });

      expect(createTransport).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: 'user@gmail.com', pass: 'secret' },
      });
    });
  });
});
