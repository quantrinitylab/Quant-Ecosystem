import { describe, it, expect, vi, afterEach } from 'vitest';
import { parsePort, DEFAULT_PORT } from '../lib/parse-port';

/**
 * Guards the Bug 2 crash fix: a non-numeric / empty / out-of-range PORT used
 * to reach `app.listen({ port: NaN })` and throw
 * `RangeError [ERR_SOCKET_BAD_PORT]`, killing the backend at startup.
 * parsePort() must always return a valid port (default 3010).
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parsePort', () => {
  it("falls back to 3010 for non-numeric PORT='abc'", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort('abc')).toBe(3010);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid PORT="abc"'),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('3010'));
  });

  it("falls back to 3010 for empty PORT=''", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort('')).toBe(3010);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid PORT=""'),
    );
  });

  it("falls back to 3010 for out-of-range PORT='99999'", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort('99999')).toBe(3010);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid PORT="99999"'),
    );
  });

  it("falls back to 3010 for PORT='0'", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort('0')).toBe(3010);
    expect(warn).toHaveBeenCalled();
  });

  it("falls back to 3010 for non-integer PORT='8080.5'", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort('8080.5')).toBe(3010);
    expect(warn).toHaveBeenCalled();
  });

  it("uses the value for valid PORT='8080' without warning", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort('8080')).toBe(8080);
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts the boundary ports 1 and 65535', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort('1')).toBe(1);
    expect(parsePort('65535')).toBe(65535);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to 3010 when PORT is unset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parsePort(undefined)).toBe(3010);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('3010'));
  });

  it('reads process.env.PORT when no argument is given', () => {
    const prev = process.env['PORT'];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      process.env['PORT'] = '8080';
      expect(parsePort()).toBe(8080);

      process.env['PORT'] = 'abc';
      expect(parsePort()).toBe(3010);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid PORT="abc"'),
      );

      delete process.env['PORT'];
      expect(parsePort()).toBe(3010);
    } finally {
      if (prev === undefined) delete process.env['PORT'];
      else process.env['PORT'] = prev;
    }
  });

  it('keeps the pre-existing default of 3010', () => {
    expect(DEFAULT_PORT).toBe(3010);
  });
});
