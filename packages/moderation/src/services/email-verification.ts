// ============================================================================
// Moderation - Email Verification Service
// Disposable domain blocklist, MX validation, signed verification tokens
// ============================================================================

import * as crypto from 'crypto';
import * as dns from 'dns';

import type { EmailValidationResult } from '../types';

/** Known disposable email domains (partial list - 50+ domains) */
const DISPOSABLE_DOMAINS: Set<string> = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.de',
  'trashmail.com',
  'trashmail.me',
  'trashmail.net',
  'dispostable.com',
  'mailnesia.com',
  'maildrop.cc',
  'fakeinbox.com',
  'discard.email',
  'tempail.com',
  'temp-mail.org',
  'temp-mail.io',
  'emailondeck.com',
  'getnada.com',
  'burnermail.io',
  'mailcatch.com',
  'mintemail.com',
  'mohmal.com',
  'tempinbox.com',
  'throwawaymail.com',
  'mailforspam.com',
  'spamgourmet.com',
  'mytemp.email',
  'jetable.org',
  'incognitomail.org',
  'mailexpire.com',
  'tempmailaddress.com',
  'tmpmail.net',
  'tmpmail.org',
  'boun.cr',
  'filzmail.com',
  'mailnull.com',
  'spamfree24.org',
  'trashymail.com',
  'bugmenot.com',
  'devnullmail.com',
  'rmqkr.net',
  'getairmail.com',
  'mailsac.com',
  'crazymailing.com',
  'harakirimail.com',
  'tmail.ws',
  'tempmailer.com',
  'fakemailgenerator.com',
  'emailfake.com',
  'tempr.email',
  'throwam.com',
  'mailtemp.net',
  'itsadrop.com',
]);

interface EmailVerificationConfig {
  signingSecret: string;
  tokenExpiryMs: number;
  verificationBaseUrl: string;
}

/**
 * EmailVerificationService - Validates emails and sends signed verification links
 *
 * Features:
 * - Syntax validation
 * - Disposable email domain blocklist
 * - DNS MX record validation
 * - Signed verification token generation and confirmation
 */
export class EmailVerificationService {
  private config: EmailVerificationConfig;
  private verifiedEmails: Set<string> = new Set();

  constructor(config: EmailVerificationConfig) {
    this.config = config;
  }

  /** Validate an email address (syntax, disposable check, MX check) */
  async validate(email: string): Promise<EmailValidationResult> {
    const normalized = email.trim().toLowerCase();

    // Syntax validation
    if (!this.isValidSyntax(normalized)) {
      return { valid: false, reason: 'Invalid email syntax', disposable: false, mxValid: false };
    }

    const parts = normalized.split('@');
    const domain = parts[1] as string;

    // Disposable domain check
    if (this.isDisposableDomain(domain)) {
      return {
        valid: false,
        reason: 'Disposable email domains are not allowed',
        disposable: true,
        mxValid: false,
      };
    }

    // MX record validation
    const mxValid = await this.checkMXRecords(domain);
    if (!mxValid) {
      return {
        valid: false,
        reason: 'Domain has no valid mail server',
        disposable: false,
        mxValid: false,
      };
    }

    return { valid: true, disposable: false, mxValid: true };
  }

  /** Send a verification link to the email */
  async sendVerification(
    email: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const normalized = email.trim().toLowerCase();

    const validation = await this.validate(normalized);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const token = this.generateToken(normalized, userId);
    const link = `${this.config.verificationBaseUrl}/verify?token=${token}`;

    // In production, send the email with the verification link
    void link;

    return { success: true };
  }

  /** Confirm a verification token */
  confirmVerification(token: string): {
    success: boolean;
    email?: string;
    userId?: string;
    error?: string;
  } {
    const payload = this.verifyToken(token);
    if (!payload) {
      return { success: false, error: 'Invalid or expired token' };
    }

    this.verifiedEmails.add(payload.email);
    return { success: true, email: payload.email, userId: payload.userId };
  }

  /** Check if an email has been verified */
  isVerified(email: string): boolean {
    return this.verifiedEmails.has(email.trim().toLowerCase());
  }

  /** Check if a domain is in the disposable email blocklist */
  isDisposableDomain(domain: string): boolean {
    return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
  }

  /** Get the count of blocked disposable domains */
  getDisposableDomainCount(): number {
    return DISPOSABLE_DOMAINS.size;
  }

  // --- Private methods ---

  private isValidSyntax(email: string): boolean {
    // RFC 5322 simplified check
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email) && email.includes('.');
  }

  private async checkMXRecords(domain: string): Promise<boolean> {
    try {
      const records = await dns.promises.resolveMx(domain);
      return records.length > 0;
    } catch {
      return false;
    }
  }

  private generateToken(email: string, userId: string): string {
    const payload = {
      email,
      userId,
      expiresAt: Date.now() + this.config.tokenExpiryMs,
    };
    const data = JSON.stringify(payload);
    const encoded = Buffer.from(data).toString('base64url');
    const signature = this.sign(encoded);
    return `${encoded}.${signature}`;
  }

  private verifyToken(token: string): { email: string; userId: string } | null {
    const dotIndex = token.indexOf('.');
    if (dotIndex === -1) return null;

    const encoded = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);
    const expectedSignature = this.sign(encoded);

    if (signature !== expectedSignature) return null;

    try {
      const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
      if (data.expiresAt < Date.now()) return null;
      return { email: data.email, userId: data.userId };
    } catch {
      return null;
    }
  }

  private sign(data: string): string {
    return crypto.createHmac('sha256', this.config.signingSecret).update(data).digest('base64url');
  }
}
