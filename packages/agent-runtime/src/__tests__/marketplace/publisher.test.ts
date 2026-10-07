import { describe, it, expect } from 'vitest';
import { AgentPublisher } from '../../marketplace/publisher.js';
import { AgentSpec } from '../../marketplace/agent-spec.js';
import { PermissionLevel } from '../../permissions.js';

describe('AgentPublisher', () => {
  const validSpec: AgentSpec = {
    name: 'email-helper',
    version: '1.0.0',
    author: 'dev-team',
    description: 'An email automation agent for productivity',
    permissions: [PermissionLevel.ACT_LOW],
    capabilities: [
      {
        name: 'read-emails',
        description: 'Read inbox',
        requiredPermission: PermissionLevel.OBSERVE,
      },
    ],
    entrypoint: './email-helper.ts',
  };

  it('validates a correct spec', () => {
    const publisher = new AgentPublisher();
    const result = publisher.validate(validSpec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid spec with errors', () => {
    const publisher = new AgentPublisher();
    const result = publisher.validate({ name: '', version: 'bad' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('publishes a valid spec', () => {
    const publisher = new AgentPublisher();
    const result = publisher.publish(validSpec);
    expect(result.success).toBe(true);
    expect(result.agentId).toBe('dev-team/email-helper@1.0.0');
  });

  it('prevents duplicate publish', () => {
    const publisher = new AgentPublisher();
    publisher.publish(validSpec);
    const result = publisher.publish(validSpec);
    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('already published');
  });

  it('unpublishes an agent', () => {
    const publisher = new AgentPublisher();
    publisher.publish(validSpec);
    expect(publisher.unpublish('dev-team/email-helper@1.0.0')).toBe(true);
    expect(publisher.getPublished()).toHaveLength(0);
  });

  it('unpublish returns false for unknown agent', () => {
    const publisher = new AgentPublisher();
    expect(publisher.unpublish('unknown')).toBe(false);
  });

  it('gets published agents', () => {
    const publisher = new AgentPublisher();
    publisher.publish(validSpec);
    publisher.publish({ ...validSpec, name: 'other-agent', version: '2.0.0' });
    expect(publisher.getPublished()).toHaveLength(2);
  });

  it('gets agent by ID', () => {
    const publisher = new AgentPublisher();
    publisher.publish(validSpec);
    const agent = publisher.getById('dev-team/email-helper@1.0.0');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('email-helper');
  });
});
