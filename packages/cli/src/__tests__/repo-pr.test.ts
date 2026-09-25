import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { parseRepoString, stripAnsi, formatRelativeTime, renderTable } from '../git-utils.js';
import { registerRepoCommands } from '../commands/repo.js';
import { registerPrCommands } from '../commands/pr.js';
import { QuantCliClient } from '../client.js';

describe('git-utils', () => {
  describe('parseRepoString', () => {
    it('correctly parses SSH URLs', () => {
      const parsed = parseRepoString('git@quantmail.in:alice/test-repo.git');
      expect(parsed).toEqual({
        owner: 'alice',
        name: 'test-repo',
        fullName: 'alice/test-repo',
        url: 'git@quantmail.in:alice/test-repo.git',
      });
    });

    it('correctly parses HTTP git URLs', () => {
      const parsed = parseRepoString('https://quantmail.in/git/bob/project-alpha.git');
      expect(parsed).toEqual({
        owner: 'bob',
        name: 'project-alpha',
        fullName: 'bob/project-alpha',
        url: 'https://quantmail.in/git/bob/project-alpha.git',
      });
    });

    it('correctly parses Web UI URLs', () => {
      const parsed = parseRepoString('https://quantmail.in/quantgit/charlie/quant-flow');
      expect(parsed).toEqual({
        owner: 'charlie',
        name: 'quant-flow',
        fullName: 'charlie/quant-flow',
        url: 'https://quantmail.in/quantgit/charlie/quant-flow',
      });
    });

    it('correctly parses owner/repo shorthand', () => {
      const parsed = parseRepoString('quantrinity/kernel');
      expect(parsed).toEqual({
        owner: 'quantrinity',
        name: 'kernel',
        fullName: 'quantrinity/kernel',
      });
    });

    it('handles bare repo name with fallback owner', () => {
      const parsed = parseRepoString('my-cool-app', 'developer-1');
      expect(parsed).toEqual({
        owner: 'developer-1',
        name: 'my-cool-app',
        fullName: 'developer-1/my-cool-app',
      });
    });
  });

  describe('stripAnsi', () => {
    it('strips color escape codes cleanly', () => {
      const colored = '\u001b[32mHello\u001b[39m \u001b[1mWorld\u001b[22m';
      expect(stripAnsi(colored)).toBe('Hello World');
    });
  });

  describe('formatRelativeTime', () => {
    it('formats recent times', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 10 * 1000)).toBe('just now');
      expect(formatRelativeTime(now - 5 * 60 * 1000)).toBe('5m ago');
      expect(formatRelativeTime(now - 3 * 3600 * 1000)).toBe('3h ago');
      expect(formatRelativeTime(now - 4 * 24 * 3600 * 1000)).toBe('4d ago');
    });
  });

  describe('renderTable', () => {
    it('renders a formatted table with headers and aligned columns', () => {
      const headers = ['NAME', 'VISIBILITY', 'STARS'];
      const rows = [
        ['quant-core', 'public', '★ 120'],
        ['secret-app', 'private', '★ 5'],
      ];
      const table = renderTable(headers, rows);
      expect(table).toContain('NAME');
      expect(table).toContain('VISIBILITY');
      expect(table).toContain('STARS');
      expect(table).toContain('quant-core');
      expect(table).toContain('secret-app');
    });
  });
});

describe('quant repo commands', () => {
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers repo command and all required subcommands', () => {
    const program = new Command();
    registerRepoCommands(program);

    const repoCmd = program.commands.find((c) => c.name() === 'repo');
    expect(repoCmd).toBeDefined();

    const subcommands = repoCmd?.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('clone');
    expect(subcommands).toContain('view');
    expect(subcommands).toContain('create');
  });

  it('quant repo list executes and outputs JSON format when --json is passed', async () => {
    const mockRepos = [
      {
        id: 'repo-1',
        name: 'quantmail-core',
        fullName: 'alice/quantmail-core',
        description: 'Core email client',
        visibility: 'PUBLIC',
        stars: 342,
        updatedAt: '2026-09-24T12:00:00.000Z',
      },
    ];

    vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
      success: true,
      data: mockRepos,
    });

    const program = new Command();
    registerRepoCommands(program);

    await program.parseAsync(['node', 'quant', 'repo', 'list', '--json']);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
    expect(output).toContain('quantmail-core');
    expect(output).toContain('alice/quantmail-core');
  });

  it('quant repo create submits POST /api/repos with public/private flags', async () => {
    const postSpy = vi.spyOn(QuantCliClient.prototype, 'post').mockResolvedValueOnce({
      success: true,
      data: {
        id: 'repo-new',
        name: 'super-tool',
        fullName: 'alice/super-tool',
        visibility: 'public',
        cloneUrl: 'https://quantmail.in/git/alice/super-tool.git',
      },
    });

    const program = new Command();
    registerRepoCommands(program);

    await program.parseAsync([
      'node',
      'quant',
      'repo',
      'create',
      'super-tool',
      '--public',
      '-d',
      'Awesome public tool',
    ]);

    expect(postSpy).toHaveBeenCalledWith(
      '/api/repos',
      expect.objectContaining({
        name: 'super-tool',
        description: 'Awesome public tool',
        visibility: 'public',
      }),
    );
  });

  it('quant repo view retrieves repo metadata and displays README preview', async () => {
    vi.spyOn(QuantCliClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/file')) {
        return {
          success: true,
          data: {
            content: '# Quant Super Tool\n\nThis is a premier ecosystem tool.',
          },
        };
      }
      return {
        success: true,
        data: {
          id: 'repo-view',
          name: 'super-tool',
          fullName: 'alice/super-tool',
          description: 'A stellar repository',
          visibility: 'public',
          defaultBranch: 'main',
          stars: 105,
          forks: 12,
        },
      };
    });

    const program = new Command();
    registerRepoCommands(program);

    await program.parseAsync(['node', 'quant', 'repo', 'view', 'alice/super-tool', '--json']);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
    expect(output).toContain('super-tool');
    expect(output).toContain('Quant Super Tool');
  });
});

