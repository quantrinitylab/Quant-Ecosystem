import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadConfig,
  saveConfig,
  clearConfig,
  getToken,
  getApiUrl,
  CONFIG_FILE,
  CONFIG_DIR,
  getDefaultApiUrl,
} from '../config.js';

vi.mock('node:fs');

describe('CLI Configuration Manager (config.ts)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.QUANT_API_URL;
    delete process.env.QUANT_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves correct config directory and file in home directory', () => {
    const expectedDir = path.join(os.homedir(), '.quant');
    const expectedFile = path.join(expectedDir, 'config.json');
    expect(CONFIG_DIR).toBe(expectedDir);
    expect(CONFIG_FILE).toBe(expectedFile);
  });

  describe('loadConfig', () => {
    it('returns default apiUrl when config file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = loadConfig();
      expect(config).toEqual({
        apiUrl: 'https://quantmail.in',
      });
    });

    it('returns custom QUANT_API_URL from environment when file does not exist', () => {
      process.env.QUANT_API_URL = 'https://custom.quantmail.dev';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = loadConfig();
      expect(config).toEqual({
        apiUrl: 'https://custom.quantmail.dev',
      });
    });

    it('parses valid config file successfully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          apiUrl: 'https://custom.endpoint.in',
          token: 'quant-test-token-123',
          user: {
            id: 'usr_001',
            email: 'dev@quant.in',
            name: 'Lead Developer',
          },
          defaultWorkspace: 'ws_alpha',
        }),
      );

      const config = loadConfig();
      expect(config.apiUrl).toBe('https://custom.endpoint.in');
      expect(config.token).toBe('quant-test-token-123');
      expect(config.user?.email).toBe('dev@quant.in');
      expect(config.defaultWorkspace).toBe('ws_alpha');
    });

    it('handles corrupted JSON gracefully and returns default config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid-json{{{');

      const config = loadConfig();
      expect(config.apiUrl).toBe('https://quantmail.in');
      expect(config.token).toBeUndefined();
    });
  });

  describe('saveConfig', () => {
    it('creates directory if missing and writes JSON config', () => {
      vi.mocked(fs.existsSync).mockImplementation((targetPath) => {
        if (targetPath === CONFIG_DIR) return false;
        if (targetPath === CONFIG_FILE) return false;
        return false;
      });

      saveConfig({
        token: 'new-auth-token',
        user: { id: 'usr_99', email: 'alice@quant.in', name: 'Alice' },
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true, mode: 0o700 });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_FILE,
        expect.stringContaining('"token": "new-auth-token"'),
        expect.objectContaining({ encoding: 'utf-8' }),
      );
    });

    it('merges with existing config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          apiUrl: 'https://staging.quantmail.in',
          token: 'old-token',
          defaultWorkspace: 'ws_main',
        }),
      );

      saveConfig({
        token: 'updated-token',
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_FILE,
        expect.stringMatching(/"apiUrl":\s*"https:\/\/staging\.quantmail\.in"/),
        expect.anything(),
      );
    });
  });

  describe('clearConfig', () => {
    it('unlinks the config file when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      clearConfig();

      expect(fs.unlinkSync).toHaveBeenCalledWith(CONFIG_FILE);
    });

    it('safely handles non-existing config file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => clearConfig()).not.toThrow();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('getToken and getApiUrl', () => {
    it('prioritizes QUANT_TOKEN environment variable over saved config', () => {
      process.env.QUANT_TOKEN = 'env-override-token';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ token: 'file-token' }));

      expect(getToken()).toBe('env-override-token');
    });

    it('falls back to saved config token if QUANT_TOKEN is not set', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ token: 'file-token' }));

      expect(getToken()).toBe('file-token');
    });

    it('prioritizes QUANT_API_URL environment variable over saved config', () => {
      process.env.QUANT_API_URL = 'https://env.quantmail.in';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ apiUrl: 'https://file.quantmail.in' }),
      );

      expect(getApiUrl()).toBe('https://env.quantmail.in');
    });

    it('falls back to default apiUrl if not in env or config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(getApiUrl()).toBe('https://quantmail.in');
    });
  });
});
