import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import { AgentInstaller } from '../../marketplace/installer.js';
import { AgentPublisher } from '../../marketplace/publisher.js';
import { AgentSpec } from '../../marketplace/agent-spec.js';
import { PermissionLevel } from '../../permissions.js';

describe('AgentInstaller', () => {
  const validSpec: AgentSpec = {
    name: 'test-agent',
    version: '1.0.0',
    author: 'author',
    description: 'A test agent for installation testing',
    permissions: [PermissionLevel.OBSERVE],
    capabilities: [
      { name: 'observe', description: 'Observe data', requiredPermission: PermissionLevel.OBSERVE },
    ],
    entrypoint: './test-agent.ts',
  };

  function createPublisherWithAgent(): { publisher: AgentPublisher; agentId: string } {
    const publisher = new AgentPublisher();
    const result = publisher.publish(validSpec);
    return { publisher, agentId: result.agentId! };
  }

  it('installs from marketplace in sandbox mode', () => {
    const { publisher, agentId } = createPublisherWithAgent();
    const installer = new AgentInstaller(publisher);

    const result = installer.install(agentId);
    expect(result.success).toBe(true);
    expect(result.sandboxed).toBe(true);
  });

  it('fails to install non-existent agent', () => {
    const publisher = new AgentPublisher();
    const installer = new AgentInstaller(publisher);

    const result = installer.install('unknown-agent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('prevents double install', () => {
    const { publisher, agentId } = createPublisherWithAgent();
    const installer = new AgentInstaller(publisher);

    installer.install(agentId);
    const result = installer.install(agentId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already installed');
  });

  it('promotes agent from sandbox only after security audit', () => {
    const { publisher, agentId } = createPublisherWithAgent();
    const installer = new AgentInstaller(publisher);

    installer.install(agentId);
    expect(installer.isSandboxed(agentId)).toBe(true);

    // Cannot promote without audit
    expect(installer.promoteFromSandbox(agentId)).toBe(false);

    // Record passing audit
    installer.recordSecurityAudit(agentId, {
      passed: true,
      findings: [],
      reviewedAt: Date.now(),
      reviewedBy: 'security-team',
    });

    const promoted = installer.promoteFromSandbox(agentId);
    expect(promoted).toBe(true);
    expect(installer.isSandboxed(agentId)).toBe(false);
  });

  it('cannot promote non-sandboxed agent', () => {
    const { publisher, agentId } = createPublisherWithAgent();
    const installer = new AgentInstaller(publisher);

    installer.install(agentId);
    installer.recordSecurityAudit(agentId, {
      passed: true,
      findings: [],
      reviewedAt: Date.now(),
      reviewedBy: 'security-team',
    });
    installer.promoteFromSandbox(agentId);
    expect(installer.promoteFromSandbox(agentId)).toBe(false);
  });

  it('uninstalls agent', () => {
    const { publisher, agentId } = createPublisherWithAgent();
    const installer = new AgentInstaller(publisher);

    installer.install(agentId);
    expect(installer.uninstall(agentId)).toBe(true);
    expect(installer.getInstalled()).toHaveLength(0);
  });

  it('gets installed agents', () => {
    const { publisher, agentId } = createPublisherWithAgent();
    const installer = new AgentInstaller(publisher);

    installer.install(agentId);
    const installed = installer.getInstalled();
    expect(installed).toHaveLength(1);
    expect(installed[0]!.sandboxed).toBe(true);
  });

  describe('isolation level', () => {
    it('defaults to vm2 on install', () => {
      const { publisher, agentId } = createPublisherWithAgent();
      const installer = new AgentInstaller(publisher);

      installer.install(agentId);
      const agent = installer.getInstalledById(agentId);
      expect(agent?.isolationLevel).toBe('vm2');
    });

    it('securityAudit defaults to null on install', () => {
      const { publisher, agentId } = createPublisherWithAgent();
      const installer = new AgentInstaller(publisher);

      installer.install(agentId);
      const agent = installer.getInstalledById(agentId);
      expect(agent?.securityAudit).toBeNull();
    });
  });

  describe('verifySignature', () => {
    it('returns true for valid signature', () => {
      const publisher = new AgentPublisher();
      const installer = new AgentInstaller(publisher);

      const spec = { name: 'test', version: '1.0.0' };
      const publicKey = 'test-public-key';
      const signature = createHash('sha256')
        .update(JSON.stringify(spec) + publicKey)
        .digest('hex');

      expect(installer.verifySignature(spec, signature, publicKey)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const publisher = new AgentPublisher();
      const installer = new AgentInstaller(publisher);

      const spec = { name: 'test', version: '1.0.0' };
      expect(installer.verifySignature(spec, 'invalid-sig', 'key')).toBe(false);
    });

    it('returns false for tampered spec', () => {
      const publisher = new AgentPublisher();
      const installer = new AgentInstaller(publisher);

      const spec = { name: 'test', version: '1.0.0' };
      const publicKey = 'test-public-key';
      const signature = createHash('sha256')
        .update(JSON.stringify(spec) + publicKey)
        .digest('hex');

      const tamperedSpec = { name: 'test', version: '2.0.0' };
      expect(installer.verifySignature(tamperedSpec, signature, publicKey)).toBe(false);
    });
  });

  describe('recordSecurityAudit', () => {
    it('records audit for installed agent', () => {
      const { publisher, agentId } = createPublisherWithAgent();
      const installer = new AgentInstaller(publisher);

      installer.install(agentId);
      const audit = {
        passed: true,
        findings: [],
        reviewedAt: Date.now(),
        reviewedBy: 'reviewer',
      };
      expect(installer.recordSecurityAudit(agentId, audit)).toBe(true);

      const agent = installer.getInstalledById(agentId);
      expect(agent?.securityAudit).toEqual(audit);
    });

    it('returns false for non-installed agent', () => {
      const publisher = new AgentPublisher();
      const installer = new AgentInstaller(publisher);

      expect(
        installer.recordSecurityAudit('unknown', {
          passed: true,
          findings: [],
          reviewedAt: Date.now(),
          reviewedBy: 'reviewer',
        }),
      ).toBe(false);
    });
  });

  describe('canPromote', () => {
    it('returns false if no audit', () => {
      const { publisher, agentId } = createPublisherWithAgent();
      const installer = new AgentInstaller(publisher);

      installer.install(agentId);
      expect(installer.canPromote(agentId)).toBe(false);
    });

    it('returns false if audit failed', () => {
      const { publisher, agentId } = createPublisherWithAgent();
      const installer = new AgentInstaller(publisher);

      installer.install(agentId);
      installer.recordSecurityAudit(agentId, {
        passed: false,
        findings: ['XSS vulnerability found'],
        reviewedAt: Date.now(),
        reviewedBy: 'security-team',
      });
      expect(installer.canPromote(agentId)).toBe(false);
    });

    it('returns true if audit passed', () => {
      const { publisher, agentId } = createPublisherWithAgent();
      const installer = new AgentInstaller(publisher);

      installer.install(agentId);
      installer.recordSecurityAudit(agentId, {
        passed: true,
        findings: [],
        reviewedAt: Date.now(),
        reviewedBy: 'security-team',
      });
      expect(installer.canPromote(agentId)).toBe(true);
    });

    it('returns false for non-installed agent', () => {
      const publisher = new AgentPublisher();
      const installer = new AgentInstaller(publisher);
      expect(installer.canPromote('unknown')).toBe(false);
    });
  });

  describe('blockEnvAccess', () => {
    it('returns blocked true and intercepted env keys', () => {
      const result = AgentInstaller.blockEnvAccess();
      expect(result.blocked).toBe(true);
      expect(result.intercepted).toContain('PATH');
      expect(result.intercepted).toContain('HOME');
      expect(result.intercepted).toContain('SECRET_KEY');
    });

    it('intercepts multiple access attempts', () => {
      const result = AgentInstaller.blockEnvAccess();
      expect(result.intercepted.length).toBeGreaterThanOrEqual(3);
    });
  });
});
