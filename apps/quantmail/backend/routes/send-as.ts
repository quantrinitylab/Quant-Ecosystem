/**
 * Send-mail-as identities — the "Accounts and Import → Send mail as" surface.
 *
 * fix/qm-accounts-import: QuantMail had no alias story at all (repo-wide grep
 * for sendAs/"send mail as"/"mail fetcher"/"import mail" returned zero hits).
 * This module is the backend half: CRUD for per-user From identities plus the
 * destination-verification flow that gates activation.
 *
 * Contract (mirrors account-recovery.ts, the established verification
 * pattern):
 * - An address starts UNVERIFIED (verifiedAt NULL). Only the SHA-256 digest
 *   of a 6-digit code is stored — a leaked table must not be live codes —
 *   single-use, 15-minute-bounded, attempt-capped.
 * - The code is mailed to the address itself, so only someone who can read
 *   that mailbox can activate it. Until then the row is inert: the compose
 *   path rejects unverified identities.
 * - The code dispatch reports `codeDelivered` honestly (SES accepted it or
 *   not); the UI must say "not wired yet"/retry rather than inventing a send.
 * - Adding the account's own address is rejected: the primary address is
 *   always available as the default From, so an alias row for it would be a
 *   placebo.
 * - Listing never exposes code digests or attempt counts.
 */

import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { authenticatedUserId, fail } from '../lib/auth-session';
import {
  MAX_VERIFICATION_ATTEMPTS,
  generateVerificationCode,
  hashVerificationCode,
  isVerificationCodeExpired,
  looksLikeVerificationCode,
  verificationCodeExpiry,
  verificationCodeMatches,
} from '../lib/email-verification';
import { isSesConfigured, sendViaSes } from '../lib/ses-sender';
import { looksLikeEmail, normalizeEmail } from './account-recovery';

function getPrisma(fastify: FastifyInstance): PrismaClient {
  return (fastify as unknown as { prisma: PrismaClient }).prisma;
}

const MAX_DISPLAY_NAME_LENGTH = 80;
const SEND_AS_SUBJECT = 'Confirm you can send mail as this address';

const sendAsVerifyText = (code: string): string =>
  [
    'Hi there,',
    '',
    'You asked to send mail as this address from your QuantMail account.',
    'Enter this verification code to confirm you own it:',
    '',
    `    ${code}`,
    '',
    'The code expires in 15 minutes and can be used once. Until you confirm',
    'it, this address cannot be used as the From of any message. If you did',
    'not ask for this, ignore this email.',
    '',
    '— The QuantMail team',
  ].join('\n');

const sendAsVerifyHtml = (code: string): string =>
  `<p>Hi there,</p>
<p>You asked to send mail as this address from your QuantMail account. Enter this verification code to confirm you own it:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:8px;font-family:monospace;">${code}</p>
<p>The code expires in 15 minutes and can be used once. Until you confirm it, this address cannot be used as the From of any message. If you did not ask for this, ignore this email.</p>
<p>— The QuantMail team</p>`;

/**
 * Dispatch the ownership code to the candidate address. Returns true only
 * when SES accepted the message — the caller answers honestly either way.
 */
const sendOwnershipCode = async (to: string, code: string): Promise<boolean> => {
  if (!isSesConfigured()) {
    console.error('[send-as] SES is not configured; no ownership code was sent to', to);
    return false;
  }
  try {
    await sendViaSes({
      from: process.env['VERIFICATION_EMAIL_FROM'] ?? 'QuantMail <no-reply@quantmail.in>',
      to: [to],
      subject: SEND_AS_SUBJECT,
      bodyText: sendAsVerifyText(code),
      bodyHtml: sendAsVerifyHtml(code),
    });
    return true;
  } catch (error) {
    console.error('[send-as] ownership code delivery failed', error);
    return false;
  }
};

const publicShape = (row: {
  id: string;
  email: string;
  displayName: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}) => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  verified: row.verifiedAt != null,
  verifiedAt: row.verifiedAt,
  createdAt: row.createdAt,
});

/**
 * Resolve a send-as identity for the compose path. Throws the app error the
 * caller converts to the HTTP response — the composer may stamp the address
 * as From only when the row exists, belongs to the caller, and is verified.
 *
 * fix/qm-accounts-import-corrective-3: the implementation moved to
 * services/send-as-identity.service.ts (services must never import from
 * routes/, and EmailService.send() re-authorizes at send time from there).
 * This re-export keeps the existing './send-as' import sites working.
 */
export { resolveSendAsIdentity } from '../services/send-as-identity.service';

