// ============================================================================
// Quant Ecosystem - Utility Functions
// ============================================================================

import type { PaginatedResult, PaginationParams } from './types';

/**
 * Generate a unique ID using crypto-safe random values.
 * Format: prefix_timestamp_random
 */
export function generateId(prefix: string = 'id'): string {
  const timestamp = Date.now().toString(36);
  const buf = new Uint32Array(2);
  globalThis.crypto.getRandomValues(buf);
  const randomPart = buf[0]!.toString(36) + buf[1]!.toString(36);
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Generate a UUID v4 compatible string
 */
export function generateUUID(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback: assemble an RFC 4122 v4 UUID from CSPRNG bytes.
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    h.push(bytes[i]!.toString(16).padStart(2, '0'));
  }
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

/**
 * Format a date to a human-readable relative time string
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

/**
 * Format a date to ISO string with timezone
 */
export function formatDate(date: Date, format: 'iso' | 'short' | 'long' = 'iso'): string {
  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'short':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    case 'long':
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  }
}

/**
 * Debounce a function - delays execution until after wait period of inactivity
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function debounced(...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, waitMs);
  };
}

/**
 * Throttle a function - ensures it runs at most once per interval
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  intervalMs: number,
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function throttled(...args: Parameters<T>): void {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= intervalMs) {
      lastCallTime = now;
      fn(...args);
    } else if (timeoutId === null) {
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now();
        fn(...args);
        timeoutId = null;
      }, intervalMs - timeSinceLastCall);
    }
  };
}

/**
 * Deep clone an object using structured cloning approach
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (Array.isArray(obj)) return obj.map((item) => deepClone(item)) as unknown as T;

  const cloned = {} as Record<string, unknown>;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
  }
  return cloned as T;
}

/**
 * Sleep/delay for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number } = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxAttempts) break;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = delay * 0.1 * Math.random();
      await sleep(delay + jitter);
    }
  }
  throw lastError;
}

/**
 * Create a paginated result from an array
 */
export function paginate<T>(items: T[], params: PaginationParams): PaginatedResult<T> {
  const { page, pageSize } = params;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/**
 * Truncate a string to a specified length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Sanitize HTML content to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return input.replace(/[&<>"'/]/g, (char) => replacements[char] || char);
}

/**
 * Generate a slug from a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Hash a string using simple hash function (not crypto-safe, for cache keys)
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Group an array of items by a key
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Clamp a number between min and max values
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Sanitize a URL for use in media src attributes (img, video, audio).
 * Only allows http:, https:, and data:image/ protocols.
 * Returns an empty string for invalid or potentially dangerous URLs.
 */
export function sanitizeMediaUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (trimmed === '') return '';

  // Block obfuscated javascript: protocol (with whitespace/control chars)
  if (/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i.test(trimmed)) {
    return '';
  }

  // Block vbscript: protocol
  if (/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i.test(trimmed)) {
    return '';
  }

  // Allow relative URLs (no protocol)
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed;
  }

  // Allow safe absolute protocols
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Allow data:image/ URLs (but not data:text/html or other dangerous types)
  if (/^data:image\//i.test(trimmed)) {
    return trimmed;
  }

  // Block everything else (unknown protocols, data:text/html, etc.)
  return '';
}
