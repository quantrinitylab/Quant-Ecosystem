import type { SCIMConfig } from '../types.js';

export interface SCIMConfigInput {
  endpoint: string;
  token: string;
  syncEnabled?: boolean;
}

export interface SCIMUserData {
  externalId: string;
  email: string;
  displayName: string;
  active: boolean;
}

export class SCIMService {
  private configs = new Map<string, SCIMConfig>();
  private users = new Map<string, SCIMUserData[]>();

  async configure(orgId: string, config: SCIMConfigInput): Promise<SCIMConfig> {
    const scimConfig: SCIMConfig = {
      id: crypto.randomUUID(),
      orgId,
      endpoint: config.endpoint,
      token: config.token,
      syncEnabled: config.syncEnabled ?? true,
      lastSync: null,
    };
    this.configs.set(orgId, scimConfig);
    this.users.set(orgId, []);
    return scimConfig;
  }

  async syncUsers(orgId: string): Promise<{ synced: number; errors: number }> {
    const config = this.configs.get(orgId);
    if (!config) return { synced: 0, errors: 0 };
    config.lastSync = Date.now();
    this.configs.set(orgId, config);
    const userList = this.users.get(orgId) ?? [];
    return { synced: userList.length, errors: 0 };
  }

  async provisionUser(orgId: string, userData: SCIMUserData): Promise<SCIMUserData | undefined> {
    const config = this.configs.get(orgId);
    if (!config) return undefined;
    const userList = this.users.get(orgId) ?? [];
    userList.push(userData);
    this.users.set(orgId, userList);
    return userData;
  }

  async deprovisionUser(orgId: string, userId: string): Promise<boolean> {
    const userList = this.users.get(orgId) ?? [];
    const filtered = userList.filter((u) => u.externalId !== userId);
    if (filtered.length === userList.length) return false;
    this.users.set(orgId, filtered);
    return true;
  }

  async updateUser(
    orgId: string,
    userId: string,
    attrs: Partial<SCIMUserData>,
  ): Promise<SCIMUserData | undefined> {
    const userList = this.users.get(orgId) ?? [];
    const user = userList.find((u) => u.externalId === userId);
    if (!user) return undefined;
    Object.assign(user, attrs);
    return user;
  }

  async getSyncStatus(
    orgId: string,
  ): Promise<{ configured: boolean; lastSync: number | null; syncEnabled: boolean }> {
    const config = this.configs.get(orgId);
    if (!config) return { configured: false, lastSync: null, syncEnabled: false };
    return { configured: true, lastSync: config.lastSync, syncEnabled: config.syncEnabled };
  }
}
