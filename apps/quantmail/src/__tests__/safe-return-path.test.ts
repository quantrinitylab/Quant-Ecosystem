import { describe, it, expect } from 'vitest';
import { safeReturnPath } from '../lib/safe-return-path';

describe('safeReturnPath - Sovereign SSO Return Path & Open Redirect Protection', () => {
  describe('Relative Paths', () => {
    it('accepts valid in-app relative paths', () => {
      expect(safeReturnPath('/')).toBe('/');
      expect(safeReturnPath('/inbox')).toBe('/inbox');
      expect(safeReturnPath('/invite/abc123')).toBe('/invite/abc123');
      expect(safeReturnPath('/settings?tab=security')).toBe('/settings?tab=security');
      expect(safeReturnPath('/thread/1#reply')).toBe('/thread/1#reply');
      expect(safeReturnPath('/compose?to=test@example.com&subject=Hello')).toBe(
        '/compose?to=test@example.com&subject=Hello',
      );
    });

    it('rejects protocol-relative and backslash-prefixed paths', () => {
      expect(safeReturnPath('//attacker.example')).toBeNull();
      expect(safeReturnPath('//attacker.example/inbox')).toBeNull();
      expect(safeReturnPath('/\\attacker.example')).toBeNull();
      expect(safeReturnPath('/\\/attacker.example')).toBeNull();
    });

    it('rejects relative paths not rooted with a slash', () => {
      expect(safeReturnPath('inbox')).toBeNull();
      expect(safeReturnPath('settings/profile')).toBeNull();
      expect(safeReturnPath('../admin')).toBeNull();
      expect(safeReturnPath('./callback')).toBeNull();
    });
  });

  describe('Non-HTTP Schemes and Falsy Inputs', () => {
    it('rejects dangerous schemes', () => {
      expect(safeReturnPath('javascript:alert(1)')).toBeNull();
      expect(safeReturnPath('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(safeReturnPath('mailto:someone@quantmail.in')).toBeNull();
      expect(safeReturnPath('ftp://quantmail.in/file')).toBeNull();
    });

    it('returns null for empty or falsy inputs', () => {
      expect(safeReturnPath(null)).toBeNull();
      expect(safeReturnPath(undefined)).toBeNull();
      expect(safeReturnPath('')).toBeNull();
    });
  });

  describe('Phishing and Look-alike Domains', () => {
    it('rejects external phishing domains', () => {
      expect(safeReturnPath('https://attacker.example/phish')).toBeNull();
      expect(safeReturnPath('http://attacker.example')).toBeNull();
      expect(safeReturnPath('https://quantmai1.in/login')).toBeNull();
      expect(safeReturnPath('https://attacker-quantchat.in/dms')).toBeNull();
      expect(safeReturnPath('https://notquantai.in/canvas')).toBeNull();
      expect(safeReturnPath('https://quantchat.in.attacker.com/steal')).toBeNull();
      expect(safeReturnPath('https://quantube.in.evil.org/watch')).toBeNull();
    });

    it('rejects insecure HTTP for remote production domains', () => {
      expect(safeReturnPath('http://quantmail.in/')).toBeNull();
      expect(safeReturnPath('http://quantchat.in/login')).toBeNull();
      expect(safeReturnPath('http://quantai.in/canvas')).toBeNull();
      expect(safeReturnPath('http://quantgram.in/feed')).toBeNull();
    });
  });

  describe('Canonical Standalone Ecosystem Apps & Subdomains', () => {
    it('accepts exact canonical standalone app domains', () => {
      const canonicalDomains = [
        'https://quantchat.in/',
        'https://quantai.in/',
        'https://quantgram.in/',
        'https://quantube.in/',
        'https://quantmax.in/',
        'https://quantcooks.in/',
        'https://quantwave.in/',
        'https://quantads.in/',
      ];

      for (const domain of canonicalDomains) {
        expect(safeReturnPath(domain)).toBe(domain);
      }
    });

    it('accepts subdomains of canonical standalone app domains', () => {
      const subdomainUrls = [
        'https://auth.quantchat.in/sso',
        'https://live.quantchat.in/call/room-123',
        'https://canvas.quantai.in/workspace',
        'https://api.quantai.in/v1/chat',
        'https://reels.quantgram.in/explore',
        'https://studio.quantgram.in/creator',
        'https://watch.quantube.in/v/abc',
        'https://music.quantube.in/tracks',
        'https://sheets.quantmax.in/workbook/456',
        'https://ops.quantmax.in/status',
        'https://recipes.quantcooks.in/pantry',
        'https://stages.quantwave.in/live-audio',
        'https://portal.quantads.in/bidding',
      ];

      for (const url of subdomainUrls) {
        expect(safeReturnPath(url)).toBe(url);
      }
    });

    it('accepts core ecosystem umbrella domains and subdomains', () => {
      expect(safeReturnPath('https://quantmail.in/')).toBe('https://quantmail.in/');
      expect(safeReturnPath('https://app.quantmail.in/inbox')).toBe('https://app.quantmail.in/inbox');
      expect(safeReturnPath('https://quantrinity.in/')).toBe('https://quantrinity.in/');
      expect(safeReturnPath('https://quantchat.quantrinity.in/dms')).toBe(
        'https://quantchat.quantrinity.in/dms',
      );
      expect(safeReturnPath('https://quanttrinity.in/vault')).toBe('https://quanttrinity.in/vault');
      expect(safeReturnPath('https://id.quanttrinity.in/sso')).toBe('https://id.quanttrinity.in/sso');
      expect(safeReturnPath('https://quant.network/nodes')).toBe('https://quant.network/nodes');
      expect(safeReturnPath('https://relay.quant.network/status')).toBe(
        'https://relay.quant.network/status',
      );
    });

    it('accepts local development environments on HTTP', () => {
      expect(safeReturnPath('http://localhost:3000/inbox')).toBe('http://localhost:3000/inbox');
      expect(safeReturnPath('http://localhost:3001/dms')).toBe('http://localhost:3001/dms');
      expect(safeReturnPath('http://127.0.0.1:3000/callback')).toBe('http://127.0.0.1:3000/callback');
      expect(safeReturnPath('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173/');
    });
  });
});
