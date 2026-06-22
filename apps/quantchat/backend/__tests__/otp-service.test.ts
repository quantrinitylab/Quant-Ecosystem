import { describe, it, expect, vi } from 'vitest';
import { OtpService, type SmsSender } from '../lib/otp-service';

function makeSender(): SmsSender & { messages: { phone: string; body: string }[] } {
  const messages: { phone: string; body: string }[] = [];
  return {
    messages,
    async send(phone, body) {
      messages.push({ phone, body });
      return { success: true };
    },
  };
}

/** Extract the 6-digit code the service "sent" (dev sender captures the body). */
function codeFrom(sender: { messages: { body: string }[] }): string {
  const last = sender.messages.at(-1)!.body;
  return /(\d{6})/.exec(last)![1];
}

describe('OtpService', () => {
  it('rejects malformed phone numbers (E.164 required)', async () => {
    const svc = new OtpService(makeSender());
    expect((await svc.requestCode('12345')).ok).toBe(false);
    expect((await svc.requestCode('+1')).ok).toBe(false);
    expect((await svc.requestCode('not-a-phone')).ok).toBe(false);
  });

  it('sends a code and verifies it successfully', async () => {
    const sender = makeSender();
    const svc = new OtpService(sender);
    const req = await svc.requestCode('+14155550123');
    expect(req.ok).toBe(true);
    expect(req.expiresInSec).toBeGreaterThan(0);
    expect(svc.verifyCode('+14155550123', codeFrom(sender)).ok).toBe(true);
  });

  it('normalises formatting differences between send and verify', async () => {
    const sender = makeSender();
    const svc = new OtpService(sender);
    await svc.requestCode('+1 (415) 555-0123');
    expect(svc.verifyCode('+14155550123', codeFrom(sender)).ok).toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const sender = makeSender();
    const svc = new OtpService(sender);
    await svc.requestCode('+14155550123');
    expect(svc.verifyCode('+14155550123', '000000').ok).toBe(false);
  });

  it('generates cryptographic, varied codes (not a constant)', async () => {
    const sender = makeSender();
    // Disable cooldown/rate-limit so we can sample many codes.
    const svc = new OtpService(sender, { cooldownMs: 0, maxSendsPerHour: 10_000 });
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      await svc.requestCode('+14155550123');
      codes.add(codeFrom(sender));
    }
    expect(codes.size).toBeGreaterThan(50); // overwhelmingly unique
    for (const c of codes) expect(c).toMatch(/^\d{6}$/);
  });

  it('enforces a cooldown between requests', async () => {
    let t = 1_000_000;
    const svc = new OtpService(makeSender(), { cooldownMs: 60_000 }, () => t);
    expect((await svc.requestCode('+14155550123')).ok).toBe(true);
    const blocked = await svc.requestCode('+14155550123');
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('enforces an hourly send rate limit', async () => {
    let t = 1_000_000;
    const svc = new OtpService(makeSender(), { cooldownMs: 0, maxSendsPerHour: 3 }, () => t);
    for (let i = 0; i < 3; i++) expect((await svc.requestCode('+14155550123')).ok).toBe(true);
    const limited = await svc.requestCode('+14155550123');
    expect(limited.ok).toBe(false);
    expect(limited.error).toContain('Too many');
  });

  it('expires codes after the TTL', async () => {
    let t = 1_000_000;
    const sender = makeSender();
    const svc = new OtpService(sender, { codeTtlMs: 1000 }, () => t);
    await svc.requestCode('+14155550123');
    const code = codeFrom(sender);
    t += 2000; // advance past TTL
    const res = svc.verifyCode('+14155550123', code);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('expired');
  });

  it('locks out after too many wrong attempts', async () => {
    const sender = makeSender();
    const svc = new OtpService(sender, { maxVerifyAttempts: 3 });
    await svc.requestCode('+14155550123');
    for (let i = 0; i < 3; i++) svc.verifyCode('+14155550123', '111111');
    // 4th attempt exceeds cap -> locked out, code discarded even if correct
    const correct = codeFrom(sender);
    const res = svc.verifyCode('+14155550123', correct);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Too many attempts');
  });

  it('does not verify when no code was requested', () => {
    const svc = new OtpService(makeSender());
    expect(svc.verifyCode('+14155550123', '123456').ok).toBe(false);
  });

  it('returns the SMS send failure to the caller', async () => {
    const failing: SmsSender = {
      send: vi.fn(async () => ({ success: false, error: 'carrier down' })),
    };
    const svc = new OtpService(failing);
    const res = await svc.requestCode('+14155550123');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('carrier down');
  });
});
