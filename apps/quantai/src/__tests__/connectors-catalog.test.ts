// ============================================================================
// Quanty Connectors — catalog unit tests.
// Verifies the spec contract for GET /api/quanty/mcp/catalog and honesty rules.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  CONSUMER_CONNECTOR_CATALOG,
  getConsumerConnector,
  getBuiltinConnections,
  toCatalogPayload,
} from '../lib/connectors/catalog';

describe('consumer connector catalog', () => {
  it('has a non-empty curated catalog with unique ids', () => {
    expect(CONSUMER_CONNECTOR_CATALOG.length).toBeGreaterThan(0);
    const ids = CONSUMER_CONNECTOR_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has the required consumer fields', () => {
    for (const c of CONSUMER_CONNECTOR_CATALOG) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.icon).toBeTruthy();
      expect(c.category).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.authType).toMatch(/^(OAUTH2|API_KEY|SESSION|BUILTIN|DEVICE)$/);
      expect(Array.isArray(c.scopes)).toBe(true);
      expect(Array.isArray(c.tools)).toBe(true);
    }
  });

  it('toCatalogPayload matches the spec contract shape exactly', () => {
    const payload = toCatalogPayload();
    expect(Object.keys(payload)).toEqual(['providers']);
    for (const p of payload.providers as any[]) {
      const keys = Object.keys(p).sort();
      // deviceSource only present when true
      expect(keys).toContain('id');
      expect(keys).toContain('name');
      expect(keys).toContain('icon');
      expect(keys).toContain('category');
      expect(keys).toContain('description');
      expect(keys).toContain('authType');
      expect(keys).not.toContain('scopes');
      expect(keys).not.toContain('tools');
      if ('deviceSource' in p) expect(p.deviceSource).toBe(true);
    }
  });

  it('mirrors the Muse screenshot providers (browser/github/instagram + device set)', () => {
    expect(getConsumerConnector('browser')).toBeTruthy();
    expect(getConsumerConnector('github')).toBeTruthy();
    expect(getConsumerConnector('instagram')).toBeTruthy();
    expect(getConsumerConnector('device-calendar')?.deviceSource).toBe(true);
    expect(getConsumerConnector('device-contacts')?.deviceSource).toBe(true);
    expect(getConsumerConnector('device-call-log')?.deviceSource).toBe(true);
  });

  it('device-source providers expose no tools (honest: nothing to call yet)', () => {
    for (const c of CONSUMER_CONNECTOR_CATALOG.filter((x) => x.deviceSource)) {
      expect(c.tools).toEqual([]);
      expect(c.authType).toBe('DEVICE');
    }
  });

  it('getBuiltinConnections returns only session-derived connections, never fabricated grants', () => {
    const builtin = getBuiltinConnections();
    expect(builtin.length).toBeGreaterThan(0);
    for (const b of builtin) {
      expect(b.status).toBe('connected');
      expect(b.via).toMatch(/^(ecosystem-session|oauth)$/);
      // No fabricated grant ids / tokens.
      expect(JSON.stringify(b)).not.toMatch(/sess_|tok_|grant_/);
    }
    const ids = builtin.map((b) => b.provider);
    expect(ids).toContain('browser');
    expect(ids).toContain('quantmail');
  });

  it('getConsumerConnector returns undefined for unknown ids', () => {
    expect(getConsumerConnector('nope-not-real')).toBeUndefined();
  });
});
