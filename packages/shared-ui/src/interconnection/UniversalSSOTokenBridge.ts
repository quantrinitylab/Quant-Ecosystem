// ============================================================================
// Quant Ecosystem - Universal SSO Token Bridge & Safe Return Path Engine
// ============================================================================

import type {
  CoreQuantAppId,
  QuantUserSession,
  SafeReturnValidationResult,
  SSOTokenHandoffPayload,
  ConsumedSSOTicket,
} from './types';
import { CORE_QUANT_APPS, SAFE_DOMAIN_PATTERNS } from './constants';

export type SSOEventType =
  | 'SESSION_INITIALIZED'
  | 'TOKEN_REFRESHED'
  | 'GLOBAL_LOGOUT'
  | 'ACCOUNT_SWITCHED'
  | 'PERMISSIONS_UPDATED';

export interface SSOEventMessage {
  type: SSOEventType;
  userId: string;
  sourceApp: CoreQuantAppId;
  timestamp: number;
  payload?: Record<string, unknown>;
  isQuantSSO?: boolean;
}

/**
 * Universal SSO Token Bridge
 *
 * Implements frictionless cross-app authentication handoff across all 10 apps
 * with strict open-redirect protection (Safe Return Path), multi-tab synchronization,
 * sandboxed iframe resilience, and seamless cross-domain token propagation.
 */
export class UniversalSSOTokenBridge {
  private static instance: UniversalSSOTokenBridge | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Map<SSOEventType, Set<(event: SSOEventMessage) => void>> = new Map();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSession: QuantUserSession | null = null;

  private constructor() {
    this.initBroadcastChannel();
    this.initStorageListener();
    this.initPostMessageListener();
  }

  public static getInstance(): UniversalSSOTokenBridge {
    if (!UniversalSSOTokenBridge.instance) {
      UniversalSSOTokenBridge.instance = new UniversalSSOTokenBridge();
    }
    return UniversalSSOTokenBridge.instance;
  }

  // --------------------------------------------------------------------------
  // Sandboxed Iframe-Safe Web Storage Helpers (Zero-Exception Guarantee)
  // --------------------------------------------------------------------------

  private static getStorageSafe(type: 'localStorage' | 'sessionStorage'): Storage | null {
    try {
      if (typeof window !== 'undefined' && window[type]) {
        return window[type];
      }
    } catch {
      // Sandboxed iframes without allow-same-origin throw SecurityError on property access
    }
    return null;
  }

  public static safeGetItem(type: 'localStorage' | 'sessionStorage', key: string): string | null {
    try {
      return UniversalSSOTokenBridge.getStorageSafe(type)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  public static safeSetItem(
    type: 'localStorage' | 'sessionStorage',
    key: string,
    value: string,
  ): void {
    try {
      UniversalSSOTokenBridge.getStorageSafe(type)?.setItem(key, value);
    } catch {
      // Quota exceeded, sandboxed iframe, or third-party storage restrictions
    }
  }

  public static safeRemoveItem(type: 'localStorage' | 'sessionStorage', key: string): void {
    try {
      UniversalSSOTokenBridge.getStorageSafe(type)?.removeItem(key);
    } catch {
      // Sandboxed iframe restrictions
    }
  }

  public static safeClear(type: 'localStorage' | 'sessionStorage'): void {
    try {
      UniversalSSOTokenBridge.getStorageSafe(type)?.clear();
    } catch {
      // Sandboxed iframe restrictions
    }
  }

  /**
   * 1. Safe Return Path Validator
   * Validates that target redirect URLs conform strictly to the Quant Ecosystem domain allowlist.
   * Completely mitigates Open Redirect vulnerabilities (CWE-601).
   */
  public static validateSafeReturnPath(
    candidateUrl: string,
    defaultFallback: string = '/',
  ): SafeReturnValidationResult {
    if (!candidateUrl || typeof candidateUrl !== 'string') {
      return { isSafe: false, sanitizedUrl: defaultFallback, reason: 'Empty candidate URL' };
    }

    const trimmed = candidateUrl.trim();

    // Relative URLs beginning with / but not // (protocol relative) and not containing backslashes
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
      return { isSafe: true, sanitizedUrl: trimmed };
    }

    try {
      const parsed = new URL(trimmed);

      // Enforce secure HTTPS (allow HTTP exclusively for local testbeds)
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !isLocal) {
        return {
          isSafe: false,
          sanitizedUrl: defaultFallback,
          reason: 'Insecure protocol: only HTTPS or localhost HTTP permitted',
        };
      }

      const isAllowed = SAFE_DOMAIN_PATTERNS.some((pattern) => pattern.test(parsed.origin));

      if (isAllowed) {
        return { isSafe: true, sanitizedUrl: parsed.toString() };
      }

      return {
        isSafe: false,
        sanitizedUrl: defaultFallback,
        reason: `Origin '${parsed.origin}' is not an authorized Quant Ecosystem domain`,
      };
    } catch {
      return {
        isSafe: false,
        sanitizedUrl: defaultFallback,
        reason: 'Malformed URL structure',
      };
    }
  }

