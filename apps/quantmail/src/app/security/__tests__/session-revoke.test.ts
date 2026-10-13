import { describe, expect, it } from 'vitest';
import { describeRevokeAvailability } from '../session-revoke';

const session = (id: string, isCurrent: boolean) => ({ id, isCurrent });

describe('describeRevokeAvailability', () => {
  it('enables revoke with the current device excluded from the others count', () => {
    const result = describeRevokeAvailability([
      session('fam-current', true),
      session('fam-a', false),
      session('fam-b', false),
    ]);
    expect(result).toEqual({ enabled: true, othersCount: 2, currentUnknown: false });
  });

  it('disables revoke and flags currentUnknown when no session is marked current', () => {
    // The backend would fail closed with 409 CURRENT_SESSION_UNKNOWN here, so
    // the UI must not count this device among "other" sessions.
    const result = describeRevokeAvailability([session('fam-a', false), session('fam-b', false)]);
    expect(result).toEqual({ enabled: false, othersCount: 0, currentUnknown: true });
  });

  it('disables revoke when only the current device is active', () => {
    const result = describeRevokeAvailability([session('fam-current', true)]);
    expect(result).toEqual({ enabled: false, othersCount: 0, currentUnknown: false });
  });

  it('disables revoke before the session list loads', () => {
    const result = describeRevokeAvailability(null);
    expect(result).toEqual({ enabled: false, othersCount: 0, currentUnknown: false });
  });

  it('disables revoke on an empty session list', () => {
    const result = describeRevokeAvailability([]);
    expect(result).toEqual({ enabled: false, othersCount: 0, currentUnknown: false });
  });
});
