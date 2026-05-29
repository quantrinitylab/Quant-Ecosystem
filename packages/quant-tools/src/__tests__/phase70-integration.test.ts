import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../registry/tool-registry.js';
import { IntentRouter } from '../planner/intent-router.js';
import { MultiStepPlanner } from '../planner/multi-step-planner.js';
import { ToolExecutor } from '../executor/tool-executor.js';
import { MCPServerAdapter } from '../mcp/mcp-server.js';
import { allTools } from '../tools/index.js';
import type { ToolExecutionContext } from '../types.js';

describe('Phase 70 Integration: Universal Tool Layer E2E', () => {
  const ALL_APP_IDS = [
    'quantmail',
    'quantchat',
    'quantcalendar',
    'quantdocs',
    'quantdrive',
    'quantmeet',
    'quantneon',
    'quantsync',
    'quantube',
    'quantmax',
    'quantedits',
    'quantads',
    'quantmaps',
    'quantphotos',
    'device-control',
    'quant-studio',
    'quant-payments',
  ];

  describe('registers all tools from all 17 apps', () => {
    it('should register >= 85 tools across all 17 apps with >= 5 per app', () => {
      const registry = new ToolRegistry();
      for (const tool of allTools) {
        registry.register(tool);
      }

      const all = registry.listAll();
      expect(all.length).toBeGreaterThanOrEqual(85);

      for (const appId of ALL_APP_IDS) {
        const appTools = registry.getByApp(appId);
        expect(
          appTools.length,
          `App '${appId}' should have >= 5 tools but has ${appTools.length}`,
        ).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('plans multi-app workflow from NL intent', () => {
    it('should route drive+mail intent and create a valid multi-step plan', () => {
      const router = new IntentRouter(allTools);
      const planner = new MultiStepPlanner();

      const intent =
        'search files in drive for tax document then send email to accountant@example.com';
      const matches = router.route(intent);

      // Should match both drive and mail apps
      const driveMatch = matches.find((m) => m.appId === 'quantdrive');
      const mailMatch = matches.find((m) => m.appId === 'quantmail');
      expect(driveMatch, 'Should route to quantdrive').toBeDefined();
      expect(mailMatch, 'Should route to quantmail').toBeDefined();

      // Create a plan from the intent
      const plan = planner.plan(intent, allTools);
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
      expect(plan.id).toBeTruthy();
      expect(plan.description).toContain(intent);

      // Verify both drive and mail tools appear in the plan
      const driveStepIdx = plan.steps.findIndex((s) => s.toolId.startsWith('quantdrive'));
      const mailStepIdx = plan.steps.findIndex((s) => s.toolId.startsWith('quantmail'));
      expect(driveStepIdx, 'Should have a drive step').toBeGreaterThanOrEqual(0);
      expect(mailStepIdx, 'Should have a mail step').toBeGreaterThanOrEqual(0);

      // Validate the plan
      const validation = planner.validatePlan(plan);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('executes multi-step plan with dependency passing and audit', () => {
    let executor: ToolExecutor;
    let context: ToolExecutionContext;

    beforeEach(() => {
      executor = new ToolExecutor();
      context = {
        userId: 'user-integration',
        sessionId: 'session-integration',
        permissions: 3,
        dryRun: false,
      };
    });

    it('should execute plan with data flowing between steps and full audit trail', async () => {
      // Register mock handlers simulating drive search and mail send
      executor.registerHandler('quantdrive.search', async (_params) => {
        return { fileId: 'f1', name: 'tax.pdf', mimeType: 'application/pdf' };
      });

      executor.registerHandler('quantmail.send', async (params) => {
        // Verify dependency data was passed in
        const depData = params['_dep_step-1'] as Record<string, unknown> | undefined;
        return {
          messageId: 'msg-123',
          timestamp: Date.now(),
          attachedFile: depData ? depData['fileId'] : null,
        };
      });

      const plan = {
        id: 'integration-plan-1',
        steps: [
          {
            stepId: 'step-1',
            toolId: 'quantdrive.search',
            params: { query: 'tax document' },
            dependsOn: [] as string[],
            outputKey: 'driveResult',
          },
          {
            stepId: 'step-2',
            toolId: 'quantmail.send',
            params: { to: 'accountant@example.com', subject: 'Tax docs', body: 'Attached.' },
            dependsOn: ['step-1'],
            outputKey: 'mailResult',
          },
        ],
        estimatedCost: 'low' as const,
        requiredPermission: 1 as const,
        description: 'find tax doc and send',
      };

      const results = await executor.execute(plan, context);

      // All steps should succeed
      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(true);

      // Verify data flows between steps
      const driveData = results[0]!.data as Record<string, unknown>;
      expect(driveData['fileId']).toBe('f1');
      expect(driveData['name']).toBe('tax.pdf');

      const mailData = results[1]!.data as Record<string, unknown>;
      expect(mailData['messageId']).toBe('msg-123');
      expect(mailData['attachedFile']).toBe('f1');

      // Verify complete audit trail (invoke + success for each step = 4 entries)
      const entries = executor.getAuditEntries();
      expect(entries.length).toBeGreaterThanOrEqual(4);

      const invokeEntries = entries.filter((e) => e.action === 'invoke');
      const successEntries = entries.filter((e) => e.action === 'success');
      expect(invokeEntries.length).toBeGreaterThanOrEqual(2);
      expect(successEntries.length).toBeGreaterThanOrEqual(2);

      // Every entry should have the correct userId
      for (const entry of entries) {
        expect(entry.userId).toBe('user-integration');
      }
    });
  });

  describe('MCP adapter exposes full catalog and handles requests', () => {
    let executor: ToolExecutor;

    beforeEach(() => {
      executor = new ToolExecutor();
    });

    it('should expose full catalog with >= 85 tools', () => {
      const adapter = new MCPServerAdapter(allTools, executor);
      const catalog = adapter.getCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(85);

      // Each entry should have required fields
      for (const entry of catalog) {
        expect(entry.name).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.inputSchema).toBeDefined();
        expect(entry.permissionTier).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle authenticated request successfully', async () => {
      const adapter = new MCPServerAdapter(allTools, executor);
      adapter.registerToken('valid-token', 'mcp-user', 3);

      // Register a handler for the tool
      executor.registerHandler('quantdrive.search', async (_params) => {
        return { fileId: 'f1', name: 'result.pdf' };
      });

      const result = await adapter.handleRequest(
        'quantdrive.search',
        { query: 'test' },
        'valid-token',
      );
      expect(result.success).toBe(true);
      expect(result.toolId).toBe('quantdrive.search');
    });

    it('should reject request with invalid token', async () => {
      const adapter = new MCPServerAdapter(allTools, executor);

      const result = await adapter.handleRequest('quantdrive.search', {}, 'invalid-token');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('should reject request with insufficient permissions', async () => {
      const adapter = new MCPServerAdapter(allTools, executor);
      // Register token with tier 0 (lowest)
      adapter.registerToken('low-tier-token', 'limited-user', 0);

      // Find a tool that requires tier > 0
      const highTierTool = allTools.find((t) => t.permissionTier > 0);
      expect(highTierTool).toBeDefined();

      const result = await adapter.handleRequest(highTierTool!.id, {}, 'low-tier-token');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient permissions');
    });
  });

  describe('every tool execution is audited per tier', () => {
    let executor: ToolExecutor;

    beforeEach(() => {
      executor = new ToolExecutor();
    });

    it('should audit executions at different permission tiers with correct metadata', async () => {
      executor.registerHandler('tool.tier0', async () => ({ tier: 0 }));
      executor.registerHandler('tool.tier1', async () => ({ tier: 1 }));
      executor.registerHandler('tool.tier2', async () => ({ tier: 2 }));

      // Execute at tier 0
      await executor.executeSingle(
        'tool.tier0',
        {},
        {
          userId: 'user-auto',
          sessionId: 's1',
          permissions: 0,
          dryRun: false,
        },
      );

      // Execute at tier 1
      await executor.executeSingle(
        'tool.tier1',
        {},
        {
          userId: 'user-notify',
          sessionId: 's2',
          permissions: 1,
          dryRun: false,
        },
      );

      // Execute at tier 2
      await executor.executeSingle(
        'tool.tier2',
        {},
        {
          userId: 'user-confirm',
          sessionId: 's3',
          permissions: 2,
          dryRun: false,
        },
      );

      const entries = executor.getAuditEntries();

      // Each tool execution should produce at least 2 entries (invoke + success)
      expect(entries.length).toBeGreaterThanOrEqual(6);

      // Verify tier 0 user audit entries
      const tier0Entries = entries.filter((e) => e.userId === 'user-auto');
      expect(tier0Entries.length).toBeGreaterThanOrEqual(2);
      expect(tier0Entries.find((e) => e.action === 'invoke')).toBeDefined();
      expect(tier0Entries.find((e) => e.action === 'success')).toBeDefined();
      expect(tier0Entries[0]!.toolId).toBe('tool.tier0');

      // Verify tier 1 user audit entries
      const tier1Entries = entries.filter((e) => e.userId === 'user-notify');
      expect(tier1Entries.length).toBeGreaterThanOrEqual(2);
      expect(tier1Entries.find((e) => e.action === 'invoke')).toBeDefined();
      expect(tier1Entries.find((e) => e.action === 'success')).toBeDefined();
      expect(tier1Entries[0]!.toolId).toBe('tool.tier1');

      // Verify tier 2 user audit entries
      const tier2Entries = entries.filter((e) => e.userId === 'user-confirm');
      expect(tier2Entries.length).toBeGreaterThanOrEqual(2);
      expect(tier2Entries.find((e) => e.action === 'invoke')).toBeDefined();
      expect(tier2Entries.find((e) => e.action === 'success')).toBeDefined();
      expect(tier2Entries[0]!.toolId).toBe('tool.tier2');
    });
  });
});
