// Guest session minting (P0-2 fix, 2026-10-06):
// POST /api/guest/session -> { token, guestId, expiresIn }
//
// "Continue as Guest" used to be a dead end by construction: the client
// created local `guest-conv-*` conversations and POSTed them to
// /api/sessions/{id}/messages/stream with no Authorization header, so the
// backend's auth gate answered 401 on every message and the UI showed
// "Sorry, I encountered an error." forever.
//
// This route mints a SHORT-LIVED, guest-scoped JWT signed with the SAME
// secret the quantai backend's auth plugin verifies (`JWT_SECRET`). The
// client attaches it as `Authorization: Bearer <guest-token>`; the backend
// accepts it as a normal auth context with `userId = "guest:<uuid>"`, so
// guests get the REAL inference path (ChatService -> AIEngine) with their
// own server-side session rows and per-guest usage tracking. Nothing is
// fabricated: if the backend is down the stream route returns an honest 503.
//
// Abuse bounds (documented, deliberate):
//  - 20-minute expiry per token; guests re-mint (fresh namespace).
//  - per-IP mint rate limit (10/hour) enforced here, in-memory.
//  - the token carries `guest: true` + `scope: "guest:chat"` so future
//    backend code can distinguish guest traffic; all data stays namespaced
//    to the guest's own userId, so no cross-user access is possible.
//  - for Redis-backed limits across replicas, replace `mintLog` with the
//    shared rate limiter (follow-up, not this fix).
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';

// Never cache; always run on the Node runtime.
export const dynamic = 'force-dynamic';

/** Guest tokens live 20 minutes — long enough to try the product, short enough to bound abuse. */
export const GUEST_TTL_SECONDS = 20 * 60;

/** Max guest sessions minted per IP per window (best-effort, per-replica). */
export const GUEST_MINTS_PER_WINDOW = 10;
export const GUEST_MINT_WINDOW_MS = 60 * 60 * 1000;

const mintLog = new Map<string, number[]>();

function guestJwtSecret(): Uint8Array | null {
  // The backend reads `process.env['JWT_SECRET']`; the k8s ExternalSecret
  // materialises it as `jwt-secret`. Accept both spellings so the frontend
  // and backend agree on the key regardless of how the secret is mounted.
  const raw = process.env.JWT_SECRET ?? process.env['jwt-secret'];
  if (!raw || !raw.trim()) return null;
  return new TextEncoder().encode(raw);
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function mintAllowed(ip: string): boolean {
  const now = Date.now();
  const recent = (mintLog.get(ip) ?? []).filter((t) => now - t < GUEST_MINT_WINDOW_MS);
  if (recent.length >= GUEST_MINTS_PER_WINDOW) {
    mintLog.set(ip, recent);
    return false;
  }
  recent.push(now);
  mintLog.set(ip, recent);
  return true;
}

/** Test seam: reset the in-memory mint log. */
export function __resetGuestMintLog(): void {
  mintLog.clear();
}

export async function POST(request: NextRequest) {
  const secret = guestJwtSecret();
  if (!secret) {
    // Honest failure: guest chat cannot work without the shared JWT secret.
    // Never mint an unsigned token or fall back to a canned reply.
    return NextResponse.json(
      {
        success: false,
        error: 'Guest sessions are unavailable right now. Please sign in to continue.',
        code: 'GUEST_UNAVAILABLE',
      },
      { status: 503 },
    );
  }

  if (!mintAllowed(clientIp(request))) {
    return NextResponse.json(
      {
        success: false,
        error: 'Too many guest sessions from this network. Please try again later.',
        code: 'GUEST_RATE_LIMITED',
      },
      { status: 429 },
    );
  }

  const guestId = `guest:${crypto.randomUUID()}`;
  const token = await new SignJWT({ guest: true, scope: 'guest:chat', email: '' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(guestId)
    // Must match what the backend's auth plugin accepts:
    // issuer in [JWT_ISSUER ?? 'quantai', 'quantmail', ...],
    // audience in [JWT_AUDIENCE ?? 'quant-ecosystem', 'quant-ecosystem'].
    .setIssuer(process.env.JWT_ISSUER ?? 'quantai')
    .setAudience(process.env.JWT_AUDIENCE ?? 'quant-ecosystem')
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${GUEST_TTL_SECONDS}s`)
    .sign(secret);

  return NextResponse.json({
    success: true,
    data: { token, guestId, expiresIn: GUEST_TTL_SECONDS },
  });
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 },
  );
}
