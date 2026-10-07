import { PRInfo, PRState } from '../types.js';

export interface IRepoClient {
  clone(url: string): Promise<void>;
  createBranch(name: string): Promise<void>;
  commit(message: string, files: string[]): Promise<string>;
  push(branch: string): Promise<void>;
  diff(base: string, head: string): Promise<string>;
  log(count: number): Promise<string[]>;
  createPR(title: string, body: string, branch: string, baseBranch: string): Promise<PRInfo>;
  updatePR(id: string, updates: Partial<Pick<PRInfo, 'title' | 'body'>>): Promise<PRInfo>;
  commentOnPR(id: string, comment: string): Promise<void>;
  mergePR(id: string): Promise<void>;
  listReviews(id: string): Promise<string[]>;
}

export class MockRepoClient implements IRepoClient {
  branches: string[] = ['main'];
  commits: { hash: string; message: string; files: string[] }[] = [];
  prs: PRInfo[] = [];
  comments: { prId: string; comment: string }[] = [];
  cloned = false;

  async clone(_url: string) {
    this.cloned = true;
  }
  async createBranch(name: string) {
    this.branches.push(name);
  }
  async commit(message: string, files: string[]) {
    const hash = Math.random().toString(36).slice(2, 10);
    this.commits.push({ hash, message, files });
    return hash;
  }
  async push(_branch: string) {}
  async diff(_base: string, _head: string) {
    return 'mock diff output';
  }
  async log(count: number) {
    return this.commits.slice(-count).map((c) => c.message);
  }
  async createPR(title: string, body: string, branch: string, baseBranch: string): Promise<PRInfo> {
    const pr: PRInfo = {
      id: `pr-${this.prs.length + 1}`,
      number: this.prs.length + 1,
      title,
      body,
      state: PRState.open,
      branch,
      baseBranch,
      url: `https://example.com/pr/${this.prs.length + 1}`,
    };
    this.prs.push(pr);
    return pr;
  }
  async updatePR(id: string, updates: Partial<Pick<PRInfo, 'title' | 'body'>>) {
    const pr = this.prs.find((p) => p.id === id);
    if (!pr) throw new Error(`PR ${id} not found`);
    Object.assign(pr, updates);
    return pr;
  }
  async commentOnPR(id: string, comment: string) {
    this.comments.push({ prId: id, comment });
  }
  async mergePR(id: string) {
    const pr = this.prs.find((p) => p.id === id);
    if (!pr) throw new Error(`PR ${id} not found`);
    pr.state = PRState.merged;
  }
  async listReviews(_id: string) {
    return ['lgtm'];
  }
}
