import { MockRepoClient } from '../repo/repo-client.js';
import { PRState } from '../types.js';

describe('MockRepoClient', () => {
  let client: MockRepoClient;
  beforeEach(() => {
    client = new MockRepoClient();
  });

  it('clones a repository', async () => {
    await client.clone('https://github.com/test/repo');
    expect(client.cloned).toBe(true);
  });

  it('creates branches', async () => {
    await client.createBranch('feature-x');
    expect(client.branches).toContain('feature-x');
  });

  it('commits files and returns hash', async () => {
    const hash = await client.commit('initial', ['file.ts']);
    expect(hash).toHaveLength(8);
    expect(client.commits[0]?.files).toEqual(['file.ts']);
  });

  it('pushes without error', async () => {
    await expect(client.push('main')).resolves.toBeUndefined();
  });

  it('creates and merges a PR', async () => {
    const pr = await client.createPR('feat', 'body', 'dev', 'main');
    expect(pr.state).toBe(PRState.open);
    expect(pr.number).toBe(1);
    await client.mergePR(pr.id);
    expect(client.prs[0]?.state).toBe(PRState.merged);
  });

  it('logs recent commits', async () => {
    await client.commit('a', []);
    await client.commit('b', []);
    const msgs = await client.log(1);
    expect(msgs).toEqual(['b']);
  });
});
