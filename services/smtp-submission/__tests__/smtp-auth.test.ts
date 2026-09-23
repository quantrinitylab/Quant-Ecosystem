// ============================================================================
// SMTP Submission Daemon - Authentication Tests (RFC 6409 / SASL)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import net from 'node:net';
import tls from 'node:tls';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { SmtpAuthService } from '../src/auth';
import { SmtpSubmissionServer } from '../src/server';
import { OutboundSubmissionQueue } from '../src/queue';
import type { PrismaClient } from '@quant/database';

describe('SmtpAuthService', () => {
  let mockPrisma: any;
  let authService: SmtpAuthService;
  let testPasswordHash: string;

  beforeEach(async () => {
    testPasswordHash = await argon2.hash('SecretPass123!');

    mockPrisma = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      personalAccessToken: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    authService = new SmtpAuthService(mockPrisma as unknown as PrismaClient);
  });

  describe('SASL PLAIN Authentication', () => {
    it('authenticates successfully with valid email and password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'usr_1',
        email: 'alice@quantmail.in',
        username: 'alice',
        displayName: 'Alice Quant',
        passwordHash: testPasswordHash,
      });

      const user = await authService.authenticatePlain('alice@quantmail.in', 'SecretPass123!');

      expect(user).not.toBeNull();
      expect(user?.id).toBe('usr_1');
      expect(user?.email).toBe('alice@quantmail.in');
    });

    it('authenticates successfully with username instead of email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'usr_1',
        email: 'alice@quantmail.in',
        username: 'alice',
        displayName: 'Alice Quant',
        passwordHash: testPasswordHash,
      });

      const user = await authService.authenticatePlain('alice', 'SecretPass123!');

      expect(user).not.toBeNull();
      expect(user?.username).toBe('alice');
    });

    it('rejects authentication with invalid password', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'usr_1',
        email: 'alice@quantmail.in',
        username: 'alice',
        displayName: 'Alice Quant',
        passwordHash: testPasswordHash,
      });

      const user = await authService.authenticatePlain('alice@quantmail.in', 'WrongPassword!');

      expect(user).toBeNull();
    });

    it('rejects authentication when user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const user = await authService.authenticatePlain('unknown@quantmail.in', 'AnyPass123!');

      expect(user).toBeNull();
    });
  });

  describe('SASL LOGIN Authentication', () => {
    it('authenticates successfully via LOGIN method', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'usr_2',
        email: 'bob@quantmail.in',
        username: 'bob',
        displayName: 'Bob Smith',
        passwordHash: testPasswordHash,
      });

      const user = await authService.authenticateLogin('bob@quantmail.in', 'SecretPass123!');

      expect(user).not.toBeNull();
      expect(user?.id).toBe('usr_2');
    });
  });

  describe('SASL XOAUTH2 Authentication', () => {
    it('authenticates with valid JWT token', async () => {
      const secret = 'test_secret_32_characters_long_for_jwt_test';
      process.env['JWT_SECRET'] = secret;

      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'usr_jwt_1',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      const sig = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');
      const jwtToken = `${header}.${payload}.${sig}`;

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_jwt_1',
        email: 'jwtuser@quantmail.in',
        username: 'jwtuser',
        displayName: 'JWT User',
      });

      const user = await authService.authenticateXOAuth2('jwtuser@quantmail.in', jwtToken);

      expect(user).not.toBeNull();
      expect(user?.id).toBe('usr_jwt_1');
      expect(user?.email).toBe('jwtuser@quantmail.in');
    });

    it('rejects expired JWT token', async () => {
      const secret = 'test_secret_32_characters_long_for_jwt_test';
      process.env['JWT_SECRET'] = secret;

      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'usr_jwt_1',
          exp: Math.floor(Date.now() / 1000) - 3600, // Expired
        }),
      ).toString('base64url');
      const sig = crypto
        .createHmac('sha256', secret)
        .update(`${header}.${payload}`)
        .digest('base64url');
      const jwtToken = `${header}.${payload}.${sig}`;

      const user = await authService.authenticateXOAuth2('jwtuser@quantmail.in', jwtToken);

      expect(user).toBeNull();
    });
  });

  describe('Full Dispatcher authenticate()', () => {
    it('dispatches PLAIN method to authenticatePlain', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'usr_1',
        email: 'alice@quantmail.in',
        username: 'alice',
        displayName: 'Alice Quant',
        passwordHash: testPasswordHash,
      });

      const user = await authService.authenticate({
        method: 'PLAIN',
        username: 'alice@quantmail.in',
        password: 'SecretPass123!',
        validatePassword: () => true,
      });

      expect(user).not.toBeNull();
      expect(user?.email).toBe('alice@quantmail.in');
    });

    it('returns null for unknown auth method', async () => {
      const user = await authService.authenticate({
        method: 'CRAM-MD5' as any,
        username: 'alice',
        password: 'password',
        validatePassword: () => true,
      });

      expect(user).toBeNull();
    });
  });
});

