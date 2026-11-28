// ============================================================================
// Auth - Passkey (WebAuthn) ceremony helpers, stateless.
//
// Why this module exists, and why it is NOT `services/webauthn-service.ts`:
// that service keeps challenges AND credentials in process-memory Maps. A
// restart wipes every pending challenge, a second replica never sees the
// first one's challenges, and credentials registered through it are never
// persisted — so a passkey that "works" in one process is gone after a
// deploy. It is also never mounted by any QuantMail route, which is why the
// login page still offers only email+password + TOTP.
//
// This module is deliberately stateless: it only builds options and verifies
// responses through @simplewebauthn/server (already a dependency of this
// package — no new dependency, no lockfile change). Challenge issuance and
// credential persistence live with the caller (QuantMail backend): challenges
// ride in a signed, short-lived JWT (see backend/lib/passkeys.ts), and
// credentials live in the PasskeyCredential table. Nothing here remembers
// anything between calls, so it is safe across restarts and replicas.
//
// Relying-party values are caller-supplied, never defaulted to a guess: an
// rpID of 'quant.app' (the old service's default) would make every ceremony
// fail on quantmail.in, and silently defaulting hides that failure mode.
// ============================================================================

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

/** The subset of a stored credential the ceremonies need. Storage-agnostic. */
export interface PasskeyCredentialInput {
  credentialId: string;
  /** Public key as base64url (the form stored in PasskeyCredential). */
  publicKey: string;
  counter: number;
  transports: string[];
}

/** A credential as verified by the registration ceremony, ready to store. */
export interface VerifiedPasskeyCredential {
  credentialId: string;
  /** Public key as base64url — never a private key; nothing secret here. */
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
}

export async function generatePasskeyRegistrationOptions(input: {
  rpName: string;
  rpID: string;
  userName: string;
  userDisplayName: string;
  /** Stable account id, stored by the authenticator as the user handle. */
  userId: string;
  /** Existing credentials, excluded so the same authenticator can't re-register. */
  excludeCredentials: PasskeyCredentialInput[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: input.rpName,
    rpID: input.rpID,
    userName: input.userName,
    userDisplayName: input.userDisplayName,
    userID: new TextEncoder().encode(input.userId),
    attestationType: 'none',
    excludeCredentials: input.excludeCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
}

export async function verifyPasskeyRegistration(input: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
}): Promise<{ verified: boolean; credential?: VerifiedPasskeyCredential }> {
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.expectedOrigin,
      expectedRPID: input.expectedRPID,
    });
  } catch {
    // A malformed response is a failed verification, not a 500.
    return { verified: false };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false };
  }
  const { credential } = verification.registrationInfo;
  return {
    verified: true,
    credential: {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: (input.response.response.transports ?? []) as string[],
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
    },
  };
}

export async function generatePasskeyAuthenticationOptions(input: {
  rpID: string;
  allowCredentials: PasskeyCredentialInput[];
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: input.rpID,
    allowCredentials: input.allowCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports as AuthenticatorTransportFuture[],
    })),
    // 'preferred', not 'required': a passkey without user verification is
    // still possession proof. The caller branches on `userVerified` below —
    // a non-UV assertion on a TOTP-protected account falls through to the
    // existing TOTP challenge instead of minting a session outright.
    userVerification: 'preferred',
  });
}

export async function verifyPasskeyAuthentication(input: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: PasskeyCredentialInput;
}): Promise<{
  verified: boolean;
  newCounter?: number;
  userVerified?: boolean;
  credentialDeviceType?: string;
  credentialBackedUp?: boolean;
}> {
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.expectedOrigin,
      expectedRPID: input.expectedRPID,
      credential: {
        id: input.credential.credentialId,
        publicKey: Buffer.from(input.credential.publicKey, 'base64url'),
        counter: input.credential.counter,
        transports: input.credential.transports as AuthenticatorTransportFuture[],
      },
      // Deliberately NOT requireUserVerification: the caller needs the
      // userVerified flag to decide (session vs TOTP fall-through), and
      // enforcing it here would collapse that decision into a bare failure.
      requireUserVerification: false,
    });
  } catch {
    return { verified: false };
  }
  if (!verification.verified) {
    return { verified: false };
  }
  return {
    verified: true,
    newCounter: verification.authenticationInfo.newCounter,
    userVerified: verification.authenticationInfo.userVerified,
    credentialDeviceType: verification.authenticationInfo.credentialDeviceType,
    credentialBackedUp: verification.authenticationInfo.credentialBackedUp,
  };
}
