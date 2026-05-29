import { describe, it, expect } from 'vitest';
import { SandboxRuntime } from '../sandbox/runtime.js';
import { CSPBuilder } from '../sandbox/csp.js';
import { IPCBridge } from '../sandbox/ipc-bridge.js';
import { Permission } from '../types.js';

describe('CSPBuilder', () => {
  it('should generate a restrictive default CSP with no permissions', () => {
    const builder = new CSPBuilder([]);
    const csp = builder.generate();
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('connect-src');
  });

  it('should not include unsafe-inline in style-src', () => {
    const builder = new CSPBuilder([]);
    const csp = builder.generate();
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('should add connect-src when network permission is granted', () => {
    const builder = new CSPBuilder([Permission.Network]);
    const csp = builder.generate();
    expect(csp).toContain('connect-src');
  });

  it('should add media-src when camera permission is granted', () => {
    const builder = new CSPBuilder([Permission.Camera]);
    const csp = builder.generate();
    expect(csp).toContain('media-src');
  });
});

describe('IPCBridge', () => {
  it('should deliver messages to registered handlers', () => {
    const bridge = new IPCBridge();
    let received: unknown = null;
    bridge.on('test-channel', (payload) => {
      received = payload;
    });
    bridge.send('test-channel', { data: 'hello' });
    expect(received).toEqual({ data: 'hello' });
  });

  it('should reject messages exceeding 1MB size limit', () => {
    const bridge = new IPCBridge();
    const largePayload = 'x'.repeat(1024 * 1024 + 1);
    expect(() => bridge.send('channel', largePayload)).toThrow('maximum size');
  });

  it('should enforce rate limit of 100 messages per second', () => {
    const bridge = new IPCBridge();
    expect(() => {
      for (let i = 0; i < 101; i++) {
        bridge.send('channel', i);
      }
    }).toThrow('Rate limit');
  });

  it('should throw after destroy is called', () => {
    const bridge = new IPCBridge();
    bridge.destroy();
    expect(() => bridge.send('channel', 'data')).toThrow('destroyed');
  });
});

describe('SandboxRuntime', () => {
  it('should generate CSP based on permissions', () => {
    const runtime = new SandboxRuntime([Permission.Network, Permission.Camera]);
    const csp = runtime.generateCSP();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('connect-src');
    expect(csp).toContain('media-src');
  });

  it('should have configurable resource limits', () => {
    const runtime = new SandboxRuntime([], { maxCPU: 50, maxMemory: 128, maxNetworkRequests: 50 });
    const limits = runtime.getResourceLimits();
    expect(limits.maxCPU).toBe(50);
    expect(limits.maxMemory).toBe(128);
    expect(limits.maxNetworkRequests).toBe(50);
  });

  it('should check permissions via the gate', () => {
    const runtime = new SandboxRuntime([Permission.Storage]);
    expect(runtime.checkPermission(Permission.Storage)).toBe(true);
    expect(runtime.checkPermission(Permission.AI)).toBe(false);
  });
});
