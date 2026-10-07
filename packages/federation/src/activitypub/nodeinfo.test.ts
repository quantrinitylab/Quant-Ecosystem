import { describe, it, expect } from 'vitest';
import { NodeInfoHandler, NodeInfoSchema } from './nodeinfo.js';

describe('NodeInfoHandler', () => {
  it('well-known returns correct links', () => {
    const handler = new NodeInfoHandler();
    const result = handler.getWellKnown('social.example.com');

    expect(result.links).toHaveLength(1);
    expect(result.links[0]!.rel).toBe('http://nodeinfo.diaspora.software/ns/schema/2.1');
    expect(result.links[0]!.href).toBe('https://social.example.com/nodeinfo/2.1');
  });

  it('nodeinfo has version 2.1', () => {
    const handler = new NodeInfoHandler();
    const info = handler.getNodeInfo();
    expect(info.version).toBe('2.1');
  });

  it('software name is quant', () => {
    const handler = new NodeInfoHandler();
    const info = handler.getNodeInfo();
    expect(info.software.name).toBe('quant');
  });

  it('protocols includes activitypub', () => {
    const handler = new NodeInfoHandler();
    const info = handler.getNodeInfo();
    expect(info.protocols).toContain('activitypub');
  });

  it('usage stats are numbers', () => {
    const handler = new NodeInfoHandler();
    handler.setStats({ users: 100, activeMonth: 42, localPosts: 1000 });
    const info = handler.getNodeInfo();

    expect(typeof info.usage.users.total).toBe('number');
    expect(typeof info.usage.users.activeMonth).toBe('number');
    expect(typeof info.usage.localPosts).toBe('number');
    expect(info.usage.users.total).toBe(100);
    expect(info.usage.users.activeMonth).toBe(42);
    expect(info.usage.localPosts).toBe(1000);

    const parsed = NodeInfoSchema.safeParse(info);
    expect(parsed.success).toBe(true);
  });
});
