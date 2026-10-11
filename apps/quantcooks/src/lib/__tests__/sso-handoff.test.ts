// ============================================================================
// QuantCooks — SSO handoff helper tests (Contract B).
//
// QuantMail's /sso chooser hands back a single-use ticket as ?sso_ticket=
// (NOT a token). The helpers read the ticket and scrub every handoff param
// from the address bar so nothing sensitive lingers in history/logs.
// Legacy token params are scrubbed defensively but never trusted.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readSsoTicketFromSearch, scrubSsoParamsFromUrl, SSO_TICKET_PARAM } from '../sso-handoff';

describe('readSsoTicketFromSearch', () => {
  it('reads the ?sso_ticket= param', () => {
    expect(readSsoTicketFromSearch('?returnTo=%2F&sso_ticket=ticket-abc-123')).toBe(
      'ticket-abc-123',
    );
  });

  it('accepts a bare query string without a leading ?', () => {
    expect(readSsoTicketFromSearch('sso_ticket=ticket-abc-123')).toBe('ticket-abc-123');
  });

  it('returns null when no ticket is present', () => {
    expect(readSsoTicketFromSearch('')).toBeNull();
    expect(readSsoTicketFromSearch('?returnTo=%2Feditor')).toBeNull();
    expect(readSsoTicketFromSearch('?sso_ticket=')).toBeNull();
    expect(readSsoTicketFromSearch('?sso_ticket=%20%20')).toBeNull();
  });

  it('does NOT treat legacy token params as tickets', () => {
    expect(readSsoTicketFromSearch('?token=tok1234567')).toBeNull();
    expect(readSsoTicketFromSearch('?accessToken=tok1234567')).toBeNull();
    expect(readSsoTicketFromSearch('?__quant_sso_ticket=tok1234567')).toBeNull();
  });

  it('exposes the ticket param name', () => {
    expect(SSO_TICKET_PARAM).toBe('sso_ticket');
  });
});

describe('scrubSsoParamsFromUrl', () => {
  it('removes the ticket but preserves returnTo and other params', () => {
    const scrubbed = scrubSsoParamsFromUrl(
      'https://quantcooks.quantrinity.in/login?returnTo=%2Feditor&sso_ticket=ticket-abc-123',
    );
    expect(scrubbed).not.toContain('sso_ticket=');
    expect(scrubbed).not.toContain('ticket-abc-123');
    expect(scrubbed).toBe('/login?returnTo=%2Feditor');
  });

  it('removes legacy token params defensively (never trusted, never linger)', () => {
    const scrubbed = scrubSsoParamsFromUrl(
      'https://quantcooks.quantrinity.in/login?token=tok123&accessToken=tok456&__quant_sso_ticket=tok789',
    );
    expect(scrubbed).not.toContain('tok123');
    expect(scrubbed).not.toContain('tok456');
    expect(scrubbed).not.toContain('tok789');
    expect(scrubbed).toBe('/login');
  });

  it('preserves the hash fragment', () => {
    const scrubbed = scrubSsoParamsFromUrl(
      'https://quantcooks.quantrinity.in/login?sso_ticket=ticket-abc-123#section',
    );
    expect(scrubbed).toBe('/login#section');
  });

  it('is a no-op when no handoff params exist', () => {
    expect(scrubSsoParamsFromUrl('https://quantcooks.quantrinity.in/login?returnTo=%2F')).toBe(
      '/login?returnTo=%2F',
    );
  });
});
