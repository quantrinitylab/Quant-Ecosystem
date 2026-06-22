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
   * Extra URL path prefixes that bypass the global auth hook (in addition to
   * the built-in health/metrics paths). Use for pre-authentication endpoints
   * such as login / OTP request+verify. Each entry matches the path exactly or
   * as a prefix segment (e.g. '/auth/otp' matches '/auth/otp/request').
   */
  publicPaths?: string[];
}

export interface AuthenticatedRequest extends FastifyRequest {
  auth: AuthContext;
}
