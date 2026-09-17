export interface RepositoryTreeEntry {
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size: number;
  path: string;
  name: string;
}

export interface RepositoryBlobContent {
  path: string;
  content: string;
  size: number;
  sha: string;
}

export interface RepositoryCommitSummary {
  sha: string;
  parents: string[];
  author: {
    name: string;
    email: string;
  };
  timestamp: number;
  message: string;
}

/**
 * Raised when a compare-and-swap branch update discovers that the ref has
 * changed since the caller read it.
 */
export class RepositoryHeadConflictError extends Error {
  readonly code = 'STALE_PARENT_SHA';

  constructor(readonly currentHeadSha: string | null) {
    super('The branch head changed before the commit could be applied');
    this.name = 'RepositoryHeadConflictError';
  }
}

export interface RepositoryInspectionPort {
  listTree(input: {
    owner: string;
    name: string;
    ref: string;
    path?: string;
  }): Promise<RepositoryTreeEntry[]>;

  readBlob(input: {
    owner: string;
    name: string;
    ref: string;
    path: string;
  }): Promise<RepositoryBlobContent>;

  listCommits(input: {
    owner: string;
    name: string;
    ref: string;
    limit?: number;
    skip?: number;
  }): Promise<RepositoryCommitSummary[]>;

  searchCode?(input: {
    owner: string;
    name: string;
    ref: string;
    query: string;
    path?: string;
  }): Promise<Array<{ path: string; lineNumber: number; lineContent: string }>>;
}

export interface RepositoryProvisioningPort {
  provision(input: { owner: string; name: string }): Promise<{
    storagePath: string;
  }>;

  archive(input: { owner: string; name: string; tombstoneName: string }): Promise<{
    storagePath: string | null;
  }>;

  destroy(input: { owner: string; name: string }): Promise<void>;
}

export interface RepositoryMutationPort {
  /**
   * Returns the authoritative Git ref SHA.
   *
   * Null means the branch is unborn and does not yet have its first commit.
   */
  getBranchHead(input: { owner: string; name: string; branch: string }): Promise<string | null>;

  /**
   * Writes a blob, constructs a tree and commit, and advances the branch with
   * compare-and-swap protection.
   */
  commitFile(input: {
    owner: string;
    name: string;
    branch: string;
    path: string;
    content: string;
    message: string;
    expectedHeadSha: string | null;
    author: {
      name: string;
      email: string;
    };
  }): Promise<{
    commitSha: string;
    blobSha: string;
    previousHeadSha: string | null;
    path: string;
    branch: string;
  }>;

  /**
   * Compensating operation used if the Git ref advances but the subsequent
   * database transaction fails.
   */
  rollbackCommit(input: {
    owner: string;
    name: string;
    branch: string;
    expectedCurrentSha: string;
    restoreHeadSha: string | null;
  }): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    repositoryInspection?: RepositoryInspectionPort;
    repositoryProvisioning?: RepositoryProvisioningPort;
    repositoryMutation?: RepositoryMutationPort;
  }
}
