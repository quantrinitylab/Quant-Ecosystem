import { describe, it, expect, vi } from 'vitest';
import { SsoLoginService, type CrossAppValidator } from '../services/sso-login.service';

function validatorReturning(
  result: Awaited<ReturnType<CrossAppValidator['validateCrossAppToken']>>,
): CrossAppValidator {
  return { validateCrossAppToken: vi.fn(async () => result) };
}

describe('SsoLoginService', () => {
  it('returns the token + projected user on a valid cross-app token', async () => {
    const validator = validatorReturning({
      valid: true,
      payload: { sub: 'user-1', email: 'a@quant.dev', username: 'alice', role: 'user' },
    });
    const service = new SsoLoginService(validator);

    const result = await service.login('qm-token');

    expect(result.accessToken).toBe('qm-token');
    expect(result.user).toEqual({
      id: 'user-1',
      email: 'a@quant.dev',
      username: 'alice',
      role: 'user',
    });
    expect(validator.validateCrossAppToken).toHaveBeenCalledWith('qm-token', 'quantsync');
  });

  it('rejects a missing/blank token with 400 before validating', async () => {
    const validator = validatorReturning({
      valid: true,
      payload: { sub: 'x', email: '', username: '', role: '' },
    });
    const service = new SsoLoginService(validator);

    await expect(service.login('   ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.login(undefined)).rejects.toMatchObject({ statusCode: 400 });
    expect(validator.validateCrossAppToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid token with 401 and surfaces the reason', async () => {
    const validator = validatorReturning({ valid: false, reason: 'Token has expired' });
    const service = new SsoLoginService(validator);

    await expect(service.login('bad')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Token has expired',
    });
  });

  it('rejects a valid result with no subject claim', async () => {
    const validator = validatorReturning({
      valid: true,
      payload: { sub: '', email: 'a@b.c', username: 'a', role: 'user' },
    });
    const service = new SsoLoginService(validator);

    await expect(service.login('tok')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('falls back username to email/sub and role to "user" when claims are sparse', async () => {
    const validator = validatorReturning({
      valid: true,
      payload: { sub: 'user-9' } as never,
    });
    const service = new SsoLoginService(validator);

    const result = await service.login('tok');
    expect(result.user.username).toBe('user-9');
    expect(result.user.role).toBe('user');
    expect(result.user.email).toBe('');
  });
});
