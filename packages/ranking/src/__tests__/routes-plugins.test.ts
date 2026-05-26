import { describe, it, expect } from 'vitest';
import { PluginSystem } from '../plugin-system.js';
import pluginRoutes from '../routes/plugins.js';
import { z } from 'zod';

const pluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  wasmUrl: z.string().url(),
  version: z.string().min(1),
  author: z.string().min(1),
});

describe('pluginRoutes', () => {
  it('exports a function that returns a fastify plugin', () => {
    const pluginSystem = new PluginSystem();
    const plugin = pluginRoutes({ pluginSystem });
    expect(typeof plugin).toBe('function');
  });

  it('plugin system supports CRUD via loadPlugin/getPlugin/unloadPlugin', async () => {
    const system = new PluginSystem();

    const manifest = {
      id: 'test-plugin',
      name: 'Test',
      wasmUrl: 'https://example.com/plugin.wasm',
      version: '1.0.0',
      author: 'Author',
    };

    // Create
    await system.loadPlugin(manifest);
    expect(system.getPlugin('test-plugin')).toEqual(manifest);

    // List
    expect(system.listPlugins()).toHaveLength(1);

    // Update
    const updated = { ...manifest, name: 'Updated Test' };
    await system.loadPlugin(updated);
    expect(system.getPlugin('test-plugin')?.name).toBe('Updated Test');

    // Delete
    system.unloadPlugin('test-plugin');
    expect(system.getPlugin('test-plugin')).toBeUndefined();
  });

  it('validates manifest schema - accepts valid manifest', () => {
    const valid = {
      id: 'my-plugin',
      name: 'My Plugin',
      wasmUrl: 'https://cdn.example.com/plugin.wasm',
      version: '2.1.0',
      author: 'Dev',
    };

    const result = pluginManifestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('validates manifest schema - rejects missing fields', () => {
    const invalid = {
      id: 'my-plugin',
      name: '',
    };

    const result = pluginManifestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates manifest schema - rejects invalid URL', () => {
    const invalid = {
      id: 'my-plugin',
      name: 'My Plugin',
      wasmUrl: 'not-a-url',
      version: '1.0.0',
      author: 'Dev',
    };

    const result = pluginManifestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('plugin system returns undefined for non-existent plugin', () => {
    const system = new PluginSystem();
    expect(system.getPlugin('nonexistent')).toBeUndefined();
  });
});
