// ============================================================================
// QuantCooks — TEST-ONLY stub for the `next/server` module.
//
// vitest runs these unit tests without the Next.js package installed; the real
// `next/server` is only needed at build/serve time. This stub implements the
// tiny surface the app-router routes under test actually use (NextRequest's
// Request behavior + NextResponse.json) on top of the standard web Fetch API,
// so route tests stay hermetic and fast.
// ============================================================================

export class NextRequest extends Request {
  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
  }
}

type JsonInit = ResponseInit & { headers?: HeadersInit };

export class NextResponse extends Response {
  static override json(data: unknown, init?: JsonInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new NextResponse(JSON.stringify(data), { ...init, headers });
  }
}
