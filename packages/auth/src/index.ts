// ============================================================================
// @quant/auth - Authentication and Authorization
// ============================================================================

// Types
export * from './types';

// Crypto utilities
export {
  generateSecureToken,
  generateSecureCode,
  generateId,
  PasswordService,
  passwordService,
  generateCodeVerifier,
  generateCodeChallenge,
  validateCodeChallenge,
  TOTPService,
  totpService,
} from './crypto';

// Providers
export { QuantMailProvider } from './providers/quantmail-provider';
export { PhoneAuthProvider } from './providers/phone-provider';
export type { PhoneAuthConfig, SMSDeliveryResult } from './providers/phone-provider';

// Services
export { TokenService } from './services/token-service';
export type { TokenServiceOptions } from './services/token-service';
export {
  generatePersonalAccessToken,
  verifyPersonalAccessToken,
} from './services/personal-access-token.service';
export type {
  GeneratedPersonalAccessToken,
  PersonalAccessTokenScope,
  VerifiedPersonalAccessToken,
} from './services/personal-access-token.service';
export { getJwtSecret, getJwtRefreshSecret } from './lib/secrets';
export { EnvConfigJwtKms, VaultJwtKms, deriveKid } from './lib/jwt-kms';
export type {
  JwtKms,
  JwtKeyPurpose,
  JwtKeyVersion,
  SecretVaultPort,
  EnvConfigJwtKmsOptions,
} from './lib/jwt-kms';
export { SessionService } from './services/session-service';
export type { CreateSessionOptions } from './services/session-service';
export { WebAuthnService } from './services/webauthn-service';
export type {
  WebAuthnRegistrationOptions,
  WebAuthnAuthenticationOptions,
} from './services/webauthn-service';
export { FederatedIdentityService } from './services/federated-identity-service';
export type { FederatedClientConfig } from './services/federated-identity-service';
export { TravelModeService } from './services/travel-mode-service';
export type { AccessRequestContext } from './services/travel-mode-service';
export { AccountLifecycleService } from './services/account-lifecycle-service';
export type {
  VacationResponder,
  AccountExportData,
  PurgeableService,
} from './services/account-lifecycle-service';
export { SignInWithQuantSDK } from './services/sign-in-with-quant-sdk';
export type {
  QuantUserProfile,
  AuthUrlResult,
  SDKTokenResponse,
} from './services/sign-in-with-quant-sdk';

// Middleware
export { AuthMiddleware, createAuthMiddleware } from './middleware/auth-middleware';
export type {
  AuthRequest,
  AuthResponse,
  NextFunction,
  AuthMiddlewareOptions,
} from './middleware/auth-middleware';
export { SSOMiddleware } from './middleware/sso-middleware';
export type {
  CrossAppValidationResult,
  CrossAppSessionResult,
  LogoutPropagationResult,
} from './middleware/sso-middleware';

// E2E Encryption
export * from './e2e';
