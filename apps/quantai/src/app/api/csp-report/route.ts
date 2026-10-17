import { NextRequest, NextResponse } from 'next/server';
import { logServerWarn } from '../../../lib/server-log';

// ============================================================================
// QuantAI — CSP violation report collector (F-212 companion).
//
// Browsers POST violation reports here per the report-uri directive in
// next.config.js. Logging-only: no persistence, no PII — reports contain only
// first-party URLs and the directive that fired, which is exactly what is
// needed to tune the policy without weakening it blindly.
// ============================================================================

const MAX_BODY_BYTES = 4096;

interface CspReportBody {
  'csp-report'?: {
    'document-uri'?: string;
    'blocked-uri'?: string;
    'effective-directive'?: string;
    'violated-directive'?: string;
    'original-policy'?: string;
  };
}

function isSafeString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048;
}

export async function POST(request: NextRequest | Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (
    !contentType.includes('application/csp-report') &&
    !contentType.includes('application/json')
  ) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_CONTENT_TYPE' } },
      { status: 415 },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 });
  }

  let parsed: CspReportBody;
  try {
    parsed = JSON.parse(raw) as CspReportBody;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const report = parsed?.['csp-report'];
  if (report && typeof report === 'object') {
    const blockedUri = isSafeString(report['blocked-uri']) ? report['blocked-uri'] : 'n/a';
    const directive = isSafeString(report['effective-directive'])
      ? report['effective-directive']
      : (isSafeString(report['violated-directive']) ? report['violated-directive'] : 'n/a');
    const documentUri = isSafeString(report['document-uri']) ? report['document-uri'] : 'n/a';
    // Structured single-line log — greppable, no stack traces, no user data.
    logServerWarn(
      '[csp-report]',
      `blocked-uri=${blockedUri} directive=${directive} document=${documentUri}`,
    );
  }

  return new NextResponse(null, { status: 204 });
}
