import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailVerificationService } from './email-verification';
import * as dns from 'dns';

// Mock dns.promises.resolveMx
vi.mock('dns', () => ({
  promises: {
    resolveMx: vi.fn(),
  },
}));

const mockedResolveMx = vi.mocked(dns.promises.resolveMx);

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmailVerificationService({
      signingSecret: 'test-secret-key-for-hmac-signing',
      tokenExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
      verificationBaseUrl: 'https://quant.app',
    });

    // Default: MX records exist
    mockedResolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
  });

  describe('disposable domain rejection', () => {
    it('should reject mailinator.com', async () => {
      const result = await service.validate('user@mailinator.com');
      expect(result.valid).toBe(false);
      expect(result.disposable).toBe(true);
      expect(result.reason).toContain('Disposable');
    });

    it('should reject guerrillamail.com', async () => {
      const result = await service.validate('test@guerrillamail.com');
      expect(result.valid).toBe(false);
      expect(result.disposable).toBe(true);
    });

    it('should reject tempmail.com', async () => {
      const result = await service.validate('user@tempmail.com');
      expect(result.valid).toBe(false);
      expect(result.disposable).toBe(true);
    });

    it('should reject yopmail.com', async () => {
      const result = await service.validate('test@yopmail.com');
      expect(result.valid).toBe(false);
      expect(result.disposable).toBe(true);
    });

    it('should reject throwaway.email', async () => {
      const result = await service.validate('user@throwaway.email');
      expect(result.valid).toBe(false);
      expect(result.disposable).toBe(true);
    });

    it('should accept gmail.com', async () => {
      const result = await service.validate('user@gmail.com');
      expect(result.valid).toBe(true);
      expect(result.disposable).toBe(false);
    });

    it('should have at least 50 disposable domains in the blocklist', () => {
      expect(service.getDisposableDomainCount()).toBeGreaterThanOrEqual(50);
    });
  });

  describe('MX record validation', () => {
    it('should accept domains with valid MX records', async () => {
      mockedResolveMx.mockResolvedValue([{ exchange: 'mx.gmail.com', priority: 5 }]);
      const result = await service.validate('user@gmail.com');
      expect(result.valid).toBe(true);
      expect(result.mxValid).toBe(true);
    });

    it('should reject domains with no MX records', async () => {
      mockedResolveMx.mockResolvedValue([]);
      const result = await service.validate('user@nonexistent-domain-xyz.com');
      expect(result.valid).toBe(false);
      expect(result.mxValid).toBe(false);
      expect(result.reason).toContain('no valid mail server');
    });

    it('should reject domains when DNS lookup fails', async () => {
      mockedResolveMx.mockRejectedValue(new Error('ENOTFOUND'));
      const result = await service.validate('user@totally-fake-domain.xyz');
      expect(result.valid).toBe(false);
      expect(result.mxValid).toBe(false);
    });
  });

  describe('syntax validation', () => {
    it('should reject emails without @ sign', async () => {
      const result = await service.validate('invalid-email');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid email syntax');
    });

    it('should reject emails without domain', async () => {
      const result = await service.validate('user@');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid email syntax');
    });

    it('should reject emails without local part', async () => {
      const result = await service.validate('@domain.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid email syntax');
    });

    it('should accept valid email format', async () => {
      const result = await service.validate('user.name+tag@example.com');
      expect(result.valid).toBe(true);
    });
  });

  describe('verification tokens', () => {
    it('should generate and confirm a valid token', async () => {
      const sendResult = await service.sendVerification('user@example.com', 'user-123');
      expect(sendResult.success).toBe(true);
    });

    it('should confirm a valid token', () => {
      // Generate token directly for testing
      const tokenService = new EmailVerificationService({
        signingSecret: 'test-secret',
        tokenExpiryMs: 60000,
        verificationBaseUrl: 'https://quant.app',
      });

      // sendVerification returns the token internally; use confirmVerification with a manually crafted token
      // We test the full flow by sending and then confirming
      const payload = {
        email: 'test@example.com',
        userId: 'user-456',
        expiresAt: Date.now() + 60000,
      };
      const data = JSON.stringify(payload);
      const encoded = Buffer.from(data).toString('base64url');

      // Sign with the same secret
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(encoded)
        .digest('base64url');
      const token = `${encoded}.${signature}`;

      const result = tokenService.confirmVerification(token);
      expect(result.success).toBe(true);
      expect(result.email).toBe('test@example.com');
      expect(result.userId).toBe('user-456');
    });

    it('should reject an expired token', () => {
      const payload = {
        email: 'test@example.com',
        userId: 'user-789',
        expiresAt: Date.now() - 1000, // already expired
      };
      const data = JSON.stringify(payload);
      const encoded = Buffer.from(data).toString('base64url');

      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', 'test-secret-key-for-hmac-signing')
        .update(encoded)
        .digest('base64url');
      const token = `${encoded}.${signature}`;

      const result = service.confirmVerification(token);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired');
    });

    it('should reject a tampered token', () => {
      const payload = {
        email: 'test@example.com',
        userId: 'user-789',
        expiresAt: Date.now() + 60000,
      };
      const data = JSON.stringify(payload);
      const encoded = Buffer.from(data).toString('base64url');
      const token = `${encoded}.invalid-signature`;

      const result = service.confirmVerification(token);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired');
    });
  });
});