describe('quant pr commands', () => {
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers pr command and all required subcommands', () => {
    const program = new Command();
    registerPrCommands(program);

    const prCmd = program.commands.find((c) => c.name() === 'pr');
    expect(prCmd).toBeDefined();

    const subcommands = prCmd?.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('create');
    expect(subcommands).toContain('view');
    expect(subcommands).toContain('merge');
  });

  it('quant pr list displays pull requests with number, title, author, and state', async () => {
    const mockPulls = [
      {
        id: 42,
        number: 42,
        title: 'Implement 3-way merge engine in CodeHub',
        author: 'bob',
        state: 'open',
        sourceBranch: 'feat/merge',
        targetBranch: 'main',
        createdAt: '2026-09-25T10:00:00.000Z',
      },
      {
        id: 41,
        number: 41,
        title: 'Add Undo-Send countdown bar',
        author: 'alice',
        state: 'merged',
        sourceBranch: 'feat/undo-send',
        targetBranch: 'main',
        createdAt: '2026-09-24T10:00:00.000Z',
      },
    ];

    vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
      success: true,
      data: mockPulls,
    });

    const program = new Command();
    registerPrCommands(program);

    await program.parseAsync(['node', 'quant', 'pr', 'list', 'alice/quantmail-core', '--json']);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
    expect(output).toContain('Implement 3-way merge engine in CodeHub');
    expect(output).toContain('Add Undo-Send countdown bar');
  });

  it('quant pr create calls POST /api/repos/:owner/:repo/pulls with head and base', async () => {
    const postSpy = vi.spyOn(QuantCliClient.prototype, 'post').mockResolvedValueOnce({
      success: true,
      data: {
        id: 77,
        number: 77,
        title: 'Feature: Fast Terminal CLI',
        body: 'Implements gh CLI parity for repos and pull requests',
        state: 'open',
        sourceBranch: 'feature/cli-parity',
        targetBranch: 'main',
      },
    });

    const program = new Command();
    registerPrCommands(program);

    await program.parseAsync([
      'node',
      'quant',
      'pr',
      'create',
      '-R',
      'quantrinity/quant-ecosystem',
      '-t',
      'Feature: Fast Terminal CLI',
      '-b',
      'Implements gh CLI parity for repos and pull requests',
      '-H',
      'feature/cli-parity',
      '-B',
      'main',
    ]);

    expect(postSpy).toHaveBeenCalledWith(
      '/api/repos/quantrinity%2Fquant-ecosystem/pulls',
      expect.objectContaining({
        title: 'Feature: Fast Terminal CLI',
        body: 'Implements gh CLI parity for repos and pull requests',
        sourceBranch: 'feature/cli-parity',
        targetBranch: 'main',
      }),
    );
  });

  it('quant pr view shows PR details, diff stats (+142 -23), reviewers, and checks', async () => {
    vi.spyOn(QuantCliClient.prototype, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/reviews')) {
        return {
          success: true,
          data: [
            {
              id: 'rev-1',
              status: 'APPROVED',
              author: { username: 'charlie', displayName: 'Charlie Senior' },
            },
          ],
        };
      }
      return {
        success: true,
        data: {
          id: 15,
          number: 15,
          title: 'Add diff stat counter to pull requests',
          body: 'This PR adds real git numstat calculations.',
          state: 'open',
          author: 'alice',
          sourceBranch: 'feature/diff-stats',
          targetBranch: 'main',
          additions: 142,
          deletions: 23,
          changedFiles: 4,
          checksStatus: 'passed',
        },
      };
    });

    const program = new Command();
    registerPrCommands(program);

    await program.parseAsync(['node', 'quant', 'pr', 'view', '15', '-R', 'alice/core-repo']);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
    expect(output).toContain('PR #15: Add diff stat counter to pull requests');
    expect(output).toContain('+142');
    expect(output).toContain('-23');
    expect(output).toContain('Charlie Senior (Approved)');
    expect(output).toContain('All checks passed');
  });

  it('quant pr merge calls POST /api/repos/:owner/:repo/pulls/:number/merge to execute 3-way merge', async () => {
    vi.spyOn(QuantCliClient.prototype, 'get').mockResolvedValueOnce({
      success: true,
      data: {
        id: 15,
        number: 15,
        title: 'Add diff stat counter to pull requests',
        state: 'open',
        targetBranch: 'main',
        sourceBranch: 'feature/diff-stats',
      },
    });

    const postSpy = vi.spyOn(QuantCliClient.prototype, 'post').mockResolvedValueOnce({
      success: true,
      data: {
        status: 'MERGED',
        mergeCommitSha: '3333333333333333333333333333333333333333',
      },
    });

    const program = new Command();
    registerPrCommands(program);

    await program.parseAsync([
      'node',
      'quant',
      'pr',
      'merge',
      '15',
      '-R',
      'alice/core-repo',
      '--yes',
    ]);

    expect(postSpy).toHaveBeenCalledWith(
      '/api/repos/alice%2Fcore-repo/pulls/15/merge',
      expect.objectContaining({
        method: 'merge',
      }),
    );
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c: any) => c.join(' ')).join('\n');
    expect(output).toContain('Pull request #15 merged into main');
    expect(output).toContain('3333333333333333333333333333333333333333');
  });
});
