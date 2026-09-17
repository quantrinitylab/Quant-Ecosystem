import type {
  RepositoryInspectionPort,
  RepositoryMutationPort,
  RepositoryProvisioningPort,
} from '@quant/server-core';
import {
  GitFileMutationService,
  GitInspectService,
  RepoStorageService,
} from '../services/git-transport';

export class GitInspectAdapter implements RepositoryInspectionPort {
  private readonly inspect: GitInspectService;
  constructor(storage: RepoStorageService = new RepoStorageService()) {
    this.inspect = new GitInspectService(storage);
  }
  listTree(input: Parameters<RepositoryInspectionPort['listTree']>[0]) {
    return this.inspect.getTree(input.owner, input.name, input.ref, input.path);
  }
  readBlob(input: Parameters<RepositoryInspectionPort['readBlob']>[0]) {
    return this.inspect.getBlob(input.owner, input.name, input.ref, input.path);
  }
  listCommits(input: Parameters<RepositoryInspectionPort['listCommits']>[0]) {
    return this.inspect.getCommits(input.owner, input.name, input.ref, {
      limit: input.limit,
      skip: input.skip,
    });
  }
  searchCode(input: { owner: string; name: string; ref: string; query: string; path?: string }) {
    return this.inspect.searchCode(input.owner, input.name, input.ref, input.query, input.path);
  }
}

export class GitProvisioningAdapter implements RepositoryProvisioningPort {
  constructor(private readonly storage: RepoStorageService = new RepoStorageService()) {}
  async provision(input: Parameters<RepositoryProvisioningPort['provision']>[0]) {
    const storagePath = await this.storage.initBareRepo(input.owner, input.name);
    return { storagePath };
  }
  async archive(input: Parameters<RepositoryProvisioningPort['archive']>[0]) {
    const storagePath = await this.storage.archiveRepo(
      input.owner,
      input.name,
      input.tombstoneName,
    );
    return { storagePath };
  }
  destroy(input: Parameters<RepositoryProvisioningPort['destroy']>[0]) {
    return this.storage.deleteRepo(input.owner, input.name);
  }
}

export class GitMutationAdapter implements RepositoryMutationPort {
  constructor(private readonly mutation: RepositoryMutationPort = new GitFileMutationService()) {}

  getBranchHead(input: Parameters<RepositoryMutationPort['getBranchHead']>[0]) {
    return this.mutation.getBranchHead(input);
  }

  commitFile(input: Parameters<RepositoryMutationPort['commitFile']>[0]) {
    return this.mutation.commitFile(input);
  }

  rollbackCommit(input: Parameters<RepositoryMutationPort['rollbackCommit']>[0]) {
    return this.mutation.rollbackCommit(input);
  }
}
