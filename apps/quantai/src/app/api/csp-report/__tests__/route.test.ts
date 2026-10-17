import { describe, it, expect } from 'vitest';
import { POST } from '../route';

const VALID_REPORT = JSON.stringify({
  'csp-report': {
    'document-uri': 'https://quantai.quantrinity.in/chat',
    'blocked-uri': 'https://evil.example/x.js',
    'effective-directive': 'script-src',
    'violated-directive': "script-src 'self' 'unsafe-inline'",
  },
});

function reportRequest(body: string, contentType: string): Request {
  return new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

describe('POST /api/csp-report (F-212 companion)', () => {
  it('accepts a valid CSP report with 204', async () => {
    const res = await POST(reportRequest(VALID_REPORT, 'application/csp-report'));
    expect(res.status).toBe(204);
  });

  it('accepts application/json content type too (some browsers)', async () => {
    const res = await POST(reportRequest(VALID_REPORT, 'application/json'));
    expect(res.status).toBe(204);
  });

  it('rejects non-report content types with 415', async () => {
    const res = await POST(reportRequest(VALID_REPORT, 'text/plain'));
    expect(res.status).toBe(415);
  });

  it('never 500s on malformed JSON — returns 204', async () => {
    const res = await POST(reportRequest('{{{not-json', 'application/csp-report'));
    expect(res.status).toBe(204);
  });

  it('silently drops oversized bodies (abuse guard)', async () => {
    const res = await POST(reportRequest('x'.repeat(8192), 'application/csp-report'));
    expect(res.status).toBe(204);
  });

  it('tolerates a missing csp-report envelope', async () => {
    const res = await POST(
      reportRequest(JSON.stringify({ hello: 'world' }), 'application/csp-report'),
    );
    expect(res.status).toBe(204);
  });
});
