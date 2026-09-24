import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UniversalSSOTokenBridge } from '../UniversalSSOTokenBridge';
import { FederatedSearchEngine } from '../FederatedSearchEngine';
import { CrossAppAssetPipeline } from '../CrossAppAssetPipeline';
import { UniversalAppSwitcher } from '../UniversalAppSwitcher';
import { UniversalCommandPalette } from '../UniversalCommandPalette';
import { UnifiedNotificationDrawer } from '../UnifiedNotificationDrawer';
import { CORE_QUANT_APPS } from '../constants';
import type { QuantUserSession } from '../types';

describe('Quant Ecosystem Interconnection Fabric Suite', () => {
  const mockUser: QuantUserSession = {
    userId: 'user-001',
    email: 'kundan@quantmail.in',
    username: 'kundansingh',
    displayName: 'Kundan Singh',
    creditsBalance: 450,
  };

  describe('UniversalSSOTokenBridge', () => {
    it('generates cross-app jump URL with valid return signature', () => {
      const bridge = UniversalSSOTokenBridge.getInstance();
      const jumpUrl = bridge.buildCrossAppJumpUrl('quantgram', '/reels/123');

      expect(jumpUrl).toContain('/reels/123');
    });

    it('validates safe ecosystem domains', () => {
      const valid = UniversalSSOTokenBridge.validateSafeReturnPath('https://quantmail.in/sso');
      const invalid = UniversalSSOTokenBridge.validateSafeReturnPath('https://evil-phishing.com');
      expect(valid.isSafe).toBe(true);
      expect(invalid.isSafe).toBe(false);
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

  describe('UniversalAppSwitcher Component', () => {
    it('renders 9-dots launcher button', () => {
      const html = renderToStaticMarkup(
        <UniversalAppSwitcher currentApp="quantmail" user={mockUser} />,
      );

      expect(html).toContain('Universal Quant App Switcher (9 dots)');
      expect(html).toContain('grid-cols-3');
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
