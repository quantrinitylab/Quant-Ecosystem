// ============================================================================
// Auth - Phone/SMS Authentication Provider (QuantChat)
// ============================================================================

import type { PhoneAuthRequest, PhoneVerification, TokenPair, AuthConfig } from '../types';
import type { PermissionScope } from '@quant/common';
import { TokenService } from '../services/token-service';

/** SMS delivery status */
export interface SMSDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Phone auth configuration */
export interface PhoneAuthConfig {
  codeLength: number;
  codeExpiryMinutes: number;
  maxAttempts: number;
  cooldownSeconds: number;
  rateLimitPerHour: number;
}

const DEFAULT_PHONE_CONFIG: PhoneAuthConfig = {
  codeLength: 6,
  codeExpiryMinutes: 5,
  maxAttempts: 3,
  cooldownSeconds: 60,
  rateLimitPerHour: 5,
};

/**
 * Phone Authentication Provider
 *
 * Provides SMS-based authentication for QuantChat, allowing users
 * to sign in with their phone number. Supports:
 * - SMS verification code delivery
 * - Code validation with attempt limiting
 * - Rate limiting to prevent abuse
 * - Cooldown between code requests
 */
export class PhoneAuthProvider {
  private verifications: Map<string, PhoneVerification> = new Map();
  private rateLimits: Map<string, { count: number; resetAt: Date }> = new Map();
  private cooldowns: Map<string, Date> = new Map();
  private tokenService: TokenService;
  private phoneConfig: PhoneAuthConfig;

  constructor(authConfig: AuthConfig, phoneConfig: Partial<PhoneAuthConfig> = {}) {
    this.tokenService = new TokenService(authConfig);
    this.phoneConfig = { ...DEFAULT_PHONE_CONFIG, ...phoneConfig };
  }

  /**
   * Send a verification code to a phone number
   */
  async sendVerificationCode(phoneNumber: string): Promise<{
    success: boolean;
    error?: string;
    expiresIn?: number;
    retryAfter?: number;
  }> {
    // Validate phone number format
    const cleaned = phoneNumber.replace(/[\s\-()]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
      return { success: false, error: 'Invalid phone number format' };
    }

    // Check cooldown
    const cooldownUntil = this.cooldowns.get(cleaned);
    if (cooldownUntil && cooldownUntil > new Date()) {
      const retryAfter = Math.ceil((cooldownUntil.getTime() - Date.now()) / 1000);
      return { success: false, error: 'Too soon. Please wait before requesting another code.', retryAfter };
    }

    // Check rate limit
    const rateLimit = this.rateLimits.get(cleaned);
    if (rateLimit) {
      if (rateLimit.resetAt > new Date() && rateLimit.count >= this.phoneConfig.rateLimitPerHour) {
        const retryAfter = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000);
        return { success: false, error: 'Rate limit exceeded. Try again later.', retryAfter };
      }
      if (rateLimit.resetAt <= new Date()) {
        this.rateLimits.delete(cleaned);
      }
    }

