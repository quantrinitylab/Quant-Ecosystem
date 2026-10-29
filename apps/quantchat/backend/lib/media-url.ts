// ===========================================================================
// QuantChat — shared media-URL validator (QC-F-330)
//
// A persisted media URL is loaded VERBATIM by other users' browsers
// (stories, reels, avatars, message media in discover/thread surfaces), so
// — unlike the snap presign path (QC-F-329, where only the derived storage
// key ever leaves the server and the host is irrelevant) — HERE the host
// is the whole question: an arbitrary host turns every viewer into a
// tracking beacon for the sender (IP + open time) and lets the sender
// swap the content after delivery.
//
// A non-`data:` URL is accepted only when ALL of these hold:
//   1. Scheme is https: — http: only when the host is a local storage
//      host (localhost / 127.0.0.1 / minio), matching storage-config's
//      LOCAL_HOST_PATTERN (dev/MinIO parity; that host is the viewer's
//      own machine, never an attacker's server).
//   2. Host ∈ the own-storage host set, derived at runtime from env —
//      never invented: the MediaService base host (S3_BASE_URL, default
//      quantchat-media.s3.amazonaws.com) and, when a storage endpoint is
//      configured (CLOUDFLARE_R2_ENDPOINT | R2_ENDPOINT | S3_ENDPOINT |
//      CLOUDFLARE_R2_ACCOUNT_ID), that endpoint's host; plus each host's
//      virtual-hosted bucket forms `<bucket>.<host>` for the buckets the
//      two storage systems already read (S3_BUCKET ?? 'quantchat-media',
//      ATTACHMENTS_BUCKET ?? R2_BUCKET ?? S3_BUCKET ??
//      'quantmail-attachments'). Host comparison is EXACT on the parsed
//      URL host — suffix/prefix lookalikes and userinfo tricks fail.
//   3. The storage key derived from the path (via the same
//      extractStorageKey derivation QC-F-329 uses) has the only shape the
//      system ever issues (MediaService.generateUploadUrl):
//      `<ownerId>/media_*/<filename>` — first segment exactly the
//      caller's own id, second a `media_` segment, then a filename.
//
// `data:` URLs are per-surface policy (callers pass `allowData`): the
// surfaces whose real shipped clients send inline data (messages,
// stories, avatar select) allow the listed media families; surfaces with
// no such client (reels, profile avatarUrl) reject `data:` outright.
//
// What this does NOT prove: that an object was ever actually uploaded at
// that key (the upload pipeline is simulated — there is no durable media
// registry to consult), or that the owner cannot later mutate their own
// object. What it proves is exactly this finding's threat: no third-party
// host is ever loaded, and nobody can pass off another user's key as
// their own media.
// ===========================================================================

import { createAppError } from '@quant/server-core';
import { resolveStorageConfigFromEnv } from '@quant/storage';
import { extractStorageKey } from '../services/message.service';

export type MediaUrlVerdict = { ok: true } | { ok: false; reason: string };

export interface MediaUrlOptions {
  /** The user the media must belong to (sender / author / creator / self). */
  ownerId: string;
  /**
   * Allowed `data:` media-type prefixes (e.g. 'image/'), or false to
   * reject `data:` URLs on this surface entirely.
   */
  allowData: readonly string[] | false;
  /** Optional cap for accepted `data:` URLs (stories: 12 Mi chars). */
  maxDataLength?: number;
  /** Optional cap for non-`data:` URLs (stories keep their historic 4096). */
  maxUrlLength?: number;
}

const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|minio)(:\d+)?$/i;

function storageBuckets(env: NodeJS.ProcessEnv): string[] {
  return [
    env.S3_BUCKET ?? 'quantchat-media',
    env.ATTACHMENTS_BUCKET ?? env.R2_BUCKET ?? env.S3_BUCKET ?? 'quantmail-attachments',
  ];
}

/**
 * The own-storage host set, derived from env (see header). Computed fresh
 * on each call so configuration — and tests that vary env — always see
 * the current environment; the set is a handful of strings.
 */
export function ownStorageHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const hosts = new Set<string>();
  const buckets = storageBuckets(env);
  const addHost = (host: string) => {
    hosts.add(host);
    for (const bucket of buckets) hosts.add(`${bucket}.${host}`);
  };

  // (a) MediaService's stored-URL base (the only "stored URL" issuer).
  try {
    addHost(new URL(env.S3_BASE_URL ?? 'https://quantchat-media.s3.amazonaws.com').host);
  } catch {
    /* a malformed S3_BASE_URL contributes no host — fail closed */
  }

  // (b) The StorageClient endpoint host, when storage is configured.
  const endpointConfigured =
    env.CLOUDFLARE_R2_ENDPOINT ?? env.R2_ENDPOINT ?? env.S3_ENDPOINT ?? env.CLOUDFLARE_R2_ACCOUNT_ID;
  if (endpointConfigured) {
    try {
      const config = resolveStorageConfigFromEnv(env);
      if (config?.endpoint) addHost(new URL(config.endpoint).host);
    } catch {
      /* production refusing dev credentials etc. — contribute no host */
    }
  }
  return hosts;
}

