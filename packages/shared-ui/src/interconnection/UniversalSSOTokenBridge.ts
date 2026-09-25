// ============================================================================
// Quant Ecosystem - Universal SSO Token Bridge & Safe Return Path Engine
// ============================================================================

import type {
  CoreQuantAppId,
  QuantUserSession,
  SafeReturnValidationResult,
  SSOTokenHandoffPayload,
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
}

/**
 * Universal SSO Token Bridge
 *
 * Implements frictionless cross-app authentication handoff across all 10 apps
 * with strict open-redirect protection (Safe Return Path), multi-tab synchronization,
 * and seamless refresh token rotation.
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
  }

  public static getInstance(): UniversalSSOTokenBridge {
    if (!UniversalSSOTokenBridge.instance) {
      UniversalSSOTokenBridge.instance = new UniversalSSOTokenBridge();
    }
    return UniversalSSOTokenBridge.instance;
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

    // Relative URLs beginning with / but not // (protocol relative)
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
      return { isSafe: true, sanitizedUrl: trimmed };
    }

    try {
      const parsed = new URL(trimmed);
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
   * 2. Instant Cross-App Jump URL Builder
   * Calculates the target destination with zero-friction SSO handoff.
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

    const baseUrl = isDevelopment ? `http://localhost:${app.defaultPort}` : app.productionUrl;

    const path = targetPath || app.defaultRoute;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const destination = new URL(`${baseUrl}${cleanPath}`);

    // If running in development (different ports) or cross-domain, attach handoff ticket
    if (ticketPayload?.handoffTicket) {
      destination.searchParams.set('__quant_sso_ticket', ticketPayload.handoffTicket);
      if (ticketPayload.returnPath) {
        destination.searchParams.set(
          '__quant_return',
          encodeURIComponent(ticketPayload.returnPath),
        );
      }
    }

    return destination.toString();
  }

  /**
   * 3. Cross-Tab & Multi-Window Session Synchronization Bus
   */
  private initBroadcastChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('quant_sso_bus');
        this.broadcastChannel.onmessage = (event: MessageEvent<SSOEventMessage>) => {
          this.dispatchLocalEvent(event.data);
        };
      } catch {
        // BroadcastChannel unavailable or restricted in sandboxed environments
      }
    }
  }

  private initStorageListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === 'quant_sso_sync_event' && event.newValue) {
          try {
            const data: SSOEventMessage = JSON.parse(event.newValue);
            this.dispatchLocalEvent(data);
          } catch {
            // Silently ignore corrupted storage events
          }
        }
      });
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

    // 1. BroadcastChannel
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(message);
    }

    // 2. LocalStorage Sync fallback
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('quant_sso_sync_event', JSON.stringify(message));
      } catch {
        // storage quota exceeded or disabled
      }
    }

    // 3. Dispatch locally
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
      callbacks.forEach((cb) => cb(message));
    }
  }

  /**
   * 4. Session Setup and Token Refresh Management
   */
  public setCurrentSession(session: QuantUserSession, tokenExpiresInSeconds: number): void {
    this.currentSession = session;

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Schedule refresh 60 seconds before expiration
    const refreshLeadTime = Math.max((tokenExpiresInSeconds - 60) * 1000, 10000);
    this.refreshTimer = setTimeout(() => {
      this.triggerTokenRefresh();
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

    if (typeof window !== 'undefined') {
      localStorage.removeItem('quant_auth_token');
      sessionStorage.clear();
      window.location.href = '/login';
    }
  }
}