    // Generate verification code
    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + this.phoneConfig.codeExpiryMinutes * 60 * 1000);

    // Store verification
    this.verifications.set(cleaned, {
      phoneNumber: cleaned,
      code,
      expiresAt,
      attempts: 0,
      maxAttempts: this.phoneConfig.maxAttempts,
      verified: false,
    });

    // Set cooldown
    this.cooldowns.set(cleaned, new Date(Date.now() + this.phoneConfig.cooldownSeconds * 1000));

    // Update rate limit
    const currentLimit = this.rateLimits.get(cleaned) || { count: 0, resetAt: new Date(Date.now() + 3600000) };
    currentLimit.count++;
    this.rateLimits.set(cleaned, currentLimit);

    // Send SMS (in production, integrate with SMS provider like Twilio)
    const deliveryResult = await this.deliverSMS(cleaned, code);
    if (!deliveryResult.success) {
      this.verifications.delete(cleaned);
      return { success: false, error: 'Failed to send SMS. Please try again.' };
    }

    return {
      success: true,
      expiresIn: this.phoneConfig.codeExpiryMinutes * 60,
    };
  }

  /**
   * Verify a phone number with the provided code
   */
  async verifyCode(request: PhoneAuthRequest): Promise<{
    success: boolean;
    tokens?: TokenPair;
    error?: string;
    attemptsRemaining?: number;
  }> {
    const cleaned = request.phoneNumber.replace(/[\s\-()]/g, '');
    const verification = this.verifications.get(cleaned);

    if (!verification) {
      return { success: false, error: 'No pending verification for this number' };
    }

    // Check expiration
    if (verification.expiresAt < new Date()) {
      this.verifications.delete(cleaned);
      return { success: false, error: 'Verification code expired. Please request a new code.' };
    }

    // Check max attempts
    if (verification.attempts >= verification.maxAttempts) {
      this.verifications.delete(cleaned);
      return { success: false, error: 'Too many attempts. Please request a new code.' };
    }

    // Validate code
    verification.attempts++;
    if (verification.code !== request.verificationCode) {
      const remaining = verification.maxAttempts - verification.attempts;
      if (remaining <= 0) {
        this.verifications.delete(cleaned);
        return { success: false, error: 'Invalid code. Maximum attempts exceeded.', attemptsRemaining: 0 };
      }
      return {
        success: false,
        error: 'Invalid verification code',
        attemptsRemaining: remaining,
      };
    }

    // Code verified successfully
    verification.verified = true;
    this.verifications.delete(cleaned);

    // Generate tokens for the authenticated user
    const scopes: PermissionScope[] = [
      'profile:read',
      'profile:write',
      'messages:read',
      'messages:write',
      'realtime:connect',
      'contacts:read',
    ];

    const tokens = await this.tokenService.generateTokenPair(
      `phone_${cleaned}`, // In production, look up or create user by phone
      { email: '', username: '', role: 'user' },
      scopes,
      'quantchat'
    );

    return { success: true, tokens };
  }

  /**
   * Check if a phone number has a pending verification
   */
  hasPendingVerification(phoneNumber: string): boolean {
    const cleaned = phoneNumber.replace(/[\s\-()]/g, '');
    const verification = this.verifications.get(cleaned);
    if (!verification) return false;
    return verification.expiresAt > new Date() && !verification.verified;
  }

  /**
   * Cancel a pending verification
   */
  cancelVerification(phoneNumber: string): void {
    const cleaned = phoneNumber.replace(/[\s\-()]/g, '');
    this.verifications.delete(cleaned);
  }

  /**
   * Generate a numeric verification code
   */
  private generateVerificationCode(): string {
    let code = '';
    for (let i = 0; i < this.phoneConfig.codeLength; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    return code;
  }

  /**
   * Deliver SMS to phone number
   * In production, this integrates with an SMS gateway (Twilio, AWS SNS, etc.)
   */
  private async deliverSMS(phoneNumber: string, code: string): Promise<SMSDeliveryResult> {
    // Simulate SMS delivery
    const messageId = `sms_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // In production:
    // const result = await twilioClient.messages.create({
    //   body: `Your QuantChat verification code is: ${code}`,
    //   to: phoneNumber,
    //   from: '+1QUANTCHAT',
    // });

    // Simulate success (with small chance of failure for realistic behavior)
    const success = Math.random() > 0.02; // 98% success rate simulation

    return {
      success,
      messageId: success ? messageId : undefined,
      error: success ? undefined : 'SMS delivery failed',
    };
  }

  /**
   * Clean up expired verifications and rate limits
   */
  cleanup(): void {
    const now = new Date();
    for (const [key, verification] of this.verifications) {
      if (verification.expiresAt < now) {
        this.verifications.delete(key);
      }
    }
    for (const [key, limit] of this.rateLimits) {
      if (limit.resetAt < now) {
        this.rateLimits.delete(key);
      }
    }
    for (const [key, cooldown] of this.cooldowns) {
      if (cooldown < now) {
        this.cooldowns.delete(key);
      }
    }
  }
}