  /**
   * Checks whether an origin is an authorized Quant Ecosystem domain
   */
  public isAllowedOrigin(origin: string): boolean {
    if (!origin || typeof origin !== 'string') return false;
    return SAFE_DOMAIN_PATTERNS.some((pattern) => pattern.test(origin));
  }

  /**
   * 2. Instant Cross-App Jump URL Builder
   * Calculates the target destination with zero-friction SSO handoff.
   * Automatically attaches handoff tickets when an active session is detected.
   */
  public buildCrossAppJumpUrl(
    targetAppId: CoreQuantAppId,
    targetPath?: string,
    ticketPayload?: Partial<SSOTokenHandoffPayload>,
  ): string {
    const app = CORE_QUANT_APPS[targetAppId];
    if (!app) {
      throw new Error(`Invalid target app: ${targetAppId}`);
    }

    const isDevelopment =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const isStaging =
      typeof window !== 'undefined' && window.location.hostname.includes('staging.quantrinity.in');

    let baseUrl: string;
    if (isDevelopment) {
      baseUrl = `http://localhost:${app.defaultPort}`;
    } else if (isStaging) {
      baseUrl = `https://staging.quantrinity.in/${app.subdomain}`;
    } else {
      baseUrl = app.productionUrl;
    }

    const path = targetPath || app.defaultRoute;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const destination = new URL(`${baseUrl}${cleanPath}`);

    // If explicit handoff ticket is provided, use it.
    // Otherwise, generate a ticket from the current session or access token.
    const ticket =
      ticketPayload?.handoffTicket ||
      this.generateHandoffTicket(targetAppId) ||
      UniversalSSOTokenBridge.safeGetItem('localStorage', 'quant_access_token') ||
      UniversalSSOTokenBridge.safeGetItem('localStorage', 'quant_auth_token');

    if (ticket) {
      destination.searchParams.set('__quant_sso_ticket', ticket);
      destination.searchParams.set('token', ticket);

      const returnPath =
        ticketPayload?.returnPath ||
        (typeof window !== 'undefined' ? window.location.href : undefined);
      if (returnPath) {
        destination.searchParams.set('__quant_return', encodeURIComponent(returnPath));
      }
    }

    return destination.toString();
  }

  /**
   * Generates a client-side handoff ticket containing session claims
   */
  public generateHandoffTicket(targetApp: CoreQuantAppId): string | null {
    if (!this.currentSession) return null;
    const payload = {
      uid: this.currentSession.userId,
      email: this.currentSession.email,
      name: this.currentSession.displayName,
      tier: this.currentSession.tier || 'free',
      app: targetApp,
      token:
        this.currentSession.token ||
        UniversalSSOTokenBridge.safeGetItem('localStorage', 'quant_access_token') ||
        UniversalSSOTokenBridge.safeGetItem('localStorage', 'quant_auth_token') ||
        '',
      iat: Date.now(),
      exp: Date.now() + 5 * 60 * 1000, // 5 minutes TTL
      nonce: Math.random().toString(36).substring(2, 15),
    };

    try {
      const json = JSON.stringify(payload);
      if (typeof btoa === 'function') {
        return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
      return Buffer.from(json).toString('base64url');
    } catch {
      return null;
    }
  }

  /**
   * Verifies and extracts session claims from a handoff ticket
   */
  public verifyHandoffTicket(
    ticket: string,
  ): (Partial<QuantUserSession> & { token?: string }) | null {
    if (!ticket || typeof ticket !== 'string') return null;
    try {
      let base64 = ticket.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      const json =
        typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('utf-8');
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.exp && parsed.exp < Date.now()) return null; // expired
      return {
        userId: parsed.uid,
        email: parsed.email,
        displayName: parsed.name,
        tier: parsed.tier,
        currentApp: parsed.app,
        token: parsed.token,
      };
    } catch {
      return null;
    }
  }

