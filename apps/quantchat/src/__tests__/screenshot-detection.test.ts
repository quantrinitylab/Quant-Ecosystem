import { describe, it, expect, vi } from 'vitest';
import { createScreenshotDetector, formatScreenshotMessage } from '../lib/screenshot-detection';

// Unit tests for screenshot detection (Task 14.10). These run in the node
// environment where `document` is undefined, exercising the SSR-safe path and
// the manual trigger API.

describe('formatScreenshotMessage', () => {
  it('names the viewer (Requirement 18.3)', () => {
    expect(formatScreenshotMessage('Zara')).toContain('Zara');
    expect(formatScreenshotMessage('Zara')).toContain('screenshot');
  });
});

describe('createScreenshotDetector', () => {
  it('returns a no-op detacher and a working manual report when document is absent', () => {
    const cb = vi.fn();
    const { detach, report } = createScreenshotDetector(cb);

    // Manual trigger still fires the callback with method 'manual'.
    report();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toMatchObject({ method: 'manual' });
    expect(typeof cb.mock.calls[0][0].detectedAt).toBe('number');

    // Detach is safe to call.
    expect(() => detach()).not.toThrow();
  });
});
