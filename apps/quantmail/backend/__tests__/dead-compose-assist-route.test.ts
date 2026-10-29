// ============================================================================
// quantmail — dead backend compose-assist route regression
// (fix/qm-compose-assist-orphan).
//
// History: backend POST /emails/compose-assist (routes/ai.ts) plus its
// openapi.yaml entry duplicated the live composer assist. The composer page
// calls apiClient.aiCompose() → POST /ai/compose (routes/ai-compose.ts:
// Workers AI primary, tone/length/intent/tier handling, idempotency-gated,
// honest 503 when unconfigured), and the app-registry capability
// mail.ai.compose.assist itself points at /ai/compose — not at
// /emails/compose-assist. The /emails/compose-assist route had ZERO callers
// anywhere (its Next proxy was already deleted and pinned deleted by
// src/__tests__/dead-routes.test.ts), skipped the idempotency gate its
// sibling /ai/compose honors, and returned a different response shape
// ({content, ...} vs the composer's {subject, body, ...}). Wiring a second
// caller would have forked the composer onto the weaker path, so the orphan
// was removed instead of wired: route, schema, service method, and API doc.
//
// These tests pin the backend half of the deletion shut and prove the live
// path is still registered. They read source files (node environment) rather
// than booting Fastify, matching the dead-routes.test.ts approach.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..');
const APP = join(BACKEND, '..');

describe('dead backend /emails/compose-assist route stays deleted', () => {
  it('no compose-assist route, schema, or service method remains', () => {
    const aiRoutes = readFileSync(join(BACKEND, 'routes/ai.ts'), 'utf8');
    expect(aiRoutes).not.toContain('compose-assist');
    expect(aiRoutes).not.toContain('composeAssistant');
    expect(aiRoutes).not.toContain('composeAssistSchema');

    const service = readFileSync(join(BACKEND, 'services/ai-email.service.ts'), 'utf8');
    expect(service).not.toContain('composeAssistant');
    expect(service).not.toContain('ComposeAssistResult');
  });

  it('the API doc no longer advertises /emails/compose-assist', () => {
    const openapi = readFileSync(join(APP, 'openapi.yaml'), 'utf8');
    expect(openapi).not.toContain('/emails/compose-assist');
  });

  it('the live composer path is still registered and catalogued', () => {
    const aiCompose = readFileSync(join(BACKEND, 'routes/ai-compose.ts'), 'utf8');
    expect(aiCompose).toContain("fastify.post('/compose'");
    const app = readFileSync(join(BACKEND, 'app.ts'), 'utf8');
    expect(app).toContain("aiComposeRoutes, { prefix: '/ai' }");
    const capabilities = readFileSync(
      join(APP, '..', '..', 'packages/app-registry/src/capabilities.ts'),
      'utf8',
    );
    expect(capabilities).toContain("id: 'mail.ai.compose.assist'");
    expect(capabilities).toContain('POST /ai/compose');
  });

  it('the sibling /emails/* AI routes in ai.ts are untouched', () => {
    const aiRoutes = readFileSync(join(BACKEND, 'routes/ai.ts'), 'utf8');
    for (const route of [
      '/:id/summarize',
      '/:id/classify-priority',
      '/:id/detect-phishing',
      '/:id/reply-suggestions',
      '/:id/send-preview',
    ]) {
      expect(aiRoutes).toContain(route);
    }
  });
});
