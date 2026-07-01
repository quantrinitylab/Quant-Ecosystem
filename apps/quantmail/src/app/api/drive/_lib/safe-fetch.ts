// ============================================================================
// QuantMail Drive proxy — fail-soft fetch
// ============================================================================
//
// The Drive proxy routes forward to the QuantDrive backend. A raw `fetch` that
// rejects (backend down / DNS / connection refused) would surface as an
// unhandled Next 500. `safeFetch` catches the network error and returns an
// honest 502 (UPSTREAM_UNAVAILABLE) JSON Response instead — matching the
// graceful behaviour of the calendar proxy's `proxyToBackend`. It NEVER returns
// fabricated content; only a clear "upstream unavailable" signal.

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: { message: 'Drive service is unavailable', code: 'UPSTREAM_UNAVAILABLE' },
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
