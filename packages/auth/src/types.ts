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
}

/** Refresh token payload */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  family: string;
  iat: number;
  exp: number;
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
