// SSO handoff tickets — the bearer token must NEVER travel in a redirect URL.
// These tests prove the ticket scheme's security properties at the service
// layer (mint / verify / consume). Route-level auth (session on mint, client
// credentials on resolve) is enforced in routes/sso-tickets.ts.
import { createHmac } from 'node:crypto';
import * as jose from 'jose';
import { describe, expect, it } from 'vitest';
import {
  consumeSsoTicket,
  getSsoTicketSecretForTests,
  mintSsoTicket,
  SSO_TICKET_TTL_SECONDS,
  SSO_TICKET_TYPE,
  verifySsoTicket,
} from '../services/sso-ticket';

const CLAIMS = {
  userId: 'user-123',
  email: 'someone@quantmail.in',
  username: 'someone',
  displayName: 'Someone',
};

describe('mintSsoTicket', () => {
  it('mints a ticket that verifies with the expected identity claims', async () => {
    const ticket = await mintSsoTicket({ ...CLAIMS, clientId: 'quantai', returnTo: 'https://quantai.in/' });
    const payload = await verifySsoTicket(ticket);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('user-123');
    expect(payload?.email).toBe('someone@quantmail.in');
    expect(payload?.tokenType).toBe(SSO_TICKET_TYPE);
    expect(payload?.clientId).toBe('quantai');
    expect(payload?.jti).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a unique ticket per mint (256-bit random jti)', async () => {
    const a = await mintSsoTicket(CLAIMS);
    const b = await mintSsoTicket(CLAIMS);
    expect(a).not.toBe(b);
  });
});

describe('token-type confusion', () => {
  it('a ticket NEVER verifies as a regular access token under the raw JWT secret', async () => {
    // The access-token verifier uses the raw JWT secret (see
    // packages/server-core/src/plugins/auth.ts). If a ticket verified there,
    // it would be a bearer credential — the exact leak this scheme replaces.
    const ticket = await mintSsoTicket(CLAIMS);
    const rawSecret = new TextEncoder().encode(
      process.env['JWT_SECRET'] ?? 'dev-only-insecure-jwt-secret-not-for-production-use-000',
    );
    await expect(
      jose.jwtVerify(ticket, rawSecret, {
        issuer: 'quantmail',
        audience: 'quant-ecosystem',
      }),
    ).rejects.toThrow();
  });

  it('a JWT signed with the raw access-token secret is rejected as a ticket', async () => {
    // Attacker mints a JWT with the access secret and presents it as a ticket.
    const rawSecret = new TextEncoder().encode(
      process.env['JWT_SECRET'] ?? 'dev-only-insecure-jwt-secret-not-for-production-use-000',
    );
    const forged = await new jose.SignJWT({ tokenType: SSO_TICKET_TYPE })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-123')
      .setJti('a'.repeat(64))
      .setIssuer('quantmail')
      .setAudience('quant-ecosystem')
      .setExpirationTime('2m')
      .sign(rawSecret);
    expect(await verifySsoTicket(forged)).toBeNull();
  });

  it('rejects a ticket whose tokenType claim is not sso-ticket', async () => {
    const ticketSecret = getSsoTicketSecretForTests();
    const wrongType = await new jose.SignJWT({ tokenType: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-123')
      .setJti('b'.repeat(64))
      .setIssuer('quantmail')
      .setAudience('quant-ecosystem')
      .setExpirationTime('2m')
      .sign(ticketSecret);
    expect(await verifySsoTicket(wrongType)).toBeNull();
  });
});

describe('consumeSsoTicket (single-use)', () => {
  it('consumes a ticket exactly once — the second use is rejected', async () => {
    const ticket = await mintSsoTicket(CLAIMS);
    const first = await consumeSsoTicket(ticket);
    expect(first?.userId).toBe('user-123');
    expect(await consumeSsoTicket(ticket)).toBeNull();
  });

  it('rejects expired tickets', async () => {
    const ticketSecret = getSsoTicketSecretForTests();
    const expired = await new jose.SignJWT({ tokenType: SSO_TICKET_TYPE })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-123')
      .setJti('c'.repeat(64))
      .setIssuer('quantmail')
      .setAudience('quant-ecosystem')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(ticketSecret);
    expect(await verifySsoTicket(expired)).toBeNull();
    expect(await consumeSsoTicket(expired)).toBeNull();
  });

  it('rejects tampered tickets', async () => {
    const ticket = await mintSsoTicket(CLAIMS);
    const parts = ticket.split('.');
    const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
    expect(await consumeSsoTicket(tampered)).toBeNull();
  });

  it('rejects garbage input without throwing', async () => {
    expect(await verifySsoTicket('')).toBeNull();
    expect(await verifySsoTicket('not-a-jwt')).toBeNull();
    expect(await consumeSsoTicket('not-a-jwt')).toBeNull();
  });
});

describe('ticket TTL', () => {
  it('advertises a short 120s lifetime', () => {
    expect(SSO_TICKET_TTL_SECONDS).toBe(120);
  });

  it('mints tickets that expire ~120s in the future', async () => {
    const ticket = await mintSsoTicket(CLAIMS);
    const { payload } = await jose.jwtVerify(ticket, getSsoTicketSecretForTests());
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now + 100);
    expect(payload.exp).toBeLessThanOrEqual(now + 120);
  });
});

describe('secret domain separation', () => {
  it('derives the ticket secret from the JWT secret with a fixed label', () => {
    const expected = new Uint8Array(
      createHmac('sha256', process.env['JWT_SECRET'] ?? 'dev-only-insecure-jwt-secret-not-for-production-use-000')
        .update('quant-sso-ticket-v1')
        .digest(),
    );
    expect(Buffer.from(getSsoTicketSecretForTests()).equals(Buffer.from(expected))).toBe(true);
  });
});
