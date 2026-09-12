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
  author: { name: string; email: string };
  timestamp: number;
  message: string;
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
}

export interface RepositoryProvisioningPort {
  provision(input: { owner: string; name: string }): Promise<{ storagePath: string }>;
  archive(input: {
    owner: string;
    name: string;
    tombstoneName: string;
  }): Promise<{ storagePath: string | null }>;
  destroy(input: { owner: string; name: string }): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    repositoryInspection?: RepositoryInspectionPort;
    repositoryProvisioning?: RepositoryProvisioningPort;
  }
}
