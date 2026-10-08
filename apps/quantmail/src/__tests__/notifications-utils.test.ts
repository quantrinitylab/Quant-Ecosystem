// @vitest-environment node
// ============================================================================
// K10 / M15 — notifications-center formatting contract.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  priorityTone,
  formatTime,
  isSecurityType,
  safeInternalPath,
} from '../app/notifications/notifications-utils';

describe('priorityTone', () => {
  it('marks URGENT and HIGH distinctly from the rest', () => {
    expect(priorityTone('URGENT')).toContain('red');
    expect(priorityTone('HIGH')).toContain('amber');
    expect(priorityTone('NORMAL')).not.toContain('red');
    expect(priorityTone('LOW')).toBe(priorityTone('NORMAL'));
  });
});

describe('formatTime', () => {
  it('returns a clock time for today', () => {
    const now = new Date();
    const text = formatTime(now.toISOString());
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });

  it('says Yesterday for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatTime(yesterday.toISOString())).toBe('Yesterday');
  });

  it('returns empty for garbage', () => {
    expect(formatTime('garbage')).toBe('');
  });
});

describe('isSecurityType', () => {
  it('flags security-flavoured types', () => {
    expect(isSecurityType('security.alert')).toBe(true);
    expect(isSecurityType('auth.login')).toBe(true);
    expect(isSecurityType('password_changed')).toBe(true);
  });

  it('leaves ordinary types alone', () => {
    expect(isSecurityType('mail.new')).toBe(false);
    expect(isSecurityType('calendar.reminder')).toBe(false);
  });
});

describe('safeInternalPath', () => {
  const origin = 'https://quantmail.in';

  it('passes same-origin deep links through', () => {
    expect(safeInternalPath('/calendar/event/abc?x=1', origin)).toBe('/calendar/event/abc?x=1');
    expect(safeInternalPath('https://quantmail.in/drive', origin)).toBe('/drive');
  });

  it('refuses off-origin URLs', () => {
    expect(safeInternalPath('https://evil.example/phish', origin)).toBeNull();
    expect(safeInternalPath('//evil.example/phish', origin)).toBeNull();
  });

  it('refuses null and garbage', () => {
    expect(safeInternalPath(null, origin)).toBeNull();
    // A bare word resolves against the origin and is therefore safe.
    expect(safeInternalPath('calendar', origin)).toBe('/calendar');
  });
});
