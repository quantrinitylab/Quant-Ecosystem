import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import promptTemplateRoutes from '../routes/prompt-templates';
import {
  extractTemplateVariables,
  substituteTemplateVariables,
  listPromptTemplates,
  createCustomTemplate,
  incrementTemplateUsage,
  clearTemplatesForTesting,
  CURATED_PROMPT_TEMPLATES,
  type PromptCategory,
} from '../services/prompt-template.service';

describe('Davinci AI Categorized Prompt Template Marketplace & Variable Parser', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    clearTemplatesForTesting();
    app = Fastify();
    await app.register(promptTemplateRoutes, { prefix: '/api/ai' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    clearTemplatesForTesting();
  });

  // ==========================================================================
  // Unit Tests: extractTemplateVariables
  // ==========================================================================
  describe('extractTemplateVariables', () => {
    it('correctly finds all {{variable}} placeholders without duplicates', () => {
      const template =
        'Write a comprehensive test plan for {{feature_name}} targeting {{platform}} with emphasis on {{focus_area}}. Also ensure {{feature_name}} supports offline caching on {{platform}}.';

      const vars = extractTemplateVariables(template);

      expect(vars).toEqual(['feature_name', 'platform', 'focus_area']);
      expect(vars).toHaveLength(3);
    });

    it('handles spaces inside curly braces {{ variable_name }}', () => {
      const template = 'Hello {{ user_name }}, your role is {{  user_role  }} in {{org }}.';
      const vars = extractTemplateVariables(template);
      expect(vars).toEqual(['user_name', 'user_role', 'org']);
    });

    it('returns an empty array when no placeholders exist', () => {
      const template = 'This is a prompt with zero dynamic variables.';
      const vars = extractTemplateVariables(template);
      expect(vars).toEqual([]);
    });

    it('returns an empty array for empty or null string', () => {
      expect(extractTemplateVariables('')).toEqual([]);
    });
  });

  // ==========================================================================
  // Unit Tests: substituteTemplateVariables
  // ==========================================================================
  describe('substituteTemplateVariables', () => {
    it('replaces placeholders with user values', () => {
      const template =
        'Write a comprehensive test plan for {{feature_name}} targeting {{platform}} with emphasis on {{focus_area}}.';
      const input = {
        feature_name: 'FastCDC Delta Sync',
        platform: 'Android APK',
        focus_area: 'Network Latency',
      };

      const { resultText, missingVariables } = substituteTemplateVariables(template, input);

      expect(missingVariables).toHaveLength(0);
      expect(resultText).toBe(
        'Write a comprehensive test plan for FastCDC Delta Sync targeting Android APK with emphasis on Network Latency.',
      );
    });

    it('replaces multiple occurrences of the same variable throughout the text', () => {
      const template = 'The {{project}} build system must compile {{project}} cleanly.';
      const input = { project: 'QuantAI' };

      const { resultText, missingVariables } = substituteTemplateVariables(template, input);

      expect(missingVariables).toEqual([]);
      expect(resultText).toBe('The QuantAI build system must compile QuantAI cleanly.');
    });

    it('identifies missing variables when incomplete input is provided', () => {
      const template =
        'Draft an engineering incident postmortem report for {{incident_title}} affecting {{service_name}}. Root cause: {{root_cause}}.';
      const input = {
        incident_title: 'Database Failover Outage',
        // service_name is omitted
        // root_cause is omitted
      };

      const { resultText, missingVariables } = substituteTemplateVariables(template, input);

      expect(missingVariables).toEqual(['service_name', 'root_cause']);
      expect(resultText).toContain('Database Failover Outage');
      expect(resultText).toContain('{{service_name}}');
      expect(resultText).toContain('{{root_cause}}');
    });

    it('handles empty templateText gracefully', () => {
      const { resultText, missingVariables } = substituteTemplateVariables('', { foo: 'bar' });
      expect(resultText).toBe('');
      expect(missingVariables).toEqual([]);
    });
  });

  // ==========================================================================
  // Unit Tests: Standard Curated Catalog & Listing Filters
  // ==========================================================================
  describe('Curated Catalog & listPromptTemplates', () => {
    it('contains standard curated templates covering Coding, Marketing, Writing, Finance, and Legal', () => {
      const templates = listPromptTemplates();

      expect(templates.length).toBeGreaterThanOrEqual(6);

      const titles = templates.map((t) => t.title);
      expect(titles).toContain('Unit Test Generator');
      expect(titles).toContain('Bug Postmortem');
      expect(titles).toContain('Viral Tweet Thread');
      expect(titles).toContain('Executive Summary');
      expect(titles).toContain('P&L Breakdown');
      expect(titles).toContain('NDA Review');

      // Verify each curated template has pre-extracted variables
      for (const t of CURATED_PROMPT_TEMPLATES) {
        expect(t.variables.length).toBeGreaterThan(0);
        expect(t.isCurated).toBe(true);
      }
    });

    it('filters templates by category', () => {
      const codingTemplates = listPromptTemplates({ category: 'coding' });
      expect(codingTemplates.length).toBeGreaterThanOrEqual(2);
      expect(codingTemplates.every((t) => t.category === 'coding')).toBe(true);

      const legalTemplates = listPromptTemplates({ category: 'legal' });
      expect(legalTemplates.length).toBe(1);
      expect(legalTemplates[0]?.title).toBe('NDA Review');

      const financeTemplates = listPromptTemplates({ category: 'finance' });
      expect(financeTemplates.length).toBe(1);
      expect(financeTemplates[0]?.title).toBe('P&L Breakdown');
    });

    it('filters templates by search keyword across title, description, and tags', () => {
      const testSearch = listPromptTemplates({ search: 'postmortem' });
      expect(testSearch.length).toBe(1);
      expect(testSearch[0]?.title).toBe('Bug Postmortem');

      const pnlSearch = listPromptTemplates({ search: 'ebitda' });
      expect(pnlSearch.length).toBe(1);
      expect(pnlSearch[0]?.title).toBe('P&L Breakdown');

      const nonexistent = listPromptTemplates({ search: 'nonexistent-query-xyz' });
      expect(nonexistent).toHaveLength(0);
    });

    it('filters templates by tag', () => {
      const testingTag = listPromptTemplates({ tag: 'unit-tests' });
      expect(testingTag.length).toBe(1);
      expect(testingTag[0]?.title).toBe('Unit Test Generator');
    });
  });

  // ==========================================================================
  // Unit Tests: Custom Templates & Usage Incrementing
  // ==========================================================================
  describe('createCustomTemplate & incrementTemplateUsage', () => {
    it('creates a custom template and auto-extracts variable placeholders', () => {
      const custom = createCustomTemplate({
        title: 'API Endpoint Spec',
        description: 'Design REST API spec with OpenAPI standard',
        category: 'coding',
        templateText:
          'Create OpenAPI 3.1 specification for {{resource_name}} with endpoints {{methods}} and auth {{auth_type}}.',
        tags: ['api', 'openapi', 'rest'],
      });

      expect(custom.id).toBeDefined();
      expect(custom.id).toContain('template-custom-');
      expect(custom.title).toBe('API Endpoint Spec');
      expect(custom.variables).toEqual(['resource_name', 'methods', 'auth_type']);
      expect(custom.usageCount).toBe(0);
      expect(custom.isCurated).toBe(false);

      // Verify it appears in list
      const list = listPromptTemplates({ category: 'coding' });
      expect(list.some((t) => t.id === custom.id)).toBe(true);
    });

    it('increments usage counter updates usageCount for curated template', () => {
      const initial = listPromptTemplates().find((t) => t.id === 'curated-unit-test-generator')!;
      const countBefore = initial.usageCount;

      const updated = incrementTemplateUsage('curated-unit-test-generator');
      expect(updated).not.toBeNull();
      expect(updated?.usageCount).toBe(countBefore + 1);

      const updatedAgain = incrementTemplateUsage('curated-unit-test-generator');
      expect(updatedAgain?.usageCount).toBe(countBefore + 2);
    });

    it('increments usage counter for custom template', () => {
      const custom = createCustomTemplate({
        title: 'Custom Script',
        description: 'Test custom script',
        category: 'coding',
        templateText: 'Run {{script_name}} on {{env}}',
        tags: ['custom'],
      });

      expect(custom.usageCount).toBe(0);

      const updated = incrementTemplateUsage(custom.id);
      expect(updated?.usageCount).toBe(1);
    });

    it('returns null when incrementing non-existent template ID', () => {
      const result = incrementTemplateUsage('non-existent-template-id');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Fastify Route Tests: /api/ai/templates Endpoints
  // ==========================================================================
  describe('Fastify Routes Integration', () => {
    it('GET /api/ai/templates returns all prompt templates', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ai/templates',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(6);
    });

    it('GET /api/ai/templates filters by category and search keyword', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ai/templates?category=marketing&search=tweet',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].title).toBe('Viral Tweet Thread');
    });

    it('POST /api/ai/templates creates a custom template', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/templates',
        payload: {
          title: 'Fastify Route Generator',
          description: 'Generates clean typed Fastify routes',
          category: 'coding',
          templateText: 'Build Fastify route for {{entity}} with schema {{schema_name}}.',
          tags: ['fastify', 'backend'],
        },
      });

      expect(response.statusCode).toBe(201);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.variables).toEqual(['entity', 'schema_name']);
      expect(json.data.isCurated).toBe(false);
    });

    it('POST /api/ai/templates validates required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/templates',
        payload: {
          title: '', // Invalid empty title
          category: 'invalid-category',
        },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
    });

    it('POST /api/ai/templates/:id/substitute substitutes variables and returns missingVariables', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/templates/curated-viral-tweet-thread/substitute',
        payload: {
          variables: {
            thread_length: '5',
            topic: 'Autonomous AI Swarms',
            target_audience: 'Senior Software Architects',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.missingVariables).toEqual([]);
      expect(json.resultText).toContain('5-tweet thread about Autonomous AI Swarms');
      expect(json.resultText).toContain('Senior Software Architects');
    });

    it('POST /api/ai/templates/:id/substitute reports missing variables when incomplete', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/templates/curated-viral-tweet-thread/substitute',
        payload: {
          variables: {
            thread_length: '3',
            // topic and target_audience missing
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.missingVariables).toEqual(['topic', 'target_audience']);
      expect(json.resultText).toContain('3-tweet thread about {{topic}}');
    });

    it('POST /api/ai/templates/:id/substitute returns 404 for unknown template', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/templates/unknown-template-xyz/substitute',
        payload: {
          variables: {},
        },
      });

      expect(response.statusCode).toBe(404);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Prompt template not found');
    });

    it('POST /api/ai/templates/:id/use increments template usage count', async () => {
      const initial = listPromptTemplates().find((t) => t.id === 'curated-nda-review')!;
      const countBefore = initial.usageCount;

      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/templates/curated-nda-review/use',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data.usageCount).toBe(countBefore + 1);
    });

    it('POST /api/ai/templates/:id/use returns 404 for unknown template', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/templates/unknown-id-123/use',
      });

      expect(response.statusCode).toBe(404);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(false);
    });
  });
});
