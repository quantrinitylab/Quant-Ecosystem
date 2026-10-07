export interface AgentVersion {
  version: string;
  changelog: string;
  releasedAt: Date;
  breaking: boolean;
}

export interface VersionedAgent {
  id: string;
  currentVersion: string;
  versions: AgentVersion[];
}

export class AgentVersioning {
  private versions: Map<string, VersionedAgent> = new Map();

  registerAgent(id: string, initialVersion: string = '1.0.0') {
    this.versions.set(id, {
      id,
      currentVersion: initialVersion,
      versions: [
        {
          version: initialVersion,
          changelog: 'Initial release',
          releasedAt: new Date(),
          breaking: false,
        },
      ],
    });
  }

  updateAgent(id: string, newVersion: string, changelog: string, breaking: boolean = false) {
    const agent = this.versions.get(id);
    if (!agent) {
      this.registerAgent(id, newVersion);
      return;
    }

    agent.versions.push({
      version: newVersion,
      changelog,
      releasedAt: new Date(),
      breaking,
    });

    agent.currentVersion = newVersion;
  }

  getAgentVersions(id: string): VersionedAgent | undefined {
    return this.versions.get(id);
  }

  getLatestVersion(id: string): string | undefined {
    return this.versions.get(id)?.currentVersion;
  }
}

export const versioning = new AgentVersioning();
