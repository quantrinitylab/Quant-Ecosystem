// ============================================================================
// Passkey (WebAuthn) browser client — no new dependency.
//
// The server speaks plain WebAuthn JSON (options from
// POST /auth/passkeys/*/options, responses back to the matching /verify).
// This module only translates between that JSON and the browser's
// navigator.credentials API: base64url <-> ArrayBuffer conversions and
// response serialisation. It deliberately does NOT import a WebAuthn
// helper library — the translation is ~40 lines, and a dependency would
// have to survive the frozen-lockfile CI install.
//
// Security note: nothing here ever touches a private key. The browser and
// the authenticator hold that; this code only forwards the public
// challenge/response. A "passkey" that this module could mint on its own
// would be worthless, which is the whole point of the protocol.
// ============================================================================

/** A passkey ceremony the browser refused or the user cancelled. */
export class PasskeyCancelledError extends Error {
  constructor() {
    super('Passkey sign-in was cancelled.');
    this.name = 'PasskeyCancelledError';
  }
}

export function base64urlToBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * True when this browser can run a WebAuthn ceremony at all. Checked at
 * render time (never at module scope) so server rendering and browsers
 * without WebAuthn both get `false` instead of a crash — the login form
 * hides the passkey button on that answer rather than offering a dead one.
 */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  );
}

function asPasskeyError(error: unknown): Error {
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
    return new PasskeyCancelledError();
  }
  return error instanceof Error ? error : new Error('Passkey sign-in failed. Try again.');
}

export interface PasskeyRegistrationOptionsJSON {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  excludeCredentials?: { id: string; type: string; transports?: string[] }[];
  timeout?: number;
  authenticatorSelection?: Record<string, unknown>;
  attestation?: string;
  extensions?: Record<string, unknown>;
}

export interface PasskeyAuthenticationOptionsJSON {
  challenge: string;
  rpId: string;
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
  timeout?: number;
  userVerification?: string;
  extensions?: Record<string, unknown>;
}

export interface PasskeyRegistrationResponseJSON {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
}

export interface PasskeyAuthenticationResponseJSON {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string | null;
  };
}

/** Run navigator.credentials.create for a server-issued registration. */
export async function startPasskeyRegistration(
  options: PasskeyRegistrationOptionsJSON,
): Promise<PasskeyRegistrationResponseJSON> {
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: base64urlToBuffer(options.challenge),
        rp: options.rp,
        user: {
          id: base64urlToBuffer(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams.map((param) => ({
          type: 'public-key' as const,
          alg: param.alg,
        })),
        excludeCredentials: (options.excludeCredentials ?? []).map((cred) => ({
          id: base64urlToBuffer(cred.id),
          type: 'public-key' as const,
          transports: cred.transports as AuthenticatorTransport[] | undefined,
        })),
        timeout: options.timeout,
        authenticatorSelection: options.authenticatorSelection as
          | AuthenticatorSelectionCriteria
          | undefined,
        attestation: options.attestation as AttestationConveyancePreference | undefined,
      },
    })) as PublicKeyCredential | null;
    if (!credential || !(credential.response instanceof AuthenticatorAttestationResponse)) {
      throw new Error('The authenticator did not return a passkey.');
    }
    const response = credential.response;
    return {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
        attestationObject: bufferToBase64url(response.attestationObject),
        transports:
          typeof response.getTransports === 'function' ? response.getTransports() : undefined,
      },
    };
  } catch (error) {
    throw asPasskeyError(error);
  }
}

/** Run navigator.credentials.get for a server-issued authentication. */
export async function startPasskeyAuthentication(
  options: PasskeyAuthenticationOptionsJSON,
): Promise<PasskeyAuthenticationResponseJSON> {
  try {
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: base64urlToBuffer(options.challenge),
        rpId: options.rpId,
        allowCredentials: (options.allowCredentials ?? []).map((cred) => ({
          id: base64urlToBuffer(cred.id),
          type: 'public-key' as const,
          transports: cred.transports as AuthenticatorTransport[] | undefined,
        })),
        timeout: options.timeout,
        userVerification: options.userVerification as UserVerificationRequirement | undefined,
      },
    })) as PublicKeyCredential | null;
    if (!credential || !(credential.response instanceof AuthenticatorAssertionResponse)) {
      throw new Error('The authenticator did not return a passkey assertion.');
    }
    const response = credential.response;
    return {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
        authenticatorData: bufferToBase64url(response.authenticatorData),
        signature: bufferToBase64url(response.signature),
        userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
      },
    };
  } catch (error) {
    throw asPasskeyError(error);
  }
}
