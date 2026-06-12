function requireSecret(envVar: string, devFallback: string): string {
  const value = process.env[envVar];
  if (process.env.NODE_ENV === 'production') {
    if (!value || value.length < 32) {
      throw new Error(`${envVar} must be set to a value of at least 32 characters in production`);
    }
    return value;
  }
  if (!value) {
    globalThis.console.warn(
      `[SECURITY] ${envVar} not set - using dev-only fallback. NEVER use in production.`,
    );
    return devFallback;
  }
  return value;
}

export function getJwtSecret(): string {
  return requireSecret('JWT_SECRET', 'dev-only-insecure-jwt-secret-not-for-production-use-000');
}

export function getJwtRefreshSecret(): string {
  return requireSecret(
    'JWT_REFRESH_SECRET',
    'dev-only-insecure-refresh-secret-not-for-production-000',
  );
}
