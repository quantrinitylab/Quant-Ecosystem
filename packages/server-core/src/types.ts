import type { FastifyRequest } from 'fastify';
import type { AuthContext } from '@quant/auth';

export interface AppConfig {
  port: number;
  host: string;
  logLevel: string;
  corsOrigins: string[];
  rateLimitMax: number;
  rateLimitWindow: string;
  redisUrl?: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  env: 'development' | 'production' | 'test';
  /**
   * Extra URL path rules that bypass or relax the global auth hook (in addition to
   * the built-in health/metrics paths). Use for pre-authentication endpoints
   * (e.g. login/OTP) or public read routes (e.g. GET /videos).
   * Exact matching is enforced by default to prevent prefix bypass leaks (W32-6).
   */
  publicPaths?: PublicPathEntry[];
}

export interface PublicPathRule {
  path: string;
  methods?: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | string>;
  exact?: boolean;
}

export type PublicPathEntry = string | PublicPathRule;

export interface AuthenticatedRequest extends FastifyRequest {
  auth: AuthContext;
}