export async function sendAsRoutes(fastify: FastifyInstance) {
  // ─── List the caller's identities ─────────────────────────────────────────
  fastify.get('/settings/send-as', async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (!userId) {
      return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    const prisma = getPrisma(fastify);
    const rows = await (prisma as any).sendAsIdentity.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, displayName: true, verifiedAt: true, createdAt: true },
    });
    return reply.send({ success: true, data: rows.map(publicShape) });
  });

  // ─── Add an address → UNVERIFIED until the code comes back ─────────────────
  // Rate-limited like the recovery-email write: each accepted call mails a
  // code to an address the caller named, so an unbounded version is a mail
  // bomb.
  fastify.post(
    '/settings/send-as',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const prisma = getPrisma(fastify);

      const { email, displayName } = (request.body ?? {}) as {
        email?: unknown;
        displayName?: unknown;
      };
      if (!looksLikeEmail(email)) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Enter a valid email address.');
      }
      const normalized = normalizeEmail(email as string);

      if (typeof displayName !== 'undefined' && displayName !== null) {
        if (typeof displayName !== 'string' || displayName.trim().length > MAX_DISPLAY_NAME_LENGTH) {
          return fail(
            reply,
            400,
            'VALIDATION_ERROR',
            `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
          );
        }
      }
      const cleanDisplayName =
        typeof displayName === 'string' && displayName.trim().length > 0
          ? displayName.trim()
          : null;

      // The primary address is always the default From — an alias row for it
      // would be a placebo.
      const account = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (account && normalizeEmail(account.email) === normalized) {
        return fail(
          reply,
          400,
          'SEND_AS_SAME_AS_ACCOUNT',
          'That is your QuantMail address already — it is always available as the default From, no alias needed.',
        );
      }

      // Idempotent re-submit: an already-verified address for this user is
      // the steady state — minting another code would be code-spam to the
      // owner's own mailbox.
      const existing = await (prisma as any).sendAsIdentity.findUnique({
        where: { userId_email: { userId, email: normalized } },
      });
      if (existing?.verifiedAt) {
        if (cleanDisplayName !== null && cleanDisplayName !== existing.displayName) {
          const renamed = await (prisma as any).sendAsIdentity.update({
            where: { id: existing.id },
            data: { displayName: cleanDisplayName },
            select: { id: true, email: true, displayName: true, verifiedAt: true, createdAt: true },
          });
          return reply.send({ success: true, data: publicShape(renamed) });
        }
        return reply.send({
          success: true,
          data: publicShape(existing),
        });
      }

      // One live code per row: a re-add replaces the pending code, so a stale
      // code for a superseded request can never activate.
      const code = generateVerificationCode();
      const row = existing
        ? await (prisma as any).sendAsIdentity.update({
            where: { id: existing.id },
            data: {
              displayName: cleanDisplayName,
              verifiedAt: null,
              codeHash: hashVerificationCode(code),
              codeExpiresAt: verificationCodeExpiry(),
              codeAttempts: 0,
            },
            select: { id: true, email: true, displayName: true, verifiedAt: true, createdAt: true },
          })
        : await (prisma as any).sendAsIdentity.create({
            data: {
              userId,
              email: normalized,
              displayName: cleanDisplayName,
              codeHash: hashVerificationCode(code),
              codeExpiresAt: verificationCodeExpiry(),
            },
            select: { id: true, email: true, displayName: true, verifiedAt: true, createdAt: true },
          });

      const codeDelivered = await sendOwnershipCode(normalized, code);

      return reply.status(201).send({
        success: true,
        data: { ...publicShape(row), pendingVerification: true, codeDelivered },
      });
    },
  );

  // ─── Consume the code → the address becomes a usable From ─────────────────
  fastify.post(
    '/settings/send-as/:id/verify',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const userId = authenticatedUserId(request);
      if (!userId) {
        return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const prisma = getPrisma(fastify);
      const { id } = request.params as { id: string };
      const { code } = (request.body ?? {}) as { code?: unknown };

      if (!looksLikeVerificationCode(code)) {
        return fail(reply, 400, 'VALIDATION_ERROR', 'Enter the 6-digit code.');
      }

      const row = await (prisma as any).sendAsIdentity.findUnique({ where: { id } });
      if (!row || row.userId !== userId) {
        return fail(reply, 404, 'SEND_AS_NOT_FOUND', 'Send-as address not found.');
      }
      if (row.verifiedAt) {
        return reply.send({ success: true, data: publicShape(row) });
      }
      if (!row.codeHash || !row.codeExpiresAt) {
        return fail(
          reply,
          400,
          'SEND_AS_NO_PENDING_CODE',
          'No verification code is pending for this address. Add it again to get a new code.',
        );
      }
      if (isVerificationCodeExpired(row.codeExpiresAt)) {
        await (prisma as any).sendAsIdentity.update({
          where: { id },
          data: { codeHash: null, codeExpiresAt: null, codeAttempts: 0 },
        });
        return fail(
          reply,
          400,
          'SEND_AS_CODE_EXPIRED',
          'That code has expired. Add the address again to get a new code.',
        );
      }
      if (row.codeAttempts >= MAX_VERIFICATION_ATTEMPTS) {
        await (prisma as any).sendAsIdentity.update({
          where: { id },
          data: { codeHash: null, codeExpiresAt: null, codeAttempts: 0 },
        });
        return fail(
          reply,
          400,
          'SEND_AS_TOO_MANY_ATTEMPTS',
          'Too many wrong codes. Add the address again to get a new code.',
        );
      }
      if (!verificationCodeMatches(code as string, row.codeHash)) {
        await (prisma as any).sendAsIdentity.update({
          where: { id },
          data: { codeAttempts: row.codeAttempts + 1 },
        });
        return fail(reply, 400, 'SEND_AS_CODE_MISMATCH', 'That code does not match. Try again.');
      }

      // Single-use: the digest is cleared in the same write that activates,
      // so a captured code cannot be replayed.
      const verified = await (prisma as any).sendAsIdentity.update({
        where: { id },
        data: {
          verifiedAt: new Date(),
          codeHash: null,
          codeExpiresAt: null,
          codeAttempts: 0,
        },
        select: { id: true, email: true, displayName: true, verifiedAt: true, createdAt: true },
      });
      return reply.send({ success: true, data: publicShape(verified) });
    },
  );

  // ─── Remove an identity ───────────────────────────────────────────────────
  fastify.delete('/settings/send-as/:id', async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (!userId) {
      return fail(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    const prisma = getPrisma(fastify);
    const { id } = request.params as { id: string };

    const row = await (prisma as any).sendAsIdentity.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      return fail(reply, 404, 'SEND_AS_NOT_FOUND', 'Send-as address not found.');
    }
    await (prisma as any).sendAsIdentity.delete({ where: { id } });
    return reply.send({ success: true, data: { removed: true, id } });
  });
}
