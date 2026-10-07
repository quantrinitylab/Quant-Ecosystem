// ============================================================================
// Auth - WebAuthn Passkey Service
// ============================================================================

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import type { WebAuthnCredential } from '../types';

/** Registration options returned to the client */
export interface WebAuthnRegistrationOptions {
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}

/** Authentication options returned to the client */
export interface WebAuthnAuthenticationOptions {
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
}

/**
 * WebAuthn Service
 *
 * Provides passkey registration and authentication support.
 * Uses @simplewebauthn/server for FIDO2/WebAuthn operations.
 */
export class WebAuthnService {
  private challenges: Map<string, string> = new Map();
  private credentialStore: Map<string, WebAuthnCredential[]> = new Map();
  private rpName: string;
  private rpID: string;

  constructor(rpName: string = 'Quant', rpID: string = 'quant.app') {
    this.rpName = rpName;
    this.rpID = rpID;
  }

  /**
   * Generate registration options for a new passkey
   */
  async generateRegistrationOpts(
    userId: string,
    username: string,
    existingCredentials: WebAuthnCredential[] = [],
  ): Promise<WebAuthnRegistrationOptions> {
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userName: username,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store the challenge for verification
    this.challenges.set(userId, options.challenge);

    return { options };
  }

  /**
   * Verify a registration response from the client
   */
  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    expectedOrigin: string,
    expectedRPID?: string,
  ): Promise<{ verified: boolean; credential?: WebAuthnCredential }> {
    const expectedChallenge = this.challenges.get(userId);
    if (!expectedChallenge) {
      return { verified: false };
    }

    // Clean up challenge
    this.challenges.delete(userId);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: expectedRPID ?? this.rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return { verified: false };
    }

    const { credential } = verification.registrationInfo;
    const webAuthnCredential: WebAuthnCredential = {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: (response.response.transports ?? []) as string[],
      createdAt: new Date(),
    };

    // Store in credential store
    const userCredentials = this.credentialStore.get(userId) ?? [];
    userCredentials.push(webAuthnCredential);
    this.credentialStore.set(userId, userCredentials);

    return { verified: true, credential: webAuthnCredential };
  }

  /**
   * Generate authentication options for an existing passkey
   */
  async generateAuthenticationOpts(
    userId: string,
    existingCredentials: WebAuthnCredential[] = [],
  ): Promise<WebAuthnAuthenticationOptions> {
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      })),
      userVerification: 'preferred',
    });

    // Store the challenge for verification
    this.challenges.set(userId, options.challenge);

    return { options };
  }

  /**
   * Verify an authentication response from the client
   */
  async verifyAuthentication(
    userId: string,
    response: AuthenticationResponseJSON,
    expectedOrigin: string,
    credential: WebAuthnCredential,
    expectedRPID?: string,
  ): Promise<{ verified: boolean; newCounter?: number }> {
    const expectedChallenge = this.challenges.get(userId);
    if (!expectedChallenge) {
      return { verified: false };
    }

    // Clean up challenge
    this.challenges.delete(userId);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: expectedRPID ?? this.rpID,
      credential: {
        id: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey, 'base64url'),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
    });

    if (!verification.verified) {
      return { verified: false };
    }

    return {
      verified: true,
      newCounter: verification.authenticationInfo.newCounter,
    };
  }

  /**
   * List all credentials for a user
   */
  listCredentials(userId: string): WebAuthnCredential[] {
    return this.credentialStore.get(userId) ?? [];
  }

  /**
   * Remove a credential for a user
   */
  removeCredential(userId: string, credentialId: string): boolean {
    const credentials = this.credentialStore.get(userId);
    if (!credentials) return false;

    const index = credentials.findIndex((c) => c.credentialId === credentialId);
    if (index === -1) return false;

    credentials.splice(index, 1);
    this.credentialStore.set(userId, credentials);
    return true;
  }

  /**
   * Rename a credential for a user
   */
  renameCredential(userId: string, credentialId: string, name: string): boolean {
    const credentials = this.credentialStore.get(userId);
    if (!credentials) return false;

    const credential = credentials.find((c) => c.credentialId === credentialId);
    if (!credential) return false;

    credential.name = name;
    return true;
  }
}
