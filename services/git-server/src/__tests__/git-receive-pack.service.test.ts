import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitReceivePackService } from '../services/git-receive-pack.js';
import { GitHooksService } from '../services/hooks.js';

vi.mock('node:child_process', () => {
  const mockStdout = {
    on: vi.fn(),
  };
  const mockStderr = {
    on: vi.fn(),
  };
  const mockStdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  const mockProc = {
    stdout: mockStdout,
    stderr: mockStderr,
    stdin: mockStdin,
    on: vi.fn(),
  };

  return {
    execFile: vi.fn(
      (
        _cmd: string,
        _args: string[],
        cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, { stdout: 'mock-receive-refs\n', stderr: '' });
      },
    ),
    spawn: vi.fn(() => mockProc),
  };
});

import { spawn } from 'node:child_process';

describe('GitReceivePackService', () => {
  let service: GitReceivePackService;
  let hooksService: GitHooksService;

  beforeEach(() => {
    vi.clearAllMocks();
    hooksService = new GitHooksService();
    service = new GitReceivePackService(hooksService);
  });

  describe('advertiseRefs', () => {
    it('calls git receive-pack with advertise-refs flag', async () => {
      const result = await service.advertiseRefs('/repos/alice/project.git');
      expect(result).toBe('mock-receive-refs\n');
    });
  });

  describe('execute', () => {
    it('spawns git receive-pack and pipes input/output', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProc = mockSpawn.mock.results[0]?.value ?? mockSpawn('/any', []);

      vi.mocked(mockProc.stdout.on).mockImplementation(
        (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('receive-result'));
          }
          return mockProc.stdout;
        },
      );

      vi.mocked(mockProc.on).mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          cb(0);
        }
        return mockProc;
      });

      const input = Buffer.from('push-data');
      const result = await service.execute('/repos/alice/project.git', input);

      expect(result).toEqual(Buffer.from('receive-result'));
      expect(mockProc.stdin.write).toHaveBeenCalledWith(input);
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });

    it('rejects when git process exits with non-zero code', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProc = mockSpawn('/any', []);

      vi.mocked(mockProc.stdout.on).mockImplementation(() => mockProc.stdout);
      vi.mocked(mockProc.stderr.on).mockImplementation(() => mockProc.stderr);
      vi.mocked(mockProc.on).mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          cb(1);
        }
        return mockProc;
      });

      const input = Buffer.from('push-data');
      await expect(service.execute('/repos/alice/project.git', input)).rejects.toThrow(
        'git receive-pack exited with code 1',
      );
    });
  });

  describe('getHooksService', () => {
    it('returns the hooks service instance', () => {
      expect(service.getHooksService()).toBe(hooksService);
    });
  });
});
