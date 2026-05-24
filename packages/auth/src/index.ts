// ============================================================================
// @quant/auth - Authentication and Authorization
// ============================================================================

// Types
export * from './types';

// Providers
export { QuantMailProvider } from './providers/quantmail-provider';
export { PhoneAuthProvider } from './providers/phone-provider';
export type { PhoneAuthConfig, SMSDeliveryResult } from './providers/phone-provider';

// Services
export { TokenService } from './services/token-service';
export { SessionService } from './services/session-service';
export type { CreateSessionOptions } from './services/session-service';

// Middleware
export { AuthMiddleware, createAuthMiddleware } from './middleware/auth-middleware';
export type { AuthRequest, AuthResponse, NextFunction, AuthMiddlewareOptions } from './middleware/auth-middleware';
