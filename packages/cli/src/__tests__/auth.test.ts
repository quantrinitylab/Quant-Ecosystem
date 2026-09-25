import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerAuthCommands } from '../commands/auth.js';
import * as configModule from '../config.js';
import { QuantCliClient } from '../client.js';

describe('Auth CLI Commands (commands/auth.ts)', () => {
  let program: Command;
  let logSpy: any;
  let errorSpy: any;
  let stdoutWriteSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    registerAuthCommands(program);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers all auth subcommands', () => {
    const authCmd = program.commands.find((c) => c.name() === 'auth');
    expect(authCmd).toBeDefined();

    const subcommands = authCmd!.commands.map((c) => c.name());
    expect(subcommands).toContain('login');
    expect(subcommands).toContain('logout');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('whoami');
    expect(subcommands).toContain('token');
  });

  describe('quant auth whoami', () => {
    it('prints email when user is authenticated', async () => {
      vi.spyOn(configModule, 'loadConfig').mockReturnValue({
        apiUrl: 'https://quantmail.in',
        token: 'active-token-xyz',
        user: { id: 'u1', email: 'founder@quant.in', name: 'Founder' },
      });
      vi.spyOn(configModule, 'getToken').mockReturnValue('active-token-xyz');

      await program.parseAsync(['node', 'quant', 'auth', 'whoami']);

      expect(logSpy).toHaveBeenCalledWith('founder@quant.in');
    });

    it('prints "Not logged in" when unauthenticated', async () => {
      vi.spyOn(configModule, 'loadConfig').mockReturnValue({
        apiUrl: 'https://quantmail.in',
      });
      vi.spyOn(configModule, 'getToken').mockReturnValue(undefined);

      await program.parseAsync(['node', 'quant', 'auth', 'whoami']);

      expect(logSpy).toHaveBeenCalledWith('Not logged in');
    });
  });

  describe('quant auth token', () => {
    it('outputs raw token to stdout for scripting', async () => {
      vi.spyOn(configModule, 'getToken').mockReturnValue('raw-secret-token-12345');

      await program.parseAsync(['node', 'quant', 'auth', 'token']);

      expect(stdoutWriteSpy).toHaveBeenCalledWith('raw-secret-token-12345\n');
    });

    it('sets exit code and displays error when no token found', async () => {
      vi.spyOn(configModule, 'getToken').mockReturnValue(undefined);

      await program.parseAsync(['node', 'quant', 'auth', 'token']);

      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe('quant auth logout', () => {
    it('invokes clearConfig and prints confirmation', async () => {
      const clearSpy = vi.spyOn(configModule, 'clearConfig').mockImplementation(() => {});

      await program.parseAsync(['node', 'quant', 'auth', 'logout']);

      expect(clearSpy).toHaveBeenCalled();
      const allLogs = logSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
      expect(allLogs).toContain('Successfully logged out');
    });
  });

  describe('quant auth status', () => {
    it('displays logged-in details when credentials exist', async () => {
      vi.spyOn(configModule, 'loadConfig').mockReturnValue({
        apiUrl: 'https://quantmail.in',
        token: 'quant-jwt-token-long-secret',
        user: { id: 'usr_789', email: 'alice@quant.in', name: 'Alice Developer' },
        defaultWorkspace: 'team-quantum',
      });
      vi.spyOn(configModule, 'getToken').mockReturnValue('quant-jwt-token-long-secret');
      vi.spyOn(configModule, 'getApiUrl').mockReturnValue('https://quantmail.in');

      await program.parseAsync(['node', 'quant', 'auth', 'status']);

      const allLogs = logSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
      expect(allLogs).toContain('Quant Authentication Status:');
      expect(allLogs).toContain('https://quantmail.in');
      expect(allLogs).toContain('Logged in');
      expect(allLogs).toContain('Alice Developer');
      expect(allLogs).toContain('alice@quant.in');
      expect(allLogs).toContain('team-quantum');
    });

    it('displays not logged in status when token is missing', async () => {
      vi.spyOn(configModule, 'loadConfig').mockReturnValue({
        apiUrl: 'https://quantmail.in',
      });
      vi.spyOn(configModule, 'getToken').mockReturnValue(undefined);
      vi.spyOn(configModule, 'getApiUrl').mockReturnValue('https://quantmail.in');

      await program.parseAsync(['node', 'quant', 'auth', 'status']);

      const allLogs = logSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
      expect(allLogs).toContain('Not logged in');
      expect(allLogs).toContain('quant auth login');
    });
  });

  describe('quant auth login --token', () => {
    it('validates session and saves config on valid token', async () => {
      const saveSpy = vi.spyOn(configModule, 'saveConfig').mockImplementation(() => {});
      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValue({
        user: { id: 'u_100', email: 'tokenuser@quant.in', name: 'Token User' },
      });

      await program.parseAsync(['node', 'quant', 'auth', 'login', '--token', 'my-valid-token-777']);

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'my-valid-token-777',
          user: {
            id: 'u_100',
            email: 'tokenuser@quant.in',
            name: 'Token User',
          },
        }),
      );
      const allLogs = logSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
      expect(allLogs).toContain('Logged in successfully to Quant Ecosystem');
    });
  });
});
