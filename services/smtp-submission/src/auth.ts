// ============================================================================
// SMTP Submission Daemon - SASL Authentication Service (RFC 6409)
// ============================================================================

import argon2 from 'argon2';
import crypto from 'node:crypto';
import type { SMTPServerAuthentication, SMTPServerSession } from 'smtp-server';
import { prisma, type PrismaClient } from '@quant/database';
import { verifyPersonalAccessToken } from '@quant/auth';

/**
 * Normalized user representation stored in the authenticated SMTP session.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  activeAliases?: string[];
}

/**
 * Custom error with SMTP response code support.
 */
export class SmtpError extends Error {
  responseCode: number;

  constructor(message: string, responseCode: number = 550) {
    super(message);
    this.name = 'SmtpError';
    this.responseCode = responseCode;
  }
}

/**
 * SmtpAuthService provides SASL authentication mechanisms (PLAIN, LOGIN, XOAUTH2)
 * for the RFC 6409 SMTP submission daemon, validating credentials against the
 * Quant database using argon2id and OAuth/PAT token validation.
 */
export class SmtpAuthService {
  private readonly db: PrismaClient;

  constructor(customPrisma?: PrismaClient) {
    this.db = customPrisma || (prisma as PrismaClient);
  }

  /**
   * Main authentication dispatcher invoked by smtp-server's `onAuth` callback.
   *
   * @param auth - SMTPServerAuthentication descriptor containing method, username, password/accessToken.
   * @param session - SMTPServerSession associated with the client TCP socket.
   * @returns The authenticated user, or null if credentials are invalid.
   */
  async authenticate(
    auth: SMTPServerAuthentication,
    _session?: SMTPServerSession,
  ): Promise<AuthenticatedUser | null> {
    const method = auth.method.toUpperCase();

    switch (method) {
      case 'PLAIN':
        if (!auth.username || !auth.password) {
          return null;
        }
        return this.authenticatePlain(auth.username, auth.password);

      case 'LOGIN':
        if (!auth.username || !auth.password) {
          return null;
        }
        return this.authenticateLogin(auth.username, auth.password);

      case 'XOAUTH2':
        if (!auth.username || !auth.accessToken) {
          return null;
        }
        return this.authenticateXOAuth2(auth.username, auth.accessToken);

      default:
        return null;
    }
  }

  /**
   * Authenticate via SASL PLAIN.
   */
  async authenticatePlain(username: string, password: string): Promise<AuthenticatedUser | null> {
    return this.verifyUserCredentials(username, password);
  }

  /**
   * Authenticate via SASL LOGIN.
   */
  async authenticateLogin(username: string, password: string): Promise<AuthenticatedUser | null> {
    return this.verifyUserCredentials(username, password);
  }

  /**
   * Authenticate via SASL XOAUTH2 bearer access token.
   * Supports Quant Personal Access Tokens (qcp_*) and standard JWT Bearer tokens.
   */
  async authenticateXOAuth2(
    username: string,
    accessToken: string,
  ): Promise<AuthenticatedUser | null> {
    const normalizedUsername = username.trim().toLowerCase();

    // 1. Try Personal Access Token (PAT)
    if (accessToken.startsWith('qcp_')) {
      const verified = await verifyPersonalAccessToken(this.db, accessToken);
      if (!verified) {
        return null;
      }
      const user = await this.db.user.findUnique({
        where: { id: verified.userId },
      });
      if (!user) {
        return null;
      }
      if (
        user.email.toLowerCase() !== normalizedUsername &&
        user.username.toLowerCase() !== normalizedUsername
      ) {
        return null;
      }
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
      };
    }

    // 2. Try JWT Bearer Token
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const [headerB64, payloadB64, signatureB64] = parts;
        if (headerB64 && payloadB64 && signatureB64) {
          const secret =
            process.env['JWT_SECRET'] || 'development_quant_jwt_secret_32_characters_minimum';
          const expectedSig = crypto
            .createHmac('sha256', secret)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');

          if (
            expectedSig.length === signatureB64.length &&
            crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signatureB64))
          ) {
            const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
              sub?: string;
              userId?: string;
              exp?: number;
            };

            if (payload.exp && Date.now() >= payload.exp * 1000) {
              return null;
            }

            const userId = payload.sub || payload.userId;
            if (!userId) {
              return null;
            }

            const user = await this.db.user.findUnique({
              where: { id: userId },
            });
            if (!user) {
              return null;
            }

            if (
              user.email.toLowerCase() !== normalizedUsername &&
              user.username.toLowerCase() !== normalizedUsername
            ) {
              return null;
            }

            return {
              id: user.id,
              email: user.email,
              username: user.username,
              displayName: user.displayName,
            };
          }
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Look up user by email or username and verify password hash with argon2.
   */
  private async verifyUserCredentials(
    username: string,
    password: string,
  ): Promise<AuthenticatedUser | null> {
    const cleanIdentifier = username.trim().toLowerCase();
    if (!cleanIdentifier || !password) {
      return null;
    }

    const user = await this.db.user.findFirst({
      where: {
        OR: [{ email: cleanIdentifier }, { username: cleanIdentifier }],
      },
    });

    const DUMMY_HASH =
      '$argon2id$v=19$m=65536,t=3,p=4$dummyhashtopreventtimingattacksonuserlookups$dummyhashtopreventtimingattacksonuserlookups';

    if (!user || !user.passwordHash) {
      await argon2.verify(DUMMY_HASH, password).catch(() => false);
      return null;
    }

    try {
      const isValid = await argon2.verify(user.passwordHash, password);
      if (!isValid) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
      };
    } catch {
      return null;
    }
  }
}
