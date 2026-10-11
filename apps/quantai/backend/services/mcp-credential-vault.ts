// ============================================================================
// QuantAI — MCP connector credential vault (AES-256-GCM sealed storage)
//
// Root-cause fix for F-003 ("MCP connector credentials stored plaintext in a
// process Map"): `McpConnectorsService` used to keep every installation's full
// config — Stripe sk_live_ keys, OAuth client secrets, PATs, session cookies —
// as plaintext in a long-lived in-memory Map reachable via getInstallation().
// That Map now holds ONLY ciphertext: secret config values are sealed with
// AES-256-GCM at install time, and plaintext is recovered transiently, per
// call, by resolveCredentials(). Nothing credential-shaped ever sits in the
// Map in the clear — not in `installations`, not in API responses, not in logs.
//
// Key management: the key-encryption key (KEK) comes from the
// `MCP_CREDENTIAL_KEY` env var (optionally `MCP_CREDENTIAL_KEYS` — a
// comma-separated chain whose first entry is active — plus
// `MCP_CREDENTIAL_KEY_PREVIOUS` for decrypt-only retired keys after rotation).
// Production fails closed when the KEK is missing or too short; non-production
// environments fall back to an ephemeral per-process key with a loud warning
// (dev/test convenience only — never persisted, never logged).
//
// Per-bundle salt + scrypt KDF + random IV: even two identical secrets seal to
// different ciphertext. Key rotation re-seals every stored bundle with the new
// KEK (see `McpConnectorsService.rotateCredentialKey`).
// ============================================================================

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { createAppError } from '@quant/server-core';

export const CREDENTIAL_KEY_ENV = 'MCP_CREDENTIAL_KEY';
export const CREDENTIAL_KEYS_ENV = 'MCP_CREDENTIAL_KEYS';
export const CREDENTIAL_KEY_PREVIOUS_ENV = 'MCP_CREDENTIAL_KEY_PREVIOUS';
export const MIN_CREDENTIAL_KEY_LENGTH = 32;

/** Ciphertext envelope stored in place of a plaintext secret bundle. */
export interface SealedSecretBundle {
  version: 1;
  /** Which KEK sealed this bundle — used to pick the decryption key. */
  keyId: string;
  alg: 'aes-256-gcm';
  /** base64 scrypt salt */
  salt: string;
  /** base64 IV */
  iv: string;
  /** base64 ciphertext */
  ciphertext: string;
  /** base64 GCM auth tag */
  tag: string;
}

/** One resolved key-encryption key. `keys[0]` is always the active sealer. */
export interface CredentialKeyMaterial {
  keyId: string;
  kek: Buffer;
  /** True only for the non-production ephemeral fallback. */
  ephemeral: boolean;
}

let ephemeralWarningLogged = false;

/**
 * Same secret-field heuristic as `maskConfig` in mcp-connectors.service.ts:
 * `password` fields plus secret/key/token/cookie-bearing config keys.
 */
export function isSecretConfigKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('passwd') ||
    lower.includes('token') ||
    lower.includes('cookie') ||
    lower.includes('key')
  );
}

/**
 * Split a connector config into non-secret values (safe to keep in the clear)
 * and secret values (must be sealed). `fields` lets callers also treat
 * catalog `type: 'password'` fields as secret even when the key name is bland.
 */
export function splitSecretConfig(
  config: Record<string, unknown>,
  fields?: Array<{ key: string; type: 'text' | 'password' | 'url' }>,
): { publicConfig: Record<string, unknown>; secrets: Record<string, unknown> } {
  const passwordKeys = new Set(
    (fields ?? []).filter((f) => f.type === 'password').map((f) => f.key),
  );
  const publicConfig: Record<string, unknown> = {};
  const secrets: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (passwordKeys.has(key) || isSecretConfigKey(key)) {
      secrets[key] = value;
    } else {
      publicConfig[key] = value;
    }
  }
  return { publicConfig, secrets };
}

function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

function assertKeyLength(raw: string, source: string): void {
  if (raw.length < MIN_CREDENTIAL_KEY_LENGTH) {
    throw createAppError(
      `${source} must be at least ${MIN_CREDENTIAL_KEY_LENGTH} characters; ` +
        'refusing to seal credentials with a weak key',
      500,
      'CREDENTIAL_KEY_MISCONFIGURED',
    );
  }
}

function parseKeyChain(raw: string, defaultKeyId: string): Array<{ keyId: string; raw: string }> {
  return raw
    .split(',')
    .map((part, index) => ({ keyId: index === 0 ? defaultKeyId : `${defaultKeyId}:prev${index}`, raw: part.trim() }))
    .filter((entry) => entry.raw.length > 0);
}

/**
 * Resolve the KEK chain. Throws (fail-closed) when production lacks a usable
 * key. In non-production, falls back to an ephemeral per-process key so local
 * dev and tests keep working without env wiring.
 */