describe('SmtpSubmissionServer - TCP Authentication & Relaying Enforcement', () => {
  let server: SmtpSubmissionServer;
  let submissionPort: number;
  let smtpsPort: number;
  let mockPrisma: any;
  let mockQueue: any;
  let testPasswordHash: string;

  beforeEach(async () => {
    testPasswordHash = await argon2.hash('SubmissionKey2026!');

    mockPrisma = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      emailFolder: {
        findFirst: vi.fn().mockResolvedValue({ id: 'sent_folder_1' }),
      },
      email: {
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.data.id })),
      },
    };

    mockQueue = {
      add: vi.fn().mockResolvedValue('job-123'),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const authService = new SmtpAuthService(mockPrisma as unknown as PrismaClient);
    const queue = new OutboundSubmissionQueue(mockQueue, mockPrisma as unknown as PrismaClient);

    server = new SmtpSubmissionServer({
      submissionPort: 0, // OS assigned ephemeral port
      smtpsPort: 0,
      authService,
      queue,
      allowInsecureAuth: true,
    });

    const started = await server.start();
    submissionPort = started.submissionPort;
    smtpsPort = started.smtpsPort;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('rejects unauthenticated MAIL FROM with 530 5.7.0 Authentication required', async () => {
    const response = await sendSmtpCommands(submissionPort, [
      'EHLO testclient.local',
      'MAIL FROM:<unauth@quantmail.in>',
    ]);

    expect(response).toContain('530');
    expect(response).toMatch(/Authentication required/i);
  });

  it('authenticates with AUTH PLAIN and accepts MAIL FROM for authenticated user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'usr_valid',
      email: 'carol@quantmail.in',
      username: 'carol',
      displayName: 'Carol',
      passwordHash: testPasswordHash,
    });

    // SASL PLAIN format: base64("\0carol@quantmail.in\0SubmissionKey2026!")
    const authString = Buffer.from('\0carol@quantmail.in\0SubmissionKey2026!').toString('base64');

    const response = await sendSmtpCommands(submissionPort, [
      'EHLO testclient.local',
      `AUTH PLAIN ${authString}`,
      'MAIL FROM:<carol@quantmail.in>',
    ]);

    expect(response).toContain('235'); // 235 Authentication successful
    expect(response).toContain('250'); // 250 OK for MAIL FROM
  });

  it('authenticates over SMTPS (implicit TLS) on smtpsPort', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'usr_tls',
      email: 'tlsuser@quantmail.in',
      username: 'tlsuser',
      displayName: 'TLS User',
      passwordHash: testPasswordHash,
    });

    const authString = Buffer.from('\0tlsuser@quantmail.in\0SubmissionKey2026!').toString('base64');

    const response = await sendSmtpCommandsTls(smtpsPort, [
      'EHLO testclient.local',
      `AUTH PLAIN ${authString}`,
      'MAIL FROM:<tlsuser@quantmail.in>',
    ]);

    expect(response).toContain('235');
    expect(response).toContain('250');
  });
});

/** Helper to connect to TCP SMTP port and exchange lines */
function sendSmtpCommands(port: number, commands: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let transcript = '';
    let commandIdx = 0;

    socket.setEncoding('utf-8');

    socket.on('connect', () => {
      // Wait for banner
    });

    socket.on('data', (data) => {
      transcript += data;
      const lines = data.split('\r\n');
      const lastLine = lines[lines.length - 2] || lines[lines.length - 1];

      // Check if server is ready for next command (status code followed by space)
      if (/^\d{3}\s/.test(lastLine || '')) {
        if (commandIdx < commands.length) {
          const cmd = commands[commandIdx++];
          socket.write(`${cmd}\r\n`);
        } else {
          socket.write('QUIT\r\n');
        }
      }
    });

    socket.on('close', () => {
      resolve(transcript);
    });

    socket.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      socket.destroy();
      resolve(transcript);
    }, 4000);
  });
}

/** Helper to connect to TLS SMTP port (SMTPS 465) and exchange lines */
function sendSmtpCommandsTls(port: number, commands: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = tls.connect({
      port,
      host: '127.0.0.1',
      rejectUnauthorized: false,
    });
    let transcript = '';
    let commandIdx = 0;

    socket.setEncoding('utf-8');

    socket.on('secureConnect', () => {
      // Wait for banner
    });

    socket.on('data', (data) => {
      transcript += data;
      const lines = data.split('\r\n');
      const lastLine = lines[lines.length - 2] || lines[lines.length - 1];

      if (/^\d{3}\s/.test(lastLine || '')) {
        if (commandIdx < commands.length) {
          const cmd = commands[commandIdx++];
          socket.write(`${cmd}\r\n`);
        } else {
          socket.write('QUIT\r\n');
        }
      }
    });

    socket.on('close', () => {
      resolve(transcript);
    });

    socket.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      socket.destroy();
      resolve(transcript);
    }, 4000);
  });
}
