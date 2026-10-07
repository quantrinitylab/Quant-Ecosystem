import { describe, it, expect, beforeEach } from 'vitest';
import { AdminConsoleService } from '../admin/admin-console.js';

describe('AdminConsoleService', () => {
  let service: AdminConsoleService;

  beforeEach(() => {
    service = new AdminConsoleService();
  });

  it('creates a policy', async () => {
    const policy = await service.createPolicy('org-1', {
      name: 'Data Access',
      rules: ['no-external-sharing', 'require-mfa'],
      scope: 'all',
      enforcement: 'strict',
    });
    expect(policy.name).toBe('Data Access');
    expect(policy.orgId).toBe('org-1');
    expect(policy.rules).toHaveLength(2);
  });

  it('gets policies for org', async () => {
    await service.createPolicy('org-1', {
      name: 'Policy A',
      rules: ['rule-1'],
      scope: 'all',
      enforcement: 'warn',
    });
    await service.createPolicy('org-1', {
      name: 'Policy B',
      rules: ['rule-2'],
      scope: 'team',
      enforcement: 'log',
    });
    const policies = await service.getPolicies('org-1');
    expect(policies).toHaveLength(2);
  });

  it('returns empty for org with no policies', async () => {
    const policies = await service.getPolicies('no-org');
    expect(policies).toHaveLength(0);
  });

  it('updates a policy', async () => {
    const policy = await service.createPolicy('org-1', {
      name: 'Old Policy',
      rules: ['old-rule'],
      scope: 'all',
      enforcement: 'warn',
    });
    const updated = await service.updatePolicy(policy.id, { name: 'New Policy' });
    expect(updated?.name).toBe('New Policy');
  });

  it('gets audit log', async () => {
    await service.addAuditEntry('org-1', {
      actorId: 'user-1',
      action: 'login',
      resource: 'session',
      metadata: {},
    });
    await service.addAuditEntry('org-1', {
      actorId: 'user-2',
      action: 'file-upload',
      resource: 'document',
      metadata: { size: 1024 },
    });
    const log = await service.getAuditLog('org-1');
    expect(log).toHaveLength(2);
  });

  it('filters audit log by actor', async () => {
    await service.addAuditEntry('org-1', {
      actorId: 'user-1',
      action: 'login',
      resource: 'session',
      metadata: {},
    });
    await service.addAuditEntry('org-1', {
      actorId: 'user-2',
      action: 'logout',
      resource: 'session',
      metadata: {},
    });
    const filtered = await service.getAuditLog('org-1', { actorId: 'user-1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.actorId).toBe('user-1');
  });

  it('gets usage stats', async () => {
    await service.addAuditEntry('org-1', {
      actorId: 'user-1',
      action: 'login',
      resource: 'session',
      metadata: {},
    });
    const stats = await service.getUsageStats('org-1');
    expect(stats.totalActions).toBe(1);
    expect(stats.uniqueActors).toBe(1);
  });

  it('gets security overview', async () => {
    await service.createPolicy('org-1', {
      name: 'Test',
      rules: ['r1'],
      scope: 'all',
      enforcement: 'strict',
    });
    const overview = await service.getSecurityOverview('org-1');
    expect(overview.policyCount).toBe(1);
    expect(overview.auditEntries).toBe(0);
  });
});