export function validateMediaUrl(raw: string, opts: MediaUrlOptions): MediaUrlVerdict {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  // data: — per-surface policy, checked before any URL parsing.
  if (raw.startsWith('data:')) {
    if (opts.allowData === false) return { ok: false, reason: 'data-not-allowed' };
    const mediaType = raw.slice('data:'.length).split(/[;,]/, 1)[0] ?? '';
    if (!opts.allowData.some((prefix) => mediaType.startsWith(prefix))) {
      return { ok: false, reason: 'data-type-not-allowed' };
    }
    if (opts.maxDataLength !== undefined && raw.length > opts.maxDataLength) {
      return { ok: false, reason: 'data-too-large' };
    }
    return { ok: true };
  }

  if (opts.maxUrlLength !== undefined && raw.length > opts.maxUrlLength) {
    return { ok: false, reason: 'url-too-long' };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  // Scheme + host. Exact host match only — URL parsing already resolves
  // userinfo tricks (the real host is url.host) and lookalike suffixes
  // simply are not in the set.
  const isLocalHost = LOCAL_HOST_PATTERN.test(url.host);
  if (url.protocol === 'http:') {
    if (!isLocalHost) return { ok: false, reason: 'insecure-scheme' };
  } else if (url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme-not-allowed' };
  }
  if (!ownStorageHosts().has(url.host) && !isLocalHost) {
    return { ok: false, reason: 'host-not-own-storage' };
  }

  // Key shape: <ownerId>/media_*/<filename> — derivation shared with
  // QC-F-329 via extractStorageKey (bucket-prefix handling included).
  const key = extractStorageKey(raw);
  const segments = key.split('/');
  if (segments.length < 3 || segments[0] !== opts.ownerId || !segments[1]?.startsWith('media_')) {
    return { ok: false, reason: 'key-not-owned' };
  }
  return { ok: true };
}

/** Throwing wrapper: 400 MEDIA_URL_NOT_ALLOWED (distinct from QC-F-329's MEDIA_URL_NOT_OWNED). */
export function assertMediaUrlAllowed(raw: string, opts: MediaUrlOptions): void {
  const verdict = validateMediaUrl(raw, opts);
  if (!verdict.ok) {
    throw createAppError(
      'Media URL must be an upload issued for your account or an inline data URL',
      400,
      'MEDIA_URL_NOT_ALLOWED',
    );
  }
}


// ============================================================================
// Phase 1B — kind-aware short-lived signing for snap/story media.
//
// Snap/story view URLs live at most SNAP_VIEW_URL_EXPIRY_SECONDS (default
// 15 minutes, hard-capped at 1 hour) and must never be served with
// long/permanent CDN cache headers ('private, no-store' always). Every
// other media kind keeps the existing long-lived behaviour.
// ============================================================================

/**
 * Media kinds for kind-aware URL policy (Phase 1B). Only 'snap' and
 * 'story' carry the disappearing guarantee; every other kind keeps the
 * existing long-lived behaviour.
 */
export type SnapMediaKind = 'snap' | 'story' | 'attachment' | 'profile' | 'avatar';

/** Kinds whose view URLs are short-lived and never cacheable. */
export const SNAP_MEDIA_KINDS: ReadonlySet<SnapMediaKind> = new Set(['snap', 'story']);

/** Default snap/story view-URL lifetime: 15 minutes. */
export const DEFAULT_SNAP_VIEW_URL_EXPIRY_SECONDS = 15 * 60;

/**
 * Hard cap for any snap/story view URL: 1 hour. assertSnapViewUrlShortLived
 * fails closed beyond this no matter what the env config says.
 */
export const SNAP_VIEW_URL_HARD_CAP_SECONDS = 60 * 60;

/**
 * Configured snap/story view-URL expiry. SNAP_VIEW_URL_EXPIRY_SECONDS env
 * (seconds, integer); falls back to the 15-minute default on missing or
 * out-of-range values. Read fresh on each call so tests can vary env.
 */
export function snapViewUrlExpirySeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['SNAP_VIEW_URL_EXPIRY_SECONDS'];
  const parsed = raw === undefined ? NaN : Number(raw);
  if (
    Number.isInteger(parsed) &&
    parsed > 0 &&
    parsed <= SNAP_VIEW_URL_HARD_CAP_SECONDS
  ) {
    return parsed;
  }
  return DEFAULT_SNAP_VIEW_URL_EXPIRY_SECONDS;
}

/**
 * Cache policy for snap/story media responses: NEVER cacheable — not by the
 * CDN, not by the client. Issuers must send this verbatim on any response
 * that carries snap bytes or a snap view URL.
 */
export const SNAP_NO_STORE_CACHE_CONTROL = 'private, no-store';

/**
 * Full response-header set for snap/story media. Apply on the media fetch
 * route and anywhere a snap view URL is minted.
 */
export function snapMediaResponseHeaders(): Record<string, string> {
  return {
    'Cache-Control': SNAP_NO_STORE_CACHE_CONTROL,
    'Content-Disposition': 'inline',
  };
}

/**
 * Guard for snap/story view-URL issuance: fails closed (500) when a
 * snap/story URL would live longer than the hard cap, or when the expiry
 * is not a positive integer. Call before minting any snap/story view URL.
 */
export function assertSnapViewUrlShortLived(
  expiresInSeconds: number,
  kind: SnapMediaKind,
): void {
  if (!SNAP_MEDIA_KINDS.has(kind)) return;
  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds <= 0 ||
    expiresInSeconds > SNAP_VIEW_URL_HARD_CAP_SECONDS
  ) {
    throw createAppError(
      'Snap view URL expiry out of bounds — refusing to issue a long-lived snap URL',
      500,
      'SNAP_URL_EXPIRY_INVALID',
    );
  }
}

/** True when the kind carries the disappearing guarantee (snap/story). */
export function isDisappearingMediaKind(kind: SnapMediaKind): boolean {
  return SNAP_MEDIA_KINDS.has(kind);
}
