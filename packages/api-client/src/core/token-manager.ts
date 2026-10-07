// ============================================================================
// API Client SDK - Token Manager
// ============================================================================

export interface TokenManagerConfig {
  /** localStorage key for access token (default: 'token') */
  storageKey?: string;
  /** localStorage key for refresh token (default: 'refreshToken') */
  refreshStorageKey?: string;
  /** Whether to persist tokens to localStorage (default: true in browser) */
  persist?: boolean;
  /** Callback when tokens change */
  onTokenChange?: (tokens: { accessToken: string | null; refreshToken: string | null }) => void;
}

/**
 * Cross-app token manager that stores access/refresh tokens in memory
 * with optional localStorage persistence. Uses the same 'token' key that
 * existing apps read from (e.g., apps/quantchat/src/lib/auth.ts).
 */
export class TokenManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private storageKey: string;
  private refreshStorageKey: string;
  private persist: boolean;
  public onTokenChange?: TokenManagerConfig['onTokenChange'];

  constructor(config: TokenManagerConfig = {}) {
    this.storageKey = config.storageKey || 'token';
    this.refreshStorageKey = config.refreshStorageKey || 'refreshToken';
    this.persist = config.persist !== undefined ? config.persist : true;
    this.onTokenChange = config.onTokenChange;

    // Hydrate from localStorage if available
    if (this.persist && this.isBrowser()) {
      this.accessToken = localStorage.getItem(this.storageKey);
      this.refreshToken = localStorage.getItem(this.refreshStorageKey);
    }
  }

  /**
   * Set access and optionally refresh token
   */
  setTokens(accessToken: string, refreshToken?: string): void {
    this.accessToken = accessToken;
    if (refreshToken !== undefined) {
      this.refreshToken = refreshToken;
    }

    if (this.persist && this.isBrowser()) {
      localStorage.setItem(this.storageKey, accessToken);
      if (refreshToken !== undefined) {
        localStorage.setItem(this.refreshStorageKey, refreshToken);
      }
    }

    this.notifyChange();
  }

  /**
   * Get the current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get the current refresh token
   */
  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /**
   * Clear all tokens from memory and storage
   */
  clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;

    if (this.persist && this.isBrowser()) {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.refreshStorageKey);
    }

    this.notifyChange();
  }

  /**
   * Check if user is authenticated (has an access token)
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /**
   * Factory method for easy instantiation
   */
  static create(config: TokenManagerConfig = {}): TokenManager {
    return new TokenManager(config);
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private notifyChange(): void {
    if (this.onTokenChange) {
      this.onTokenChange({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
      });
    }
  }
}
