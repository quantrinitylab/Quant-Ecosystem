// ============================================================================
// Utils - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  generateUUID,
  formatRelativeTime,
  formatDate,
  debounce,
  throttle,
  deepClone,
  sleep,
  retry,
  paginate,
  truncate,
  sanitizeHtml,
  slugify,
  hashString,
  pick,
  omit,
  groupBy,
  formatFileSize,
  clamp,
  isEmpty,
} from '../utils';

describe('generateId', () => {
  it('returns a string with default prefix', () => {
    const id = generateId();
    expect(id).toMatch(/^id_/);
  });

  it('returns a string with custom prefix', () => {
    const id = generateId('user');
    expect(id).toMatch(/^user_/);
  });

  it('generates unique IDs on successive calls', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });
});

describe('generateUUID', () => {
  it('returns a string matching UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique UUIDs', () => {
    const uuid1 = generateUUID();
    const uuid2 = generateUUID();
    expect(uuid1).not.toBe(uuid2);
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for less than 60 seconds ago', () => {
    const date = new Date('2024-06-15T11:59:30Z');
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const date = new Date('2024-06-15T11:55:00Z');
    expect(formatRelativeTime(date)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const date = new Date('2024-06-15T09:00:00Z');
    expect(formatRelativeTime(date)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const date = new Date('2024-06-13T12:00:00Z');
    expect(formatRelativeTime(date)).toBe('2d ago');
  });

  it('returns weeks ago', () => {
    const date = new Date('2024-06-01T12:00:00Z');
    expect(formatRelativeTime(date)).toBe('2w ago');
  });

  it('returns months ago', () => {
    const date = new Date('2024-03-15T12:00:00Z');
    expect(formatRelativeTime(date)).toBe('3mo ago');
  });

  it('returns years ago', () => {
    const date = new Date('2022-06-15T12:00:00Z');
    expect(formatRelativeTime(date)).toBe('2y ago');
  });

  // Boundary transition tests
  it('returns "just now" at exactly 59 seconds', () => {
    const date = new Date(Date.now() - 59 * 1000);
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns "1m ago" at exactly 60 seconds', () => {
    const date = new Date(Date.now() - 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1m ago');
  });

  it('returns "6d ago" at 6 days', () => {
    const date = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('6d ago');
  });

  it('returns "1w ago" at 7 days', () => {
    const date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1w ago');
  });

  it('returns "4w ago" at 29 days', () => {
    const date = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('4w ago');
  });

  it('returns "1mo ago" at 30 days', () => {
    const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1mo ago');
  });
});

describe('formatDate', () => {
  it('formats as ISO string by default', () => {
    const date = new Date('2024-06-15T12:30:00.000Z');
    expect(formatDate(date)).toBe('2024-06-15T12:30:00.000Z');
  });

  it('formats as short date', () => {
    const date = new Date('2024-06-15T12:30:00Z');
    expect(formatDate(date, 'short')).toBe('2024-06-15');
  });

  it('formats as long date with time', () => {
    const date = new Date('2024-06-15T12:30:00Z');
    const result = formatDate(date, 'long');
    expect(result).toContain('2024');
    expect(result).toContain('June');
    expect(result).toContain('15');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays execution until after wait period', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancels previous call on new invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments to the debounced function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('hello', 42);
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('hello', 42);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls function immediately on first invocation', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not call again within the interval', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('schedules trailing call after interval', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);

    throttled();
    throttled();

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('deepClone', () => {
  it('clones primitive values', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(null)).toBe(null);
  });

  it('clones arrays', () => {
    const arr = [1, 2, 3];
    const cloned = deepClone(arr);
    expect(cloned).toEqual(arr);
    cloned.push(4);
    expect(arr).toHaveLength(3);
  });

  it('clones nested objects', () => {
    const obj = { a: 1, b: { c: 2, d: [3, 4] } };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    cloned.b.c = 99;
    expect(obj.b.c).toBe(2);
  });

  it('clones Date objects', () => {
    const date = new Date('2024-01-01');
    const cloned = deepClone(date);
    expect(cloned).toEqual(date);
    expect(cloned).not.toBe(date);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified delay', async () => {
    const promise = sleep(500);
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('retry', () => {
  it('returns result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on second attempt', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('ok');

    const result = await retry(fn, { maxAttempts: 3, baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting max attempts', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('always fails'))
      .mockRejectedValueOnce(new Error('always fails'));

    await expect(retry(fn, { maxAttempts: 2, baseDelayMs: 1 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('returns correct first page', () => {
    const result = paginate(items, { page: 1, pageSize: 3 });
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.total).toBe(10);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(4);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrevious).toBe(false);
  });

  it('returns correct last page', () => {
    const result = paginate(items, { page: 4, pageSize: 3 });
    expect(result.items).toEqual([10]);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrevious).toBe(true);
  });

  it('returns empty items for page beyond total', () => {
    const result = paginate(items, { page: 5, pageSize: 3 });
    expect(result.items).toEqual([]);
  });
});

describe('truncate', () => {
  it('returns string unchanged if shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long string with ellipsis', () => {
    expect(truncate('hello world this is long', 10)).toBe('hello w...');
  });

  it('returns string unchanged if exactly at max', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });
});

describe('sanitizeHtml', () => {
  it('escapes angle brackets', () => {
    expect(sanitizeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes ampersand', () => {
    expect(sanitizeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes', () => {
    expect(sanitizeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes and slashes', () => {
    expect(sanitizeHtml("it's a/b")).toBe('it&#x27;s a&#x2F;b');
  });
});

describe('slugify', () => {
  it('converts to lowercase and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello! @World#')).toBe('hello-world');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });

  it('handles multiple spaces', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });
});

describe('hashString', () => {
  it('returns consistent hash for same input', () => {
    const hash1 = hashString('test');
    const hash2 = hashString('test');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different inputs', () => {
    const hash1 = hashString('hello');
    const hash2 = hashString('world');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a base-36 string', () => {
    const hash = hashString('anything');
    expect(hash).toMatch(/^[0-9a-z]+$/);
  });
});

describe('pick', () => {
  it('picks specified keys from object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('ignores keys not in object', () => {
    const obj = { a: 1, b: 2 };
    expect(pick(obj, ['a', 'c' as keyof typeof obj])).toEqual({ a: 1 });
  });
});

describe('omit', () => {
  it('omits specified keys from object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
  });

  it('returns full object when omitting non-existent keys', () => {
    const obj = { a: 1, b: 2 };
    expect(omit(obj, ['c' as keyof typeof obj])).toEqual({ a: 1, b: 2 });
  });
});

describe('groupBy', () => {
  it('groups items by key function', () => {
    const items = [
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' },
      { name: 'Charlie', role: 'admin' },
    ];
    const result = groupBy(items, (item) => item.role);
    expect(result['admin']).toHaveLength(2);
    expect(result['user']).toHaveLength(1);
  });

  it('handles empty array', () => {
    const result = groupBy([], () => 'key');
    expect(result).toEqual({});
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('formats with decimals', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });
});

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('returns min when value is below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('returns max when value is above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns boundary value when equal to min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns boundary value when equal to max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('isEmpty', () => {
  it('returns true for null', () => {
    expect(isEmpty(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isEmpty(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isEmpty('')).toBe(true);
  });

  it('returns true for whitespace-only string', () => {
    expect(isEmpty('   ')).toBe(true);
  });

  it('returns true for empty array', () => {
    expect(isEmpty([])).toBe(true);
  });

  it('returns true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('returns false for non-empty string', () => {
    expect(isEmpty('hello')).toBe(false);
  });

  it('returns false for non-empty array', () => {
    expect(isEmpty([1])).toBe(false);
  });

  it('returns false for non-empty object', () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });

  it('returns false for number zero', () => {
    expect(isEmpty(0)).toBe(false);
  });
});