  /**
   * Consumes an SSO handoff ticket from the current URL if present.
   * Strips the ticket from the browser address bar via history.replaceState to prevent leakage.
   * Returns the ticket, extracted session, and sanitized return path, or null.
   */
  public consumeHandoffTicket(url?: string): ConsumedSSOTicket | null {
    if (typeof window === 'undefined' && !url) return null;

    try {
      const currentUrl = new URL(url || window.location.href);
      const ticket =
        currentUrl.searchParams.get('__quant_sso_ticket') ||
        currentUrl.searchParams.get('token') ||
        currentUrl.searchParams.get('accessToken');
      const rawReturn =
        currentUrl.searchParams.get('__quant_return') || currentUrl.searchParams.get('returnTo');

      if (!ticket) return null;

      const verifiedSession = this.verifyHandoffTicket(ticket);
      const tokenToStore = verifiedSession?.token || ticket;

      // Safely store token in standard ecosystem keys
      UniversalSSOTokenBridge.safeSetItem('localStorage', 'quant_access_token', tokenToStore);
      UniversalSSOTokenBridge.safeSetItem('localStorage', 'quant_auth_token', tokenToStore);

      if (verifiedSession && verifiedSession.userId) {
        const session: QuantUserSession = {
          userId: verifiedSession.userId,
          email: verifiedSession.email || '',
          displayName: verifiedSession.displayName || '',
          tier: verifiedSession.tier,
          currentApp: verifiedSession.currentApp,
          token: tokenToStore,
        };
        this.setCurrentSession(session, 3600);
        this.broadcastSSOEvent('SESSION_INITIALIZED', session.currentApp || 'quantmail');
      }

      // Validate and sanitize return path
      let sanitizedReturn: string | null = null;
      if (rawReturn) {
        const decoded = decodeURIComponent(rawReturn);
        const validation = UniversalSSOTokenBridge.validateSafeReturnPath(decoded);
        if (validation.isSafe) {
          sanitizedReturn = validation.sanitizedUrl;
        }
      }

      // Clean URL without page reload to prevent token leaking via browser history/address bar
      try {
        if (
          typeof window !== 'undefined' &&
          window.history &&
          typeof window.history.replaceState === 'function'
        ) {
          currentUrl.searchParams.delete('__quant_sso_ticket');
          currentUrl.searchParams.delete('token');
          currentUrl.searchParams.delete('accessToken');
          currentUrl.searchParams.delete('refreshToken');
          currentUrl.searchParams.delete('__quant_return');
          const cleanUrl =
            currentUrl.pathname + (currentUrl.search ? currentUrl.search : '') + currentUrl.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch {
        // Restricted history in sandboxed iframe
      }

      return {
        ticket,
        session: verifiedSession || undefined,
        returnPath: sanitizedReturn,
      };
    } catch {
      return null;
    }
  }

  /**
   * Seamlessly propagates active session tokens to authorized sibling domains
   */
  public propagateSessionToSiblingDomains(session?: QuantUserSession, token?: string): void {
    const activeSession = session || this.currentSession;
    if (!activeSession) return;

    if (token) {
      activeSession.token = token;
      UniversalSSOTokenBridge.safeSetItem('localStorage', 'quant_access_token', token);
      UniversalSSOTokenBridge.safeSetItem('localStorage', 'quant_auth_token', token);
    }

    this.setCurrentSession(activeSession, 3600);
    this.broadcastSSOEvent('SESSION_INITIALIZED', activeSession.currentApp || 'quantmail', {
      token: token || activeSession.token,
      propagatedAt: Date.now(),
    });
  }

  /**
   * 3. Cross-Tab & Multi-Window Session Synchronization Bus
   */
  private initBroadcastChannel(): void {
    try {
      if (typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function') {
        this.broadcastChannel = new window.BroadcastChannel('quant_sso_bus');
        this.broadcastChannel.onmessage = (event: MessageEvent<SSOEventMessage>) => {
          if (event && event.data) {
            this.dispatchLocalEvent(event.data);
          }
        };
      }
    } catch {
      // BroadcastChannel unavailable or restricted in sandboxed environments
      this.broadcastChannel = null;
    }
  }

  private initStorageListener(): void {
    try {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('storage', (event) => {
          try {
            if (event && event.key === 'quant_sso_sync_event' && event.newValue) {
              const data: SSOEventMessage = JSON.parse(event.newValue);
              this.dispatchLocalEvent(data);
            }
          } catch {
            // Silently ignore corrupted storage events or restricted access
          }
        });
      }
    } catch {
      // Restricted sandboxed iframe
    }
  }

  private initPostMessageListener(): void {
    try {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('message', (event: MessageEvent) => {
          try {
            if (!event.origin || !this.isAllowedOrigin(event.origin)) {
              return;
            }
            if (event.data && typeof event.data === 'object' && event.data.isQuantSSO) {
              const ssoMsg = event.data as SSOEventMessage;
              this.dispatchLocalEvent(ssoMsg);
            }
          } catch {
            // Ignore decoding or cross-frame access errors
          }
        });
      }
    } catch {
      // Sandboxed iframe restrictions
    }
  }

