// ============================================================================
// QuantMail — phone number + real SMS OTP verification.
//
//   GET  /auth/phone                 -> { phoneNumber, phoneVerified, smsReady }
//   POST /auth/phone/send-otp        -> { phoneNumber } sends a 6-digit OTP by SMS
//   POST /auth/phone/verify          -> { code } marks the number verified
//   DELETE /auth/phone               -> unlink the number
//
// OTPs are never stored in plaintext: only a SHA-256 hash is kept, with a
// 5-minute expiry, max 5 attempts, and a 60-second resend cooldown.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash, randomInt } from 'crypto';
import { createAppError } from '@quant/server-core';
import { sendSms, smsReady, smsUnavailableReason } from '../services/sms.service';

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const sendSchema = z.object({
  // E.164, e.g. +919812345678
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Enter the number in international format, e.g. +919812345678'),
});
const verifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, 'Enter the 6-digit code'),
});

interface PendingOtp {
  phoneNumber: string;
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

const pending = new Map<string, PendingOtp>();

function hashCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

function prune(): void {
  const now = Date.now();
  for (const [key, value] of pending) {
    if (value.expiresAt < now) pending.delete(key);
  }
}

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}

function maskNumber(value: string | null): string | null {
  if (!value) return null;
  return value.length > 4
    ? `${value.slice(0, value.length - 4).replace(/\d/g, '•')}${value.slice(-4)}`
    : value;
}

export default async function phoneRoutes(fastify: FastifyInstance) {
  fastify.get('/auth/phone', async (request, reply) => {
    const userId = requireUserId(request);
    const user = await getPrisma(fastify).user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true, phoneVerified: true },
    });

    prune();
    const outstanding = pending.get(userId);

    return reply.send({
      success: true,
      data: {
        phoneNumber: user?.phoneNumber ?? null,
        maskedPhoneNumber: maskNumber(user?.phoneNumber ?? null),
        phoneVerified: Boolean(user?.phoneVerified),
        smsReady: smsReady(),
        pending: outstanding
          ? { phoneNumber: maskNumber(outstanding.phoneNumber), expiresAt: outstanding.expiresAt }
          : null,
      },
    });
  });

  fastify.post('/auth/phone/send-otp', async (request, reply) => {
    const parsed = sendSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const { phoneNumber } = parsed.data;

    if (!smsReady()) throw createAppError(smsUnavailableReason(), 503, 'SMS_UNAVAILABLE');

    prune();
    const existing = pending.get(userId);
    if (existing && Date.now() - existing.sentAt < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.sentAt)) / 1000);
      throw createAppError(
        `Please wait ${waitSeconds}s before requesting another code`,
        429,
        'OTP_COOLDOWN',
      );
    }

    const takenBy = await prisma.user.findFirst({
      where: { phoneNumber, phoneVerified: true, NOT: { id: userId } },
      select: { id: true },
    });
    if (takenBy) {
      throw createAppError('This number is already linked to another account', 409, 'PHONE_TAKEN');
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      await sendSms(
        phoneNumber,
        `${code} is your QuantMail verification code. It expires in 5 minutes. Never share it.`,
      );
    } catch (err) {
      request.log.error({ err }, 'OTP SMS send failed');
      throw createAppError('Could not send the verification SMS right now', 503, 'SMS_FAILED');
    }

    pending.set(userId, {
      phoneNumber,
      codeHash: hashCode(code),
      expiresAt: Date.now() + OTP_TTL_MS,
      sentAt: Date.now(),
      attempts: 0,
    });

    return reply.send({
      success: true,
      data: {
        sent: true,
        maskedPhoneNumber: maskNumber(phoneNumber),
        expiresInSeconds: OTP_TTL_MS / 1000,
      },
    });
  });

  fastify.post('/auth/phone/verify', async (request, reply) => {
    const parsed = verifySchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    prune();
    const outstanding = pending.get(userId);
    if (!outstanding) {
      throw createAppError(
        'No verification code is pending. Request a new one.',
        400,
        'OTP_EXPIRED',
      );
    }
    if (outstanding.attempts >= MAX_ATTEMPTS) {
      pending.delete(userId);
      throw createAppError('Too many wrong attempts. Request a new code.', 429, 'OTP_ATTEMPTS');
    }

    if (hashCode(parsed.data.code) !== outstanding.codeHash) {
      outstanding.attempts += 1;
      throw createAppError('That code is not correct', 400, 'OTP_INVALID');
    }

    pending.delete(userId);
    await prisma.user.update({
      where: { id: userId },
      data: { phoneNumber: outstanding.phoneNumber, phoneVerified: true },
    });

    return reply.send({
      success: true,
      data: {
        phoneVerified: true,
        maskedPhoneNumber: maskNumber(outstanding.phoneNumber),
      },
    });
  });

  fastify.delete('/auth/phone', async (request, reply) => {
    const userId = requireUserId(request);
    pending.delete(userId);
    await getPrisma(fastify).user.update({
      where: { id: userId },
      data: { phoneNumber: null, phoneVerified: false },
    });
    return reply.send({ success: true, data: { phoneVerified: false, phoneNumber: null } });
  });
}
