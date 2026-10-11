// @vitest-environment node
// ============================================================================
// SSO handoff tickets (lib/sso-ticket) — the ?token= replacement.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@quant/auth/lib/prisma', () => {
  const ssoTicket = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  return { default: { ssoTicket }, prisma: { ssoTicket } };
});

import prisma from '@quant/auth/lib/prisma';
import {
  generateSsoTicket,
  hashSsoTicket,
  looksLikeSsoTicket,
  mintSsoTicket,
  consumeSsoTicket,
  isSsoTicketExpired,
  ssoTicketExpiry,
  SSO_TICKET_TTL_SECONDS,
} from '../lib/sso-ticket';

describe('sso-ticket primitives', () => {
  it('generates 256-bit base64url tickets', () => {
    const t = generateSsoTicket();
    expect(looksLikeSsoTicket(t)).toBe(true);
    // 32 bytes → 43 base64url chars
    expect(t).toHaveLength(43);
    expect(generateSsoTicket()).not.toBe(generateSsoTicket());
  });

  it('hashes tickets (digest-only storage)', () => {
    const t = generateSsoTicket();
    expect(hashSsoTicket(t)).toHaveLength(64);
    expect(hashSsoTicket(t)).not.toContain(t);
  });

  it('rejects malformed tickets', () => {
    expect(looksLikeSsoTicket('')).toBe(false);
    expect(looksLikeSsoTicket('short')).toBe(false);
    expect(looksLikeSsoTicket(null)).toBe(false);
    expect(looksLikeSsoTicket('x'.repeat(200))).toBe(false);
  });

  it('expires in 60 seconds', () => {
    expect(SSO_TICKET_TTL_SECONDS).toBe(60);
    const exp = ssoTicketExpiry(1_000_000);
    expect(exp.getTime() - 1_000_000).toBe(60_000);
    expect(isSsoTicketExpired(new Date(1_000_000), 1_000_000 + 60_001)).toBe(true);
    expect(isSsoTicketExpired(new Date(1_060_000), 1_000_000)).toBe(false);
  });
});

describe('mint/consume', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mint stores only the digest and returns the raw ticket', async () => {
    const p = prisma as any;
    p.ssoTicket.create.mockImplementation(async (args: any) => ({
      id: 't1',
      ...args.data,
    }));

    const { ticket, expiresAt } = await mintSsoTicket({
      userId: 'u1',
      clientId: 'quantai',
      audience: 'https://quantai.quantrinity.in',
    });

    expect(looksLikeSsoTicket(ticket)).toBe(true);
    const stored = p.ssoTicket.create.mock.calls[0][0].data;
    expect(stored.ticketHash).toBe(hashSsoTicket(ticket));
    expect(stored).not.toHaveProperty('ticket');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('consume enforces audience binding', async () => {
    const p = prisma as any;
    const ticket = generateSsoTicket();
    p.ssoTicket.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      clientId: 'quantai',
      audience: 'https://quantai.quantrinity.in',
      ticketHash: hashSsoTicket(ticket),
      expiresAt: new Date(Date.now() + 30_000),
      usedAt: null,
    });

    // Wrong audience → dead on arrival, NOT consumed.
    expect(await consumeSsoTicket(ticket, 'https://evil.example')).toBeNull();
    expect(p.ssoTicket.updateMany).not.toHaveBeenCalled();

    // Right audience → consumed exactly once.
    const verified = await consumeSsoTicket(ticket, 'https://quantai.quantrinity.in');
    expect(verified).toEqual({
      userId: 'u1',
      clientId: 'quantai',
      audience: 'https://quantai.quantrinity.in',
    });
    expect(p.ssoTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('consume rejects expired and already-used tickets', async () => {
    const p = prisma as any;
    const ticket = generateSsoTicket();

    p.ssoTicket.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      clientId: 'quantai',
      audience: 'https://quantai.quantrinity.in',
      ticketHash: hashSsoTicket(ticket),
      expiresAt: new Date(Date.now() - 1_000),
      usedAt: null,
    });
    expect(await consumeSsoTicket(ticket, 'https://quantai.quantrinity.in')).toBeNull();

    p.ssoTicket.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      clientId: 'quantai',
      audience: 'https://quantai.quantrinity.in',
      ticketHash: hashSsoTicket(ticket),
      expiresAt: new Date(Date.now() + 30_000),
      usedAt: new Date(),
    });
    expect(await consumeSsoTicket(ticket, 'https://quantai.quantrinity.in')).toBeNull();
  });

  it('concurrent double-consume: only the first wins', async () => {
    const p = prisma as any;
    const ticket = generateSsoTicket();
    p.ssoTicket.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      clientId: 'quantai',
      audience: 'https://quantai.quantrinity.in',
      ticketHash: hashSsoTicket(ticket),
      expiresAt: new Date(Date.now() + 30_000),
      usedAt: null,
    });
    // Second racer sees the row already spent.
    p.ssoTicket.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    expect(await consumeSsoTicket(ticket, 'https://quantai.quantrinity.in')).not.toBeNull();
    expect(await consumeSsoTicket(ticket, 'https://quantai.quantrinity.in')).toBeNull();
  });
});
