import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UniversalSSOTokenBridge } from '../UniversalSSOTokenBridge';
import { FederatedSearchEngine } from '../FederatedSearchEngine';
import { CrossAppAssetPipeline } from '../CrossAppAssetPipeline';
import { UniversalAppSwitcher } from '../UniversalAppSwitcher';
import { UniversalCommandPalette } from '../UniversalCommandPalette';
import { UnifiedNotificationDrawer } from '../UnifiedNotificationDrawer';
import { CORE_QUANT_APPS, SIBLING_SSO_DOMAINS } from '../constants';
import type { QuantUserSession, CoreQuantAppId } from '../types';

describe('Quant Ecosystem Interconnection Fabric Suite', () => {
  const mockUser: QuantUserSession = {
    userId: 'user-001',
    email: 'kundan@quantmail.in',
    username: 'kundansingh',
    displayName: 'Kundan Singh',
    tier: 'pro',
    currentApp: 'quantmail',
    activeSessions: [{ appId: 'quantmail', lastActiveAt: Date.now() }],
    creditsBalance: 450,
    token: 'mock_jwt_access_token_123',
  };

  beforeEach(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('UniversalSSOTokenBridge - Domain Security & Safe Return Path', () => {
    it('validates safe ecosystem domains across all sibling apps', () => {
      const allowedOrigins = [
        'https://quantmail.in/sso',
        'https://quantchat.quantrinity.in/dms',
        'https://quantube.quantrinity.in/watch?v=xyz',
        'https://quantmax.quantrinity.in/workspaces',
        'https://quantgram.quantrinity.in/feed',
        'https://quantai.quantrinity.in/canvas',
        'https://quantwave.quantrinity.in/explore',
        'https://quantcooks.quantrinity.in/kitchen',
        'https://quantads.quantrinity.in/campaigns',
        'https://quanttrinity.in/vault',
        'http://localhost:3000/inbox',
        'http://localhost:3001/dms',
        'http://127.0.0.1:3000/callback',
      ];

      for (const url of allowedOrigins) {
        const result = UniversalSSOTokenBridge.validateSafeReturnPath(url);
        expect(result.isSafe, `Expected ${url} to be safe`).toBe(true);
        expect(result.sanitizedUrl).toBe(url);
      }
    });

    it('rejects external phishing and malformed URLs', () => {
      const malicious = [
        'https://evil-phishing.com/login',
        'https://quantmai1.in/login',
        'https://attacker-quantrinity.in',
        'http://quantmail.in', // insecure HTTP on production domain
        '//attacker.example/hack',
        '/\\attacker.example',
        'javascript:alert(1)',
        '',
      ];

      for (const url of malicious) {
        const result = UniversalSSOTokenBridge.validateSafeReturnPath(url, '/fallback');
        expect(result.isSafe, `Expected ${url} to be rejected`).toBe(false);
        expect(result.sanitizedUrl).toBe('/fallback');
      }
    });

    it('accepts valid relative paths', () => {
      expect(UniversalSSOTokenBridge.validateSafeReturnPath('/inbox').isSafe).toBe(true);
      expect(UniversalSSOTokenBridge.validateSafeReturnPath('/settings?tab=security').isSafe).toBe(
        true,
      );
      expect(UniversalSSOTokenBridge.validateSafeReturnPath('/thread/123#reply').sanitizedUrl).toBe(
        '/thread/123#reply',
      );
    });
  });

  describe('UniversalSSOTokenBridge - Cross-App Jump & Handoff Ticket Engine', () => {
    it('generates cross-app jump URL with valid return signature', () => {
      const bridge = UniversalSSOTokenBridge.getInstance();
      const jumpUrl = bridge.buildCrossAppJumpUrl('quantgram', '/reels/123');

      expect(jumpUrl).toContain('/reels/123');
    });

    it('automatically generates handoff ticket when session is active', () => {
      const bridge = UniversalSSOTokenBridge.getInstance();
      bridge.setCurrentSession(mockUser, 3600);

      const jumpUrl = bridge.buildCrossAppJumpUrl('quantchat', '/dms/general');
      expect(jumpUrl).toContain('__quant_sso_ticket=');
      expect(jumpUrl).toContain('/dms/general');

      const parsed = new URL(jumpUrl);
      const ticket = parsed.searchParams.get('__quant_sso_ticket');
      expect(ticket).toBeTruthy();

      // Verify the generated ticket contains expected claims
      const claims = bridge.verifyHandoffTicket(ticket!);
      expect(claims).not.toBeNull();
      expect(claims?.userId).toBe('user-001');
      expect(claims?.email).toBe('kundan@quantmail.in');
      expect(claims?.currentApp).toBe('quantchat');
    });

    it('consumes handoff ticket, initializes session and cleans address bar without reload', () => {
      const bridge = UniversalSSOTokenBridge.getInstance();
      bridge.setCurrentSession(mockUser, 3600);

      const targetApp: CoreQuantAppId = 'quantube';
      const ticket = bridge.generateHandoffTicket(targetApp)!;
      const inboundUrl = `https://quantube.quantrinity.in/watch?v=abc&__quant_sso_ticket=${ticket}&__quant_return=${encodeURIComponent('https://quantmail.in/inbox')}`;

      const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

      const consumed = bridge.consumeHandoffTicket(inboundUrl);
      expect(consumed).not.toBeNull();
      expect(consumed?.ticket).toBe(ticket);
      expect(consumed?.session?.userId).toBe('user-001');
      expect(consumed?.returnPath).toBe('https://quantmail.in/inbox');

      // Address bar replaceState was invoked to remove query ticket
      expect(replaceStateSpy).toHaveBeenCalled();
    });

    it('seamlessly propagates session to sibling domains via propagateSessionToSiblingDomains', () => {
      const bridge = UniversalSSOTokenBridge.getInstance();
      const ssoEvents: unknown[] = [];
      const unsub = bridge.on('SESSION_INITIALIZED', (e) => ssoEvents.push(e));

      bridge.propagateSessionToSiblingDomains(mockUser, 'new_propagated_token_999');

      expect(ssoEvents.length).toBeGreaterThan(0);
      expect(bridge.getCurrentSession()?.token).toBe('new_propagated_token_999');
      unsub();
    });
  });

  describe('UniversalSSOTokenBridge - Sandboxed Iframe Resilience', () => {
    it('handles localStorage throwing SecurityError gracefully in sandboxed iframes', () => {
      const bridge = UniversalSSOTokenBridge.getInstance();
      bridge.setCurrentSession(mockUser, 3600);

      // Simulate a restricted sandboxed iframe where localStorage access throws SecurityError
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Access is denied for this document', 'SecurityError');
      });

      // broadcastSSOEvent must NOT throw an unhandled exception
      expect(() => {
        bridge.broadcastSSOEvent('TOKEN_REFRESHED', 'quantmail');
      }).not.toThrow();

      // performGlobalLogout must NOT throw when storage is denied
      expect(() => {
        void bridge.performGlobalLogout('quantmail');
      }).not.toThrow();

      setItemSpy.mockRestore();
    });

    it('safely handles missing or throwing BroadcastChannel in sandboxed iframes', () => {
      const originalBC = window.BroadcastChannel;
      // @ts-expect-error test simulation
      delete window.BroadcastChannel;

      expect(() => {
        UniversalSSOTokenBridge.getInstance().broadcastSSOEvent('GLOBAL_LOGOUT', 'quantmail');
      }).not.toThrow();

      window.BroadcastChannel = originalBC;
    });
  });

  describe('UniversalAppSwitcher Component - 10 Retained Apps Matrix', () => {
    const retainedAppIds: CoreQuantAppId[] = [
      'quantmail',
      'quantchat',
      'quantgram',
      'quantai',
      'quantube',
      'quantwave',
      'quantmax',
      'quantcooks',
      'quantads',
      'quanttrinity',
    ];

    it('verifies all 10 retained apps are configured with canonical production domains', () => {
      expect(Object.keys(CORE_QUANT_APPS)).toHaveLength(10);

      for (const appId of retainedAppIds) {
        const app = CORE_QUANT_APPS[appId];
        expect(app, `App ${appId} must exist in CORE_QUANT_APPS`).toBeDefined();
        expect(app.id).toBe(appId);
        expect(app.name).toBeTruthy();
        expect(app.productionUrl).toMatch(
          /^https:\/\/(quantmail\.in|([a-z0-9-]+\.)?quantt?rinity\.in)/,
        );
      }
    });

    it('verifies SIBLING_SSO_DOMAINS contains authorized sibling domains', () => {
      expect(SIBLING_SSO_DOMAINS).toContain('https://quantchat.quantrinity.in');
      expect(SIBLING_SSO_DOMAINS).toContain('https://quantube.quantrinity.in');
      expect(SIBLING_SSO_DOMAINS).toContain('https://quantmax.quantrinity.in');
      expect(SIBLING_SSO_DOMAINS).toContain('https://quantgram.quantrinity.in');
      expect(SIBLING_SSO_DOMAINS).toContain('https://quantai.quantrinity.in');
    });

    it('renders 9-dots launcher button with user account chip', () => {
      const html = renderToStaticMarkup(
        <UniversalAppSwitcher currentApp="quantmail" user={mockUser} />,
      );

      expect(html).toContain('Universal Quant App Switcher (9 dots)');
      expect(html).toContain('grid-cols-3');
    });
  });

  describe('FederatedSearchEngine', () => {
    it('searches across core applications', async () => {
      const searchEngine = FederatedSearchEngine.getInstance();
      const response = await searchEngine.search('Financial', 'all');

      expect(Array.isArray(response.results)).toBe(true);
      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0]).toHaveProperty('title');
      expect(response.results[0]).toHaveProperty('app');
    });

    it('returns quick actions for hotkeys', () => {
      const searchEngine = FederatedSearchEngine.getInstance();
      const actions = searchEngine.getActions();

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((a) => a.id === 'action.mail.compose')).toBe(true);
      expect(actions.some((a) => a.id === 'action.gram.reel')).toBe(true);
      expect(actions.some((a) => a.id === 'action.ai.canvas')).toBe(true);
    });
  });

  describe('CrossAppAssetPipeline', () => {
    it('provides singleton instance with required methods', () => {
      const pipeline = CrossAppAssetPipeline.getInstance();
      expect(pipeline).toBeDefined();
      expect(typeof pipeline.transferDriveFileToAICanvas).toBe('function');
      expect(typeof pipeline.publishAIToGramReel).toBe('function');
      expect(typeof pipeline.shareGramReel).toBe('function');
      expect(typeof pipeline.transcribeVoiceNoteToDriveDoc).toBe('function');
    });
  });

  describe('UniversalCommandPalette Component', () => {
    it('renders search modal with scope filters', () => {
      const html = renderToStaticMarkup(
        <UniversalCommandPalette isOpen={true} onClose={vi.fn()} />,
      );

      expect(html).toContain('Search mail, reels, files, chats, AI canvas');
      expect(html).toContain('All');
      expect(html).toContain('Mail');
      expect(html).toContain('Reels');
      expect(html).toContain('Drive Files');
      expect(html).toContain('QuantAI');
    });
  });

  describe('UnifiedNotificationDrawer Component', () => {
    it('renders drawer with category filter tabs', () => {
      const html = renderToStaticMarkup(
        <UnifiedNotificationDrawer isOpen={true} onClose={vi.fn()} />,
      );

      expect(html).toContain('Notifications');
      expect(html).toContain('All Alerts');
      expect(html).toContain('Mail');
      expect(html).toContain('Gram');
      expect(html).toContain('AI Canvas');
    });
  });
});
