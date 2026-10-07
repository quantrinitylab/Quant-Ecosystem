// ============================================================================
// Auth Package - Types
// ============================================================================

import type { QuantApp, PermissionScope } from '@quant/common';

/** Auth configuration */
export interface AuthConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  issuer: string;
  audience: string;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

/** JWT token payload */
export interface TokenPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
  scopes: PermissionScope[];
  app: QuantApp;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti: string;
  /**
   * Epoch seconds of the last *strong* authentication: a password login or a
   * completed MFA verification. Silent refresh rotation never updates it.
   * Consumed by step-up guards (`requireStepUp`) to decide whether a
   * sensitive action needs the holder to re-authenticate. Absent on tokens
   * minted before step-up support — guards treat that as stale (fail closed).
   */
  lastStrongAuthAt?: number;
}

/** Refresh token payload */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  family: string;
  iat: number;
  exp: number;
  /**
   * Carried forward unchanged on every rotation so the access tokens minted
   * from a refresh keep the session's original strong-auth timestamp.
   */
  lastStrongAuthAt?: number;
}

/** Token pair */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

/** Login request */
export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
  twoFactorCode?: string;
  deviceInfo?: DeviceLoginInfo;
}

/** Registration request */
export interface RegisterRequest {
  email: string;
  username: string;
  displayName: string;
  password: string;
  phoneNumber?: string;
  acceptedTerms: boolean;
}

/** Device info for login */
export interface DeviceLoginInfo {
  deviceId: string;
  platform: 'web' | 'ios' | 'android' | 'desktop';
  userAgent: string;
  ipAddress: string;
}

/** OAuth2 client application */
export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  name: string;
  description: string;
  redirectUris: string[];
  allowedScopes: PermissionScope[];
  grantTypes: OAuthGrantType[];
  isFirstParty: boolean;
  app: QuantApp;
}

/** OAuth2 grant types */
export type OAuthGrantType = 'authorization_code' | 'refresh_token' | 'client_credentials';

/** OAuth2 authorization request */
export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: 'code';
  scope: string;
  state: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'plain' | 'S256';
  nonce?: string;
}

/** OAuth2 authorization code */
export interface AuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: Date;
  nonce?: string;
}

/** OAuth2 token exchange request */
export interface TokenExchangeRequest {
  grantType: 'authorization_code' | 'refresh_token';
  code?: string;
  redirectUri?: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier?: string;
  refreshToken?: string;
}

/** Phone authentication request */
export interface PhoneAuthRequest {
  phoneNumber: string;
  verificationCode?: string;
}

/** Phone verification state */
export interface PhoneVerification {
  phoneNumber: string;
  code: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
}

/** Session data */
export interface AuthSession {
  id: string;
  userId: string;
  tokenId: string;
  refreshTokenFamily: string;
  deviceInfo: DeviceLoginInfo;
  app: QuantApp;
  isActive: boolean;
  lastActivityAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

/** Auth middleware context (attached to request) */
export interface AuthContext {
  userId: string;
  email: string;
  username: string;
  role: string;
  scopes: PermissionScope[];
  sessionId: string;
  app: QuantApp;
  tokenId: string;
  /**
   * Epoch seconds of the last strong authentication (password login or MFA
   * verification), mirrored from the access token's `lastStrongAuthAt` claim.
   * Undefined when the token predates step-up support — treat as stale.
   */
  lastStrongAuthAt?: number;
}

/** Password reset request */
export interface PasswordResetRequest {
  email: string;
}

/** Password reset confirmation */
export interface PasswordResetConfirmation {
  token: string;
  newPassword: string;
}

/** Two-factor authentication setup */
export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

/** Auth event for audit logging */
export interface AuthEvent {
  type: AuthEventType;
  userId: string;
  ipAddress: string;
  userAgent: string;
  app: QuantApp;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/** Auth event types */
export type AuthEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'register'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'password_changed'
  | 'email_verified'
  | 'phone_verified'
  | '2fa_enabled'
  | '2fa_disabled'
  | 'session_revoked'
  | 'oauth_authorized'
  | 'oauth_revoked'
  | 'account_locked'
  | 'account_unlocked';

// ============================================================================
// WebAuthn Types
// ============================================================================

/** Stored WebAuthn credential */
export interface WebAuthnCredential {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  createdAt: Date;
  name?: string;
}

// ============================================================================
// Recovery & Two-Factor Types
// ============================================================================

/** Recovery code entry */
export interface RecoveryCode {
  code: string;
  usedAt?: Date;
}

/** Two-factor authentication methods */
export type TwoFactorMethod = 'totp' | 'webauthn' | 'phone' | 'backup_code';

// ============================================================================
// Federated Identity Types
// ============================================================================

/** Third-party OAuth2 client registration (Sign in with Quant) */
export interface FederatedClient {
  clientId: string;
  clientSecret: string;
  name: string;
  logo?: string;
  website: string;
  redirectUris: string[];
  allowedScopes: string[];
  createdBy: string;
  createdAt: Date;
}

// ============================================================================
// Travel Mode Types
// ============================================================================

/** Travel mode configuration */
export interface TravelModeConfig {
  enabled: boolean;
  restrictedRegions: string[];
  allowedDeviceIds: string[];
}

// ============================================================================
// Account Lifecycle Types
// ============================================================================

/** Account deletion request */
export interface AccountDeletionRequest {
  userId: string;
  requestedAt: Date;
  scheduledPurgeAt: Date;
  status: 'pending' | 'cancelled' | 'purged';
}
