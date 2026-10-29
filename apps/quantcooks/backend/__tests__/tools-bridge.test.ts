// ============================================================================
// CP-1 — the @quant/quant-tools bridge (§13.8): the derived package
// definitions equal the registry (58, tiers matching), in-process
// QuantAI calls round-trip through the ONE registry (Tier A live, Tier B
// refusal vocabulary intact), the MCP-flavoured bridge refuses with
// DELEGATION_NOT_CONFIGURED, and the gateway's tools/list serves the
// real catalogue to a registered token.
// ============================================================================

import { describe, it, expect } from 'vitest';
import type { PermissionTier, ToolExecutionContext } from '@quant/quant-tools';
import { createToolsTestRig, USER } from './tools-test-rig';
import { buildQuantToolsBridge } from '../tools/quant-tools.adapter';
import { buildQuantCooksMcpServer } from '../tools/mcp';
import { buildOpenApiDocument } from '../tools/openapi';

const execCtx: ToolExecutionContext = {
  userId: USER,
  sessionId: 'session-1',
  permissions: 3 as PermissionTier,
  dryRun: false,
};

describe('quant-tools bridge', () => {
  it('derives exactly 58 package definitions with matching tiers', () => {
    const rig = createToolsTestRig();
    const bridge = buildQuantToolsBridge(rig.registry, { surface: 'quantai' });
    expect(bridge.definitions).toHaveLength(58);
    expect(bridge.pkgRegistry.listAll()).toHaveLength(58);
    expect(bridge.pkgRegistry.getByApp('quantcooks')).toHaveLength(58);
    for (const def of rig.registry.list()) {
      expect(bridge.pkgRegistry.getPermissionTier(def.name), def.name).toBe(def.permissionTier);
      const pkg = bridge.pkgRegistry.get(def.name);
      expect(pkg?.appId).toBe('quantcooks');
      expect(pkg?.undoRecipe).toBeNull();
    }
  });

  it('in-process Tier A read round-trips with the registry audit id in data', async () => {
    const rig = createToolsTestRig();
    const bridge = buildQuantToolsBridge(rig.registry, { surface: 'quantai' });
    const result = await bridge.executor.executeSingle('quantcooks.list_projects', {}, execCtx);
    expect(result.success).toBe(true);
    const data = result.data as { tool: string; auditId: string };
    expect(data.tool).toBe('quantcooks.list_projects');
    expect(data.auditId).toMatch(/^audit_/);
  });

  it('Tier B refusal round-trips with the code in the error string', async () => {
    const rig = createToolsTestRig();
    const bridge = buildQuantToolsBridge(rig.registry, { surface: 'quantai' });
    // Tier-2 on an agent surface: confirmation (pipeline order) comes
    // first; with it granted, the executor's own refusal surfaces.
    const result = await bridge.executor.executeSingle(
      'quantcooks.generate_dish_image',
      { prompt: 'a thali' },
      { ...execCtx, confirmedToolIds: ['quantcooks.generate_dish_image'] },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('PROVIDER_NOT_CONFIGURED');
  });

  it('the MCP-flavoured bridge (agent-claiming) refuses DELEGATION_NOT_CONFIGURED', async () => {
    const rig = createToolsTestRig();
    const bridge = buildQuantToolsBridge(rig.registry, { surface: 'mcp', agentId: 'mcp-host' });
    const result = await bridge.executor.executeSingle('quantcooks.list_projects', {}, execCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('DELEGATION_NOT_CONFIGURED');
  });
});

describe('MCP gateway wiring', () => {
  it('tools/list serves all 58 tools to a test-registered token', async () => {
    const rig = createToolsTestRig();
    const { server } = buildQuantCooksMcpServer(rig.registry);
    server.registerToken('test-token', USER, 3 as PermissionTier);
    const response = await server.handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      'test-token',
    );
    const tools = (response?.result as { tools: { name: string }[] }).tools;
    expect(tools).toHaveLength(58);
    expect(tools.map((t) => t.name)).toContain('quantcooks.render_effects');
    expect(tools.map((t) => t.name)).not.toContain('quantcooks.list_campaigns');
  });

  it('an unregistered token is refused', async () => {
    const rig = createToolsTestRig();
    const { server } = buildQuantCooksMcpServer(rig.registry);
    const response = await server.handleJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      'no-such-token',
    );
    expect(response?.error).toBeTruthy();
  });
});

describe('generated OpenAPI document (§2.4)', () => {
  it('the x-quantcooks-tools name set equals the registry’s', () => {
    const rig = createToolsTestRig();
    const doc = buildOpenApiDocument(rig.registry) as {
      'x-quantcooks-tools': { name: string }[];
      paths: Record<string, unknown>;
    };
    expect(doc['x-quantcooks-tools'].map((t) => t.name).sort()).toEqual(rig.registry.names());
    expect(Object.keys(doc.paths)).toContain('/tools/{name}/invoke');
    expect(Object.keys(doc.paths)).toContain('/jobs/{id}/cancel');
  });
});
