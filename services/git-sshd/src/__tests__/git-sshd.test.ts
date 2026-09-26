import { describe, it, expect } from 'vitest';
import { createGitSshServer, GitSshServer } from '../index';

describe('git-sshd service', () => {
  it('should create a GitSshServer instance with start and stop functions', () => {
    const server = createGitSshServer({ port: 0 });
    expect(server).toBeInstanceOf(GitSshServer);
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });
});
