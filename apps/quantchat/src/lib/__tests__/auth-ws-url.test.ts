// @vitest-environment jsdom
// ============================================================================
// QuantChat - WebSocket URL + auth transport tests (P0-1, P1)
//
// P0-1: the production WS endpoint MUST be same-origin — the old hardcoded
// `wss://quantws.quantrinity.in/ws` was never deployed and its handshake
// timed out, so realtime could never work in production.
// P1: the auth token MUST NOT travel in the URL query string; it is passed as
// a negotiated WebSocket subprotocol (see getWsProtocols), which the backend
// (`@quant/realtime` ConnectionAuth) already accepts.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getWsBaseUrl, getWsAuthUrl, getChatSocketUrl, getWsProtocols } from '../auth';

function setHost(hostname: string, protocol = 'https:') {
  Object.defineProperty(window, 'location', {
    value: { hostname, host: hostname, protocol },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_WS_URL;
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_WS_URL;
});

describe('getWsBaseUrl', () => {
  it('resolves quantchat.quantrinity.in to the SAME ORIGIN (not the dead quantws host)', () => {
    setHost('quantchat.quantrinity.in');
    expect(getWsBaseUrl()).toBe('wss://quantchat.quantrinity.in');
  });

  it('uses wss for any https host', () => {
    setHost('staging.example.com');
    expect(getWsBaseUrl()).toBe('wss://staging.example.com');
  });

  it('uses ws for plain http hosts', () => {
    setHost('intranet.local', 'http:');
    expect(getWsBaseUrl()).toBe('ws://intranet.local');
  });

  it('falls back to the backend WS port on localhost', () => {
    setHost('localhost', 'http:');
    expect(getWsBaseUrl()).toBe('ws://localhost:3002');
  });

  it('still honors NEXT_PUBLIC_WS_URL when set', () => {
    setHost('quantchat.quantrinity.in');
    process.env.NEXT_PUBLIC_WS_URL = 'wss://ws.example.com/custom';
    expect(getWsBaseUrl()).toBe('wss://ws.example.com/custom');
  });

  it('builds the chat path exactly once (no doubled /ws/ws)', () => {
    setHost('quantchat.quantrinity.in');
    expect(getChatSocketUrl()).toBe('wss://quantchat.quantrinity.in/ws/chat');
  });
});

describe('getWsAuthUrl / getChatSocketUrl', () => {
  it('never puts the token in the URL (P1)', () => {
    setHost('quantchat.quantrinity.in');
    localStorage.setItem('token', 'secret-jwt-value');
    expect(getChatSocketUrl()).toBe('wss://quantchat.quantrinity.in/ws/chat');
    expect(getWsAuthUrl('conv-1')).toBe(
      'wss://quantchat.quantrinity.in/ws/chat?conversationId=conv-1',
    );
    expect(getChatSocketUrl()).not.toContain('token=');
    expect(getWsAuthUrl('conv-1')).not.toContain('secret-jwt-value');
  });

  it('keeps the conversationId query param', () => {
    setHost('quantchat.quantrinity.in');
    expect(getWsAuthUrl('conv-abc')).toContain('conversationId=conv-abc');
  });
});

describe('getWsProtocols', () => {
  it('returns the token as the subprotocol when a session exists', () => {
    localStorage.setItem('token', 'jwt-token-value');
    expect(getWsProtocols()).toEqual(['jwt-token-value']);
  });

  it('reads the token from non-legacy keys too', () => {
    localStorage.setItem('quant_access_token', 'sso-token-value');
    expect(getWsProtocols()).toEqual(['sso-token-value']);
  });

  it('returns an empty list without a session', () => {
    expect(getWsProtocols()).toEqual([]);
  });
});
