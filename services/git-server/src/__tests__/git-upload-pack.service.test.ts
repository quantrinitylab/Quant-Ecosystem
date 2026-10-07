import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitUploadPackService } from '../services/git-upload-pack.js';

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
        cb(null, { stdout: 'mock-refs-output\n', stderr: '' });
      },
    ),
    spawn: vi.fn(() => mockProc),
  };
});

import { spawn } from 'node:child_process';

describe('GitUploadPackService', () => {
  let service: GitUploadPackService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitUploadPackService();
  });

  describe('advertiseRefs', () => {
    it('calls git upload-pack with advertise-refs flag', async () => {
      const result = await service.advertiseRefs('/repos/alice/project.git');
      expect(result).toBe('mock-refs-output\n');
    });
  });

  describe('execute', () => {
    it('spawns git upload-pack and pipes input/output', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProc = mockSpawn.mock.results[0]?.value ?? mockSpawn('/any', [], {});

      // Set up the mock to simulate successful execution
      vi.mocked(mockProc.stdout.on).mockImplementation(
        (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from('pack-data-output'));
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

      const input = Buffer.from('want abc123\n');
      const result = await service.execute('/repos/alice/project.git', input);

      expect(result).toEqual(Buffer.from('pack-data-output'));
      expect(mockProc.stdin.write).toHaveBeenCalledWith(input);
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });

    it('rejects when git process exits with non-zero code', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProc = mockSpawn('/any', [], {});

      vi.mocked(mockProc.stdout!.on).mockImplementation(() => mockProc.stdout!);
      vi.mocked(mockProc.stderr!.on).mockImplementation(() => mockProc.stderr!);
      vi.mocked(mockProc.on).mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          cb(128);
        }
        return mockProc;
      });

      const input = Buffer.from('want abc123\n');
      await expect(service.execute('/repos/alice/project.git', input)).rejects.toThrow(
        'git upload-pack exited with code 128',
      );
    });
  });
});
