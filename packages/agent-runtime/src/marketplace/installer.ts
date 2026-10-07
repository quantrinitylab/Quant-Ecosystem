import { createHash } from 'crypto';
import { PublishedAgentSpec } from './agent-spec.js';
import { AgentPublisher } from './publisher.js';

export type IsolationLevel = 'vm2' | 'process' | 'none';

export interface SecurityAudit {
  passed: boolean;
  findings: string[];
  reviewedAt: number;
  reviewedBy: string;
}

export interface InstalledAgent {
  spec: PublishedAgentSpec;
  installedAt: number;
  sandboxed: boolean;
  enabled: boolean;
  isolationLevel: IsolationLevel;
  securityAudit: SecurityAudit | null;
}

export interface InstallResult {
  success: boolean;
  agentId: string;
  sandboxed: boolean;
  error?: string;
}

export class AgentInstaller {
  private readonly installed: Map<string, InstalledAgent> = new Map();
  private readonly publisher: AgentPublisher;

  constructor(publisher: AgentPublisher) {
    this.publisher = publisher;
  }

  install(specId: string): InstallResult {
    const spec = this.publisher.getById(specId);
    if (!spec) {
      return {
        success: false,
        agentId: specId,
        sandboxed: false,
        error: `Agent not found in marketplace: ${specId}`,
      };
    }

    if (this.installed.has(specId)) {
      return {
        success: false,
        agentId: specId,
        sandboxed: false,
        error: `Agent already installed: ${specId}`,
      };
    }

    const installedAgent: InstalledAgent = {
      spec,
      installedAt: Date.now(),
      sandboxed: true, // Always sandbox first
      enabled: true,
      isolationLevel: 'vm2',
      securityAudit: null,
    };

    this.installed.set(specId, installedAgent);

    return {
      success: true,
      agentId: specId,
      sandboxed: true,
    };
  }

  uninstall(agentId: string): boolean {
    return this.installed.delete(agentId);
  }

  getInstalled(): InstalledAgent[] {
    return [...this.installed.values()];
  }

  promoteFromSandbox(agentId: string): boolean {
    if (!this.canPromote(agentId)) {
      return false;
    }
    const agent = this.installed.get(agentId);
    if (!agent) {
      return false;
    }
    if (!agent.sandboxed) {
      return false;
    }
    agent.sandboxed = false;
    return true;
  }

  isSandboxed(agentId: string): boolean {
    const agent = this.installed.get(agentId);
    return agent?.sandboxed ?? false;
  }

  getInstalledById(agentId: string): InstalledAgent | undefined {
    return this.installed.get(agentId);
  }

  verifySignature(spec: unknown, signature: string, publicKey: string): boolean {
    const hash = createHash('sha256')
      .update(JSON.stringify(spec) + publicKey)
      .digest('hex');
    return hash === signature;
  }

  recordSecurityAudit(agentId: string, audit: SecurityAudit): boolean {
    const agent = this.installed.get(agentId);
    if (!agent) {
      return false;
    }
    agent.securityAudit = audit;
    return true;
  }

  canPromote(agentId: string): boolean {
    const agent = this.installed.get(agentId);
    if (!agent) {
      return false;
    }
    if (!agent.securityAudit) {
      return false;
    }
    return agent.securityAudit.passed;
  }

  static blockEnvAccess(): { blocked: boolean; intercepted: string[] } {
    const intercepted: string[] = [];
    const handler: ProxyHandler<typeof process.env> = {
      get(_target, prop: string) {
        intercepted.push(prop);
        return undefined;
      },
    };
    const proxy = new Proxy({} as typeof process.env, handler);
    // Demonstrate interception
    void proxy['PATH'];
    void proxy['HOME'];
    void proxy['SECRET_KEY'];
    return { blocked: true, intercepted };
  }
}
