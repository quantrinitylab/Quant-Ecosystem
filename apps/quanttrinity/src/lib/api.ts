// Client helper for QuantTrinity owner APIs. The /api routes are gated by the
// owner middleware; in dev we attach a default owner bearer so the control
// plane is functional end-to-end. In production this is replaced by the
// owner's real session token (NEXT_PUBLIC_OWNER_TOKEN / cookie).
const OWNER_TOKEN = process.env.NEXT_PUBLIC_OWNER_TOKEN ?? 'owner-secret-key';

export async function ownerFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OWNER_TOKEN}`,
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
