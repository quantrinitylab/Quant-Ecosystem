import { describe, it, expect } from 'vitest';
import { Tier1ApiController, type ApiExecutionBackend } from '../../device/tier1-api.js';

describe('Tier1ApiController', () => {
  it('registers and retrieves APIs', () => {
    const controller = new Tier1ApiController();
    controller.registerApi({
      endpoint: '/users',
      method: 'GET',
      description: 'List users',
    });
    const apis = controller.getAvailableApis();
    expect(apis).toHaveLength(1);
    expect(apis[0]!.endpoint).toBe('/users');
  });

  it('initializes with pre-defined APIs', () => {
    const controller = new Tier1ApiController([
      { endpoint: '/tasks', method: 'POST', description: 'Create task' },
      { endpoint: '/users', method: 'GET', description: 'List users' },
    ]);
    expect(controller.getAvailableApis()).toHaveLength(2);
  });

  it('calls a registered API successfully', async () => {
    const controller = new Tier1ApiController([
      { endpoint: '/data', method: 'GET', description: 'Get data' },
    ]);
    const result = await controller.callApi('/data', { limit: 10 });
    expect(result.success).toBe(true);
    expect(result.endpoint).toBe('/data');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns failure for unknown endpoint', async () => {
    const controller = new Tier1ApiController();
    const result = await controller.callApi('/unknown');
    expect(result.success).toBe(false);
    expect(result.data).toEqual({ error: 'API endpoint not found: /unknown' });
  });

  it('checks API existence', () => {
    const controller = new Tier1ApiController([
      { endpoint: '/health', method: 'GET', description: 'Health check' },
    ]);
    expect(controller.hasApi('/health')).toBe(true);
    expect(controller.hasApi('/missing')).toBe(false);
  });

  it('removes APIs', () => {
    const controller = new Tier1ApiController([
      { endpoint: '/tmp', method: 'DELETE', description: 'Delete temp' },
    ]);
    expect(controller.removeApi('/tmp')).toBe(true);
    expect(controller.hasApi('/tmp')).toBe(false);
    expect(controller.removeApi('/tmp')).toBe(false);
  });

  it('validates API definition schema', () => {
    const controller = new Tier1ApiController();
    expect(() => {
      controller.registerApi({
        endpoint: '/valid',
        method: 'POST',
        description: 'Valid endpoint',
      });
    }).not.toThrow();
  });

  describe('real execution backend mode', () => {
    it('reports no backend by default', () => {
      expect(new Tier1ApiController([], null).isBackendConfigured()).toBe(false);
    });

    it('executes registered calls via the injected backend', async () => {
      const calls: string[] = [];
      const backend: ApiExecutionBackend = {
        async execute(api, params) {
          calls.push(api.endpoint);
          return { success: true, data: { real: true, params } };
        },
      };
      const controller = new Tier1ApiController(
        [{ endpoint: '/data', method: 'GET', description: 'd' }],
        backend,
      );
      expect(controller.isBackendConfigured()).toBe(true);
      const result = await controller.callApi('/data', { limit: 5 });
      expect(calls).toEqual(['/data']);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ real: true, params: { limit: 5 } });
    });

    it('falls back to the simulated result when the backend throws', async () => {
      const backend: ApiExecutionBackend = {
        async execute() {
          throw new Error('gateway down');
        },
      };
      const controller = new Tier1ApiController(
        [{ endpoint: '/data', method: 'GET', description: 'd' }],
        backend,
      );
      const result = await controller.callApi('/data');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ endpoint: '/data', params: undefined, method: 'GET' });
    });
  });
});
