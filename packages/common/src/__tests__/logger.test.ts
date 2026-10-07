// ============================================================================
// Logger Utility - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    debug: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('in non-production environment', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    it('logger.log calls console.log', () => {
      logger.log('test message');
      expect(consoleSpy.log).toHaveBeenCalledWith('[QUANT]', 'test message');
    });

    it('logger.warn calls console.warn', () => {
      logger.warn('warning');
      expect(consoleSpy.warn).toHaveBeenCalledWith('[QUANT]', 'warning');
    });

    it('logger.debug calls console.debug', () => {
      logger.debug('debug info');
      expect(consoleSpy.debug).toHaveBeenCalledWith('[QUANT]', 'debug info');
    });

    it('logger.error calls console.error', () => {
      logger.error('error occurred');
      expect(consoleSpy.error).toHaveBeenCalledWith('[QUANT]', 'error occurred');
    });
  });

  describe('in production environment', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('logger.error always calls console.error regardless of NODE_ENV', () => {
      logger.error('critical error');
      expect(consoleSpy.error).toHaveBeenCalledWith('[QUANT]', 'critical error');
    });

    it('logger.log does NOT call console.log in production', () => {
      logger.log('should not appear');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('logger.warn does NOT call console.warn in production', () => {
      logger.warn('should not appear');
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('logger.debug does NOT call console.debug in production', () => {
      logger.debug('should not appear');
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });
  });

  describe('prefix behavior', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test');
    });

    it('all methods prefix with [QUANT]', () => {
      logger.log('a');
      logger.warn('b');
      logger.error('c');
      logger.debug('d');

      expect(consoleSpy.log).toHaveBeenCalledWith('[QUANT]', 'a');
      expect(consoleSpy.warn).toHaveBeenCalledWith('[QUANT]', 'b');
      expect(consoleSpy.error).toHaveBeenCalledWith('[QUANT]', 'c');
      expect(consoleSpy.debug).toHaveBeenCalledWith('[QUANT]', 'd');
    });

    it('passes multiple arguments after prefix', () => {
      logger.log('msg', { data: 1 }, 42);
      expect(consoleSpy.log).toHaveBeenCalledWith('[QUANT]', 'msg', { data: 1 }, 42);
    });
  });
});
