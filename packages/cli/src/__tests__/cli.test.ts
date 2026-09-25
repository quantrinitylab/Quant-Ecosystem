import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Command } from 'commander';
import { createCli } from '../index.js';
import {
  loadConfig,
  saveConfig,
  clearConfig,
  getToken,
  getApiUrl,
  CONFIG_FILE,
  CONFIG_DIR,
} from '../config.js';
import { QuantCliClient, QuantCliApiError } from '../client.js';
import { registerAuthCommands } from '../commands/auth.js';
import { registerRepoCommands } from '../commands/repo.js';
import { registerPrCommands } from '../commands/pr.js';
import { registerMailCommands } from '../commands/mail.js';
import {
  registerDriveCommands,
  formatBytes,
  formatGigabytes,
  renderProgressBar,
  getDriveItemIcon,
} from '../commands/drive.js';
import {
  registerCalendarCommands,
  formatEventDate,
  formatEventTime,
} from '../commands/calendar.js';

// Mock node:fs for ESM compatibility
vi.mock('node:fs');

describe('Quant CLI Master Sentinel Test Suite (cli.test.ts)', () => {
  const originalEnv = { ...process.env };
  let logSpy: any;
  let errorSpy: any;
  let stdoutWriteSpy: any;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.QUANT_TOKEN;
    delete process.env.QUANT_API_URL;

    // Default fs mock behaviors
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined as any);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined as any);

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exitCode = undefined;
  });

  // =========================================================================
  // 1. Entrypoint & Global Options Wire-Up
  // =========================================================================
  describe('Entrypoint (src/index.ts & createCli)', () => {
    it('creates CLI program with name, description, version, and global options', () => {
      const program = createCli();

      expect(program.name()).toBe('quant');
      expect(program.description()).toContain('Quant Ecosystem');
      expect(program.version()).toBe('1.0.0');

      const options = program.options.map((o) => o.long);
      expect(options).toContain('--json');
      expect(options).toContain('--api-url');
    });

    it('registers all 6 command groups in createCli', () => {
      const program = createCli();
      const commandNames = program.commands.map((c) => c.name());

      expect(commandNames).toContain('auth');
      expect(commandNames).toContain('repo');
      expect(commandNames).toContain('pr');
      expect(commandNames).toContain('mail');
      expect(commandNames).toContain('drive');
      expect(commandNames).toContain('calendar');
    });

    it('correctly parses global options --json and --api-url', () => {
      const program = createCli();
      program.exitOverride();
      program.action(() => {});

      program.parse(['node', 'quant', '--json', '--api-url', 'https://staging.quantmail.in']);

      const opts = program.opts();
      expect(opts.json).toBe(true);
      expect(opts.apiUrl).toBe('https://staging.quantmail.in');
    });
  });

  // =========================================================================
  // 2. Configuration Management (config.ts)
  // =========================================================================
  describe('Configuration Management (config.ts)', () => {
    it('resolves correct config directory and file', () => {
      expect(CONFIG_DIR).toBe(path.join(os.homedir(), '.quant'));
      expect(CONFIG_FILE).toBe(path.join(os.homedir(), '.quant', 'config.json'));
    });

    it('loadConfig returns default apiUrl when config file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = loadConfig();
      expect(config.apiUrl).toBe('https://quantmail.in');
      expect(config.token).toBeUndefined();
    });

    it('loadConfig returns environment QUANT_API_URL override', () => {
      process.env.QUANT_API_URL = 'https://custom-api.quantmail.in';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = loadConfig();
      expect(config.apiUrl).toBe('https://custom-api.quantmail.in');
    });

    it('loadConfig parses existing config file successfully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          apiUrl: 'https://custom.quantmail.in',
          token: 'loaded-token-123',
          user: { id: 'u-1', email: 'test@quant.in', name: 'Tester' },
        }),
      );

      const config = loadConfig();
      expect(config.token).toBe('loaded-token-123');
      expect(config.user?.email).toBe('test@quant.in');
    });

    it('saveConfig creates directory if needed and writes JSON file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      saveConfig({ token: 'new-token-456' });

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        CONFIG_DIR,
        expect.objectContaining({ recursive: true }),
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_FILE,
        expect.stringContaining('new-token-456'),
        expect.objectContaining({ mode: 0o600 }),
      );
    });

    it('clearConfig removes config file when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      clearConfig();

      expect(fs.unlinkSync).toHaveBeenCalledWith(CONFIG_FILE);
    });

    it('getToken prioritizes QUANT_TOKEN env variable over config', () => {
      process.env.QUANT_TOKEN = 'env-token-priority';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ token: 'config-token-secondary' }),
      );

      expect(getToken()).toBe('env-token-priority');
    });

    it('getApiUrl prioritizes QUANT_API_URL env variable over config and default', () => {
      process.env.QUANT_API_URL = 'https://env-api.quantmail.in';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(getApiUrl()).toBe('https://env-api.quantmail.in');
    });
  });

  // =========================================================================
  // 3. API Client & Authorization Headers (client.ts)
  // =========================================================================
  describe('API Client (client.ts)', () => {
    it('automatically attaches Authorization Bearer token header', async () => {
      process.env.QUANT_TOKEN = 'mock-bearer-token';
      process.env.QUANT_API_URL = 'https://api.quantmail.in';

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new QuantCliClient();
      const response = await client.get('/api/test');

      expect(response).toEqual({ status: 'ok' });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.quantmail.in/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
        }),
      );

      const headers = fetchMock.mock.calls[0][1].headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer mock-bearer-token');
    });

    it('throws QuantCliApiError on HTTP error status with parsed message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ error: 'Invalid authentication token' }),
        json: async () => ({ error: 'Invalid authentication token' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new QuantCliClient({ apiUrl: 'https://api.quantmail.in' });

      await expect(client.get('/api/protected')).rejects.toThrow(QuantCliApiError);
      try {
        await client.get('/api/protected');
      } catch (err: any) {
        expect(err.status).toBe(401);
        expect(err.message).toContain('Invalid authentication token');
      }
    });

    it('supports POST, PUT, PATCH, DELETE methods', async () => {
      const fetchMock = vi.fn().mockImplementation((_url, init) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ method: init.method, success: true }),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const client = new QuantCliClient({ apiUrl: 'https://api.quantmail.in' });

      const postRes = await client.post('/api/item', { name: 'Item 1' });
      expect(postRes).toEqual({ method: 'POST', success: true });

      const putRes = await client.put('/api/item/1', { name: 'Item 1 Updated' });
      expect(putRes).toEqual({ method: 'PUT', success: true });

      const patchRes = await client.patch('/api/item/1', { active: true });
      expect(patchRes).toEqual({ method: 'PATCH', success: true });

      const deleteRes = await client.delete('/api/item/1');
      expect(deleteRes).toEqual({ method: 'DELETE', success: true });
    });
  });

  // =========================================================================
  // 4. Auth Commands (commands/auth.ts)
  // =========================================================================
  describe('Auth Commands (commands/auth.ts)', () => {
    let authProgram: Command;

    beforeEach(() => {
      authProgram = new Command();
      authProgram.exitOverride();
      registerAuthCommands(authProgram);
    });

    it('registers auth login, logout, status, whoami, token subcommands', () => {
      const authCmd = authProgram.commands.find((c) => c.name() === 'auth');
      expect(authCmd).toBeDefined();

      const subcommands = authCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('login');
      expect(subcommands).toContain('logout');
      expect(subcommands).toContain('status');
      expect(subcommands).toContain('whoami');
      expect(subcommands).toContain('token');
    });

    it('auth whoami prints email when user is authenticated', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          token: 'token-val-777',
          user: { email: 'dev@quantmail.in', name: 'Developer' },
        }),
      );

      await authProgram.parseAsync(['node', 'quant', 'auth', 'whoami']);
      expect(logSpy).toHaveBeenCalledWith('dev@quantmail.in');
    });

    it('auth status prints logged out message when unauthenticated', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await authProgram.parseAsync(['node', 'quant', 'auth', 'status']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    });

    it('auth logout clears stored credentials', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await authProgram.parseAsync(['node', 'quant', 'auth', 'logout']);
      expect(fs.unlinkSync).toHaveBeenCalledWith(CONFIG_FILE);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully logged out'));
    });
  });

  // =========================================================================
  // 5. Repo & PR Commands (commands/repo.ts & commands/pr.ts)
  // =========================================================================
  describe('Repo & PR Commands (commands/repo.ts & commands/pr.ts)', () => {
    let repoProgram: Command;
    let prProgram: Command;

    beforeEach(() => {
      repoProgram = new Command();
      repoProgram.exitOverride();
      registerRepoCommands(repoProgram);

      prProgram = new Command();
      prProgram.exitOverride();
      registerPrCommands(prProgram);
    });

    it('registers repo subcommands and options', () => {
      const repoCmd = repoProgram.commands.find((c) => c.name() === 'repo');
      expect(repoCmd).toBeDefined();

      const subcommands = repoCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('list');
      expect(subcommands).toContain('view');
      expect(subcommands).toContain('create');
      expect(subcommands).toContain('clone');

      const listCmd = repoCmd!.commands.find((c) => c.name() === 'list');
      const listOpts = listCmd!.options.map((o) => o.long);
      expect(listOpts).toContain('--limit');
      expect(listOpts).toContain('--visibility');
      expect(listOpts).toContain('--json');
    });

    it('registers pr subcommands and options', () => {
      const prCmd = prProgram.commands.find((c) => c.name() === 'pr');
      expect(prCmd).toBeDefined();

      const subcommands = prCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('list');
      expect(subcommands).toContain('view');
      expect(subcommands).toContain('create');
      expect(subcommands).toContain('merge');

      const listCmd = prCmd!.commands.find((c) => c.name() === 'list');
      const listOpts = listCmd!.options.map((o) => o.long);
      expect(listOpts).toContain('--state');
      expect(listOpts).toContain('--limit');
      expect(listOpts).toContain('--json');

      const mergeCmd = prCmd!.commands.find((c) => c.name() === 'merge');
      const mergeOpts = mergeCmd!.options.map((o) => o.long);
      expect(mergeOpts).toContain('--squash');
      expect(mergeOpts).toContain('--rebase');
      expect(mergeOpts).toContain('--delete-branch');
    });

    it('repo list parses JSON and limit flags', async () => {
      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce([
        {
          id: 'repo-1',
          name: 'super-engine',
          fullName: 'quant/super-engine',
          owner: { username: 'quant' },
          defaultBranch: 'main',
          isPrivate: false,
          starsCount: 42,
          openPrsCount: 2,
        },
      ]);

      await repoProgram.parseAsync(['node', 'quant', 'repo', 'list', '--json', '--limit', '10']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('super-engine'));
    });
  });

  // =========================================================================
  // 6. Mail Commands (commands/mail.ts)
  // =========================================================================
  describe('Mail Commands (commands/mail.ts)', () => {
    let mailProgram: Command;

    beforeEach(() => {
      mailProgram = new Command();
      mailProgram.exitOverride();
      registerMailCommands(mailProgram);
    });

    it('registers mail inbox, read, send, search, archive, unarchive, and star', () => {
      const mailCmd = mailProgram.commands.find((c) => c.name() === 'mail');
      expect(mailCmd).toBeDefined();

      const subcommands = mailCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('inbox');
      expect(subcommands).toContain('read');
      expect(subcommands).toContain('send');
      expect(subcommands).toContain('search');
      expect(subcommands).toContain('archive');
      expect(subcommands).toContain('star');

      const restoreCmd = mailCmd!.commands.find((c) => c.name() === 'restore');
      expect(restoreCmd?.alias()).toBe('unarchive');
    });

    it('mail inbox lists emails with --json flag', async () => {
      const mockEmails = [
        {
          id: 'em-101',
          fromAddress: 'alice@quant.in',
          fromName: 'Alice',
          subject: 'Weekly Sprint Update',
          isRead: false,
          receivedAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        emails: mockEmails,
      });

      await mailProgram.parseAsync(['node', 'quant', 'mail', 'inbox', '--json']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Weekly Sprint Update'));
    });

    it('mail search executes query filtering with --json flag', async () => {
      const mockSearchResults = [
        {
          id: 'em-202',
          fromAddress: 'security@quant.in',
          subject: 'Audit Report Approved',
          snippet: 'All checks passed',
        },
      ];

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        emails: mockSearchResults,
      });

      await mailProgram.parseAsync([
        'node',
        'quant',
        'mail',
        'search',
        'Audit',
        '--json',
        '--limit',
        '5',
      ]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Audit Report Approved'));
    });
  });

  // =========================================================================
  // 7. Drive Commands (commands/drive.ts)
  // =========================================================================
  describe('Drive Commands & Utilities (commands/drive.ts)', () => {
    let driveProgram: Command;

    beforeEach(() => {
      driveProgram = new Command();
      driveProgram.exitOverride();
      registerDriveCommands(driveProgram);
    });

    it('registers drive ls, upload, download, quota, and duplicates', () => {
      const driveCmd = driveProgram.commands.find((c) => c.name() === 'drive');
      expect(driveCmd).toBeDefined();

      const subcommands = driveCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('ls');
      expect(subcommands).toContain('upload');
      expect(subcommands).toContain('download');
      expect(subcommands).toContain('quota');
      expect(subcommands).toContain('duplicates');
    });

    it('calculates human-readable bytes accurately (formatBytes)', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });

    it('formats gigabytes accurately (formatGigabytes)', () => {
      expect(formatGigabytes(0)).toBe('0.00 GB');
      expect(formatGigabytes(1073741824)).toBe('1.00 GB');
      expect(formatGigabytes(5368709120)).toBe('5.00 GB');
    });

    it('renders storage progress bar with percentage (renderProgressBar)', () => {
      const bar25 = renderProgressBar(250, 1000, 20);
      expect(bar25).toContain('25.0%');

      const bar80 = renderProgressBar(800, 1000, 20);
      expect(bar80).toContain('80.0%');

      const barZero = renderProgressBar(0, 0, 20);
      expect(barZero).toContain('0.0%');
    });

    it('identifies drive item icons appropriately (getDriveItemIcon)', () => {
      expect(getDriveItemIcon(true)).toBe('📁');
      expect(getDriveItemIcon(false, 'application/pdf')).toBe('📕');
      expect(getDriveItemIcon(false, 'image/png')).toBe('🖼️');
      expect(getDriveItemIcon(false, 'video/mp4')).toBe('🎬');
      expect(getDriveItemIcon(false, 'audio/mp3')).toBe('🎵');
      expect(getDriveItemIcon(false, 'application/zip')).toBe('📦');
      expect(getDriveItemIcon(false, 'text/plain')).toBe('📝');
      expect(getDriveItemIcon(false, 'other/binary')).toBe('📄');
    });

    it('drive quota outputs storage information in JSON mode', async () => {
      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
        usedBytes: 1073741824, // 1 GB
        totalBytes: 10737418240, // 10 GB
        fileCount: 42,
        folderCount: 5,
      });

      await driveProgram.parseAsync(['node', 'quant', 'drive', 'quota', '--json']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('1073741824'));
    });

    it('drive duplicates detects and reports duplicate files', async () => {
      vi.spyOn(QuantCliClient.prototype, 'post').mockResolvedValueOnce({
        groups: [
          {
            hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            files: [
              { id: 'f-1', name: 'report.pdf', size: 2048, updatedAt: '2026-09-25T10:00:00Z' },
              { id: 'f-2', name: 'report_copy.pdf', size: 2048, updatedAt: '2026-09-25T11:00:00Z' },
            ],
          },
        ],
      });

      await driveProgram.parseAsync(['node', 'quant', 'drive', 'duplicates', '--json']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('report_copy.pdf'));
    });
  });

  // =========================================================================
  // 8. Calendar Commands (commands/calendar.ts)
  // =========================================================================
  describe('Calendar Commands & Utilities (commands/calendar.ts)', () => {
    let calProgram: Command;

    beforeEach(() => {
      calProgram = new Command();
      calProgram.exitOverride();
      registerCalendarCommands(calProgram);
    });

    it('registers calendar agenda and book subcommands', () => {
      const calCmd = calProgram.commands.find((c) => c.name() === 'calendar');
      expect(calCmd).toBeDefined();

      const subcommands = calCmd!.commands.map((c) => c.name());
      expect(subcommands).toContain('agenda');
      expect(subcommands).toContain('book');
    });

    it('formats event dates and times consistently', () => {
      const date = new Date('2026-09-25T14:30:00Z');
      const formattedDate = formatEventDate(date);
      const formattedTime = formatEventTime(date);

      expect(formattedDate).toBeTruthy();
      expect(formattedDate).toContain('2026');
      expect(formattedTime).toBeTruthy();
    });

    it('calendar agenda handles JSON output flag for scheduled events', async () => {
      const futureStart = new Date(Date.now() + 3600 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 7200 * 1000).toISOString();
      const mockEvents = [
        {
          id: 'ev-1',
          title: 'Sprint Planning',
          startTime: futureStart,
          endTime: futureEnd,
          location: 'Virtual',
        },
      ];

      vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce(mockEvents);

      await calProgram.parseAsync([
        'node',
        'quant',
        'calendar',
        'agenda',
        '--json',
        '--days',
        '7',
        '--all',
      ]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Sprint Planning'));
    });
  });
});
