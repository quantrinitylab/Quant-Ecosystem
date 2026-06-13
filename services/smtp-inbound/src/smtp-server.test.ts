// ============================================================================
// SMTP Inbound Server - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmtpInboundServer, SmtpConfigSchema } from './smtp-server';

// Mock smtp-server module
const mockListen = vi.fn();
const mockClose = vi.fn();
const mockOn = vi.fn();

vi.mock('smtp-server', () => ({
  SMTPServer: vi.fn().mockImplementation(function () {
    return {
      listen: mockListen,
      close: mockClose,
      on: mockOn,
    };
  }),
}));

// Mock mailparser module
vi.mock('mailparser', () => ({
  simpleParser: vi.fn(),
}));

describe('SmtpInboundServer', () => {
  let server: SmtpInboundServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new SmtpInboundServer(SmtpConfigSchema.parse({ port: 2525, host: '0.0.0.0' }));
  });

  describe('SmtpConfigSchema', () => {
    it('should parse valid config with defaults', () => {
      const config = SmtpConfigSchema.parse({});
      expect(config.port).toBe(2525);
      expect(config.host).toBe('0.0.0.0');
      expect(config.secure).toBe(false);
      expect(config.authOptional).toBe(true);
      expect(config.maxMessageSize).toBe(10 * 1024 * 1024);
    });

    it('should accept custom config', () => {
      const config = SmtpConfigSchema.parse({
        port: 587,
        host: '127.0.0.1',
        secure: true,
        authOptional: false,
        maxMessageSize: 5 * 1024 * 1024,
      });
      expect(config.port).toBe(587);
      expect(config.host).toBe('127.0.0.1');
      expect(config.secure).toBe(true);
    });

    it('should reject invalid port', () => {
      expect(() => SmtpConfigSchema.parse({ port: -1 })).toThrow();
    });
  });

  describe('start', () => {
    it('should create an SMTP server and start listening', async () => {
      mockListen.mockImplementation((_port: number, _host: string, callback: () => void) => {
        callback();
      });

      await server.start();

      expect(mockListen).toHaveBeenCalledWith(2525, '0.0.0.0', expect.any(Function));
    });

    it('should reject if server emits error', async () => {
      mockOn.mockImplementation((event: string, handler: (err: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => handler(new Error('EADDRINUSE')), 0);
        }
      });

      // The listen should never call its callback
      mockListen.mockImplementation(() => {
        // never calls callback
      });

      await expect(server.start()).rejects.toThrow('EADDRINUSE');
    });
  });

  describe('stop', () => {
    it('should close the server when running', async () => {
      mockListen.mockImplementation((_port: number, _host: string, callback: () => void) => {
        callback();
      });
      mockClose.mockImplementation((callback: () => void) => {
        callback();
      });

      await server.start();
      await server.stop();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should resolve immediately when server is not running', async () => {
      await server.stop();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('onMessage', () => {
    it('should register a message handler', async () => {
      const handler = vi.fn();
      server.onMessage(handler);

      // The handler is stored internally; verify by accessing SMTPServer constructor args
      const { SMTPServer: MockSMTPServer } = await import('smtp-server');
      mockListen.mockImplementation((_port: number, _host: string, callback: () => void) => {
        callback();
      });

      await server.start();

      // Verify SMTPServer was constructed with onData handler
      expect(MockSMTPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: false,
          authOptional: true,
          onData: expect.any(Function),
        }),
      );
    });

    it('should process incoming email through the handler', async () => {
      const { simpleParser } = await import('mailparser');
      const mockSimpleParser = vi.mocked(simpleParser);

      const handler = vi.fn().mockResolvedValue(undefined);
      server.onMessage(handler);

      mockSimpleParser.mockResolvedValue({
        from: {
          text: 'sender@example.com',
          value: [{ address: 'sender@example.com', name: '' }],
          html: '',
        },
        to: {
          text: 'recipient@example.com',
          value: [{ address: 'recipient@example.com', name: '' }],
          html: '',
        },
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello',
        attachments: [],
        messageId: '<msg-123@example.com>',
        inReplyTo: undefined,
        date: new Date('2024-01-01'),
      } as never);

      mockListen.mockImplementation((_port: number, _host: string, callback: () => void) => {
        callback();
      });

      await server.start();

      // Get the onData handler from the SMTPServer constructor
      const { SMTPServer: MockSMTPServer } = await import('smtp-server');
      const constructorCall = vi.mocked(MockSMTPServer).mock.calls[0];
      const options = constructorCall?.[0] as {
        onData: (stream: unknown, session: unknown, cb: (err?: Error | null) => void) => void;
      };
      const onDataHandler = options.onData;

      // Simulate incoming data stream
      const callback = vi.fn();
      const mockStream = {} as never;
      onDataHandler(mockStream, {}, callback);

      // Wait for async handler to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'sender@example.com',
          subject: 'Test Subject',
          html: '<p>Hello</p>',
          text: 'Hello',
          messageId: '<msg-123@example.com>',
        }),
      );
      expect(callback).toHaveBeenCalledWith(null);
    });
  });
});
