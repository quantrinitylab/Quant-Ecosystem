// Client helper for QuantTrinity owner APIs. The /api routes are gated by the
// owner middleware (owner session token or the `owner_token` cookie). We NEVER
// ship a hardcoded default bearer — that would put a well-known owner token in
// the client bundle. The token comes only from an explicitly configured
// NEXT_PUBLIC_OWNER_TOKEN; otherwise we send the `owner_token` cookie via
// credentials and let the server fail closed when neither is present.
const OWNER_TOKEN = process.env.NEXT_PUBLIC_OWNER_TOKEN;

export async function ownerFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(OWNER_TOKEN ? { Authorization: `Bearer ${OWNER_TOKEN}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const message =
      (detail as { error?: { message?: string } })?.error?.message ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