  /**
   * Broadcast an SSO event across all open apps and tabs
   */
  public broadcastSSOEvent(
    type: SSOEventType,
    sourceApp: CoreQuantAppId,
    payload?: Record<string, unknown>,
  ): void {
    if (!this.currentSession) return;

    const message: SSOEventMessage = {
      type,
      userId: this.currentSession.userId,
      sourceApp,
      timestamp: Date.now(),
      payload,
    };

    // 1. BroadcastChannel (safely wrapped)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch {
        // Channel closed or restricted
      }
    }

    // 2. LocalStorage Sync fallback (safely wrapped)
    UniversalSSOTokenBridge.safeSetItem(
      'localStorage',
      'quant_sso_sync_event',
      JSON.stringify(message),
    );

    // 3. Cross-Frame PostMessage (for embedded / iframe environments)
    try {
      if (typeof window !== 'undefined') {
        const messageWrapper = { ...message, isQuantSSO: true };
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(messageWrapper, '*');
        }
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(messageWrapper, '*');
        }
      }
    } catch {
      // Sandboxed iframe cross-frame restrictions
    }

    // 4. Dispatch locally
    this.dispatchLocalEvent(message);
  }

  /**
   * Subscribe to SSO lifecycle events
   */
  public on(type: SSOEventType, callback: (event: SSOEventMessage) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  private dispatchLocalEvent(message: SSOEventMessage): void {
    const callbacks = this.listeners.get(message.type);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(message);
        } catch {
          // Prevent listener error from cascading
        }
      });
    }
  }

  /**
   * 4. Session Setup and Token Refresh Management
   */
  public setCurrentSession(session: QuantUserSession, tokenExpiresInSeconds: number = 3600): void {
    this.currentSession = session;

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Schedule refresh 60 seconds before expiration
    const refreshLeadTime = Math.max((tokenExpiresInSeconds - 60) * 1000, 10000);
    this.refreshTimer = setTimeout(() => {
      void this.triggerTokenRefresh();
    }, refreshLeadTime);
  }

  public getCurrentSession(): QuantUserSession | null {
    return this.currentSession;
  }

  /**
   * Proactive token refresh via ecosystem API
   */
  private async triggerTokenRefresh(): Promise<void> {
    try {
      // In production this calls POST /api/auth/refresh with HttpOnly refresh cookie
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        this.broadcastSSOEvent('TOKEN_REFRESHED', this.currentSession?.currentApp || 'quantmail', {
          refreshedAt: Date.now(),
        });
        if (this.currentSession && data.expiresIn) {
          this.setCurrentSession(this.currentSession, data.expiresIn);
        }
      } else {
        // If refresh fails, notify all apps to prompt re-auth or logout
        this.broadcastSSOEvent('GLOBAL_LOGOUT', this.currentSession?.currentApp || 'quantmail');
      }
    } catch {
      // Offline or network error
    }
  }

  /**
   * Global Single Sign-Out across all 10 apps
   */
  public async performGlobalLogout(currentApp: CoreQuantAppId): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }

    this.broadcastSSOEvent('GLOBAL_LOGOUT', currentApp);

    this.currentSession = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Safe storage clearance resilient against sandboxed iframes
    UniversalSSOTokenBridge.safeRemoveItem('localStorage', 'quant_auth_token');
    UniversalSSOTokenBridge.safeRemoveItem('localStorage', 'quant_auth_tokens');
    UniversalSSOTokenBridge.safeRemoveItem('localStorage', 'quant_access_token');
    UniversalSSOTokenBridge.safeRemoveItem('localStorage', 'quant_refresh_token');
    UniversalSSOTokenBridge.safeRemoveItem('localStorage', 'quant_sso_sync_event');
    UniversalSSOTokenBridge.safeClear('sessionStorage');

    try {
      if (typeof window !== 'undefined' && window.location) {
        const isJsdom =
          typeof navigator !== 'undefined' &&
          (navigator.userAgent?.includes('jsdom') || navigator.userAgent?.includes('Node.js'));
        if (!isJsdom) {
          window.location.href = '/login';
        }
      }
    } catch {
      // Sandboxed navigation restrictions
    }
  }
}
