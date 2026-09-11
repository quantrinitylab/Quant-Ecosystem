import type { RepositoryInspectionPort, RepositoryProvisioningPort } from '@quant/server-core';
import { GitInspectService, RepoStorageService } from '../services/git-transport';

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
}

export class GitProvisioningAdapter implements RepositoryProvisioningPort {
  constructor(private readonly storage: RepoStorageService = new RepoStorageService()) {}
  async provision(input: Parameters<RepositoryProvisioningPort['provision']>[0]) {
    const storagePath = await this.storage.initBareRepo(input.owner, input.name);
    return { storagePath };
  }
  destroy(input: Parameters<RepositoryProvisioningPort['destroy']>[0]) {
    return this.storage.deleteRepo(input.owner, input.name);
  }
}
