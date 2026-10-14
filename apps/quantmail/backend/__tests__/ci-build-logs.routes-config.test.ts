// ============================================================================
// CI build-logs proxy allow-list pin (fix/qm-quantgit-ci-logs-allowlist).
//
// The action-detail modal's <BuildTerminal> labels its panel "Live streaming
// via Redis PubSub" and, when no streamUrl prop is passed (as in
// QuantGitModals.tsx), defaults to GET /api/ci/builds/:id/logs. The Fastify
// backend registers exactly that GET (SSE) in backend/routes/ci-logs.ts, but
// the Next catch-all proxy (src/app/api/[...path]/route.ts) only forwards
// paths listed in ALLOWED_BACKEND_ROUTES — and ci/builds/:id/logs was missing,
// so the proxy answered API_ROUTE_NOT_FOUND (404) before the request ever
// reached the backend and the Execution Logs panel could never stream.
// These tests pin the allow-list row.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';

function methodsFor(path: string): string[] | undefined {
  return ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(path))?.methods.slice();
}

describe('ci build logs proxy allow-list', () => {
  it('forwards GET for the id-addressed logs path /ci/builds/:id/logs', () => {
    expect(methodsFor('ci/builds/build-123/logs')).toEqual(['GET']);
  });

  it('does not fall through to the build-detail row (which is id-only, anchored)', () => {
    const entry = ALLOWED_BACKEND_ROUTES.find(({ pattern }) =>
      pattern.test('ci/builds/build-123/logs'),
    );
    expect(entry?.pattern.source).toContain('logs');
  });

  it('exposes the logs path for GET only (no POST/PUT/PATCH/DELETE: the backend registers GET only)', () => {
    const methods = methodsFor('ci/builds/build-123/logs') ?? [];
    expect(methods).toContain('GET');
    expect(methods).not.toContain('POST');
    expect(methods).not.toContain('PUT');
    expect(methods).not.toContain('PATCH');
    expect(methods).not.toContain('DELETE');
  });

  it('keeps the row anchored: a deeper path is not allow-listed', () => {
    expect(methodsFor('ci/builds/build-123/logs/extra')).toBeUndefined();
  });

  it('keeps the pre-existing CI rows untouched', () => {
    expect(methodsFor('ci/workflows')).toEqual(['GET']);
    expect(methodsFor('ci/builds')).toEqual(['GET']);
    expect(methodsFor('ci/builds/build-123')).toEqual(['GET']);
    expect(methodsFor('ci/workflows/wf-1/trigger')).toEqual(['POST']);
    expect(methodsFor('ci/builds/build-123/cancel')).toEqual(['POST']);
    expect(methodsFor('ci/deployments')).toEqual(['GET']);
  });
});
