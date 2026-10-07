import { describe, it, expect } from 'vitest';
import { AgentSpecSchema } from '../../marketplace/agent-spec.js';

describe('AgentSpec Schema', () => {
  const validSpec = {
    name: 'test-agent',
    version: '1.0.0',
    author: 'test-author',
    description: 'A test agent for validation purposes',
    permissions: ['OBSERVE'],
    capabilities: [{ name: 'read', description: 'Read data', requiredPermission: 'OBSERVE' }],
    entrypoint: './index.ts',
  };

  it('accepts valid spec', () => {
    const result = AgentSpecSchema.safeParse(validSpec);
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = AgentSpecSchema.safeParse({ ...validSpec, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid version format', () => {
    const result = AgentSpecSchema.safeParse({ ...validSpec, version: 'v1.0' });
    expect(result.success).toBe(false);
  });

  it('accepts valid semver versions', () => {
    const result = AgentSpecSchema.safeParse({ ...validSpec, version: '2.1.3' });
    expect(result.success).toBe(true);
  });

  it('rejects short description', () => {
    const result = AgentSpecSchema.safeParse({ ...validSpec, description: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects empty permissions array', () => {
    const result = AgentSpecSchema.safeParse({ ...validSpec, permissions: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid permission levels', () => {
    const result = AgentSpecSchema.safeParse({ ...validSpec, permissions: ['INVALID'] });
    expect(result.success).toBe(false);
  });

  it('rejects empty capabilities array', () => {
    const result = AgentSpecSchema.safeParse({ ...validSpec, capabilities: [] });
    expect(result.success).toBe(false);
  });

  it('accepts optional configSchema', () => {
    const result = AgentSpecSchema.safeParse({
      ...validSpec,
      configSchema: { apiKey: 'string', timeout: 'number' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional tags', () => {
    const result = AgentSpecSchema.safeParse({
      ...validSpec,
      tags: ['productivity', 'automation'],
    });
    expect(result.success).toBe(true);
  });
});