export function resolveCredentialKeys(options?: {
  credentialKey?: string;
  credentialKeys?: string[];
  credentialKeyId?: string;
}): CredentialKeyMaterial[] {
  const keyId = options?.credentialKeyId ?? 'mcp-credential-key';
  const chain: Array<{ keyId: string; raw: string }> = [];

  if (options?.credentialKeys && options.credentialKeys.length > 0) {
    options.credentialKeys.forEach((raw, index) => {
      chain.push({ keyId: index === 0 ? keyId : `${keyId}:prev${index}`, raw });
    });
  } else if (options?.credentialKey) {
    chain.push({ keyId, raw: options.credentialKey });
  } else {
    const envChain = process.env[CREDENTIAL_KEYS_ENV];
    if (envChain && envChain.trim().length > 0) {
      chain.push(...parseKeyChain(envChain, keyId));
    } else {
      const envKey = process.env[CREDENTIAL_KEY_ENV];
      if (envKey && envKey.trim().length > 0) {
        chain.push({ keyId, raw: envKey.trim() });
      }
      const previous = process.env[CREDENTIAL_KEY_PREVIOUS_ENV];
      if (previous && previous.trim().length > 0) {
        chain.push({ keyId: `${keyId}:previous`, raw: previous.trim() });
      }
    }
  }

  if (chain.length === 0) {
    if (isProduction()) {
      throw createAppError(
        `${CREDENTIAL_KEY_ENV} is not set — refusing to store connector ` +
          'credentials without an encryption key',
        500,
        'CREDENTIAL_KEY_MISCONFIGURED',
      );
    }
    if (!ephemeralWarningLogged) {
      ephemeralWarningLogged = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[mcp-credential-vault] ${CREDENTIAL_KEY_ENV} is not set — using an ` +
          'ephemeral per-process key. Stored connector credentials will NOT ' +
          'survive a restart and are only as safe as process memory. Set ' +
          `${CREDENTIAL_KEY_ENV} (>= ${MIN_CREDENTIAL_KEY_LENGTH} chars) for real protection.`,
      );
    }
    return [{ keyId: `${keyId}:ephemeral`, kek: randomBytes(32), ephemeral: true }];
  }

  for (const entry of chain) {
    assertKeyLength(entry.raw, entry.keyId === keyId ? CREDENTIAL_KEY_ENV : entry.keyId);
  }
  return chain.map((entry) => ({
    keyId: entry.keyId,
    kek: Buffer.from(entry.raw, 'utf8'),
    ephemeral: false,
  }));
}

/** Derive a 256-bit data key from the KEK with a per-bundle salt. */
export function deriveDataKey(kek: Buffer, salt: Buffer): Buffer {
  return scryptSync(kek, salt, 32);
}

/** Seal a secret object with the active KEK. Deterministic only in failure. */
export function sealSecrets(
  secrets: Record<string, unknown>,
  activeKey: CredentialKeyMaterial,
): SealedSecretBundle {
  const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const dek = deriveDataKey(activeKey.kek, salt);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Best-effort: drop key material references from this stack frame.
  dek.fill(0);
  return {
    version: 1,
    keyId: activeKey.keyId,
    alg: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Open a sealed bundle. Tries the sealing key first (keyId match), then every
 * other known key so retired keys keep working after rotation/restart.
 * Throws on tampering or when no known key opens the bundle.
 */
export function openSecrets(
  bundle: SealedSecretBundle,
  keys: CredentialKeyMaterial[],
): Record<string, unknown> {
  if (!bundle || bundle.version !== 1 || bundle.alg !== 'aes-256-gcm') {
    throw createAppError('Unsupported sealed-secret bundle', 500, 'SEALED_BUNDLE_INVALID');
  }
  const ordered = [...keys].sort((a, b) =>
    a.keyId === bundle.keyId ? -1 : b.keyId === bundle.keyId ? 1 : 0,
  );
  const salt = Buffer.from(bundle.salt, 'base64');
  const iv = Buffer.from(bundle.iv, 'base64');
  const ciphertext = Buffer.from(bundle.ciphertext, 'base64');
  const tag = Buffer.from(bundle.tag, 'base64');

  let lastError: unknown = null;
  for (const key of ordered) {
    try {
      const dek = deriveDataKey(key.kek, salt);
      const decipher = createDecipheriv('aes-256-gcm', dek, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      dek.fill(0);
      const parsed = JSON.parse(plaintext.toString('utf8')) as unknown;
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('sealed payload is not an object');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      lastError = error;
    }
  }
  throw createAppError(
    'Unable to decrypt stored connector credentials: no known key opens the bundle ' +
      '(wrong key, or tampered ciphertext)',
    500,
    'SEALED_BUNDLE_UNOPENABLE',
    // Never include key material; the cause is a crypto error, safe to carry.
    lastError instanceof Error ? { cause: lastError.message } : undefined,
  );
}

/**
 * Test assertion helper: proves a candidate secret does NOT appear in a
 * stored bundle's serialized ciphertext (sanity check, not a security
 * boundary — AES-GCM output is indistinguishable from random by design).
 */
export function bundleContains(bundle: SealedSecretBundle, needle: string): boolean {
  if (needle.length === 0) return false;
  return JSON.stringify(bundle).includes(needle);
}
