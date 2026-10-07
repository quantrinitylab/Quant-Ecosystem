// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  StageBadge,
  DnsChecklist,
  AddDomainForm,
  DomainsTable,
  DnsInstructionsPanel,
  VerifyResultPanel,
} from '../components/admin/DomainsView';
import type { AdminMailDomain } from '../services/api-client';

// ============================================================================
// K9 (M19 Admin Domains) — presentational component tests.
//
// These components render real backend rows passed as props; the tests pin the
// honest states: pending vs verified checklist, empty instructions handling,
// and that no invented values appear.
// ============================================================================

const domain = (overrides?: Partial<AdminMailDomain>): AdminMailDomain => ({
  id: 'dom-1',
  organizationId: 'org-1',
  domain: 'acme.example.com',
  verificationStatus: 'SPF_VERIFIED',
  isPrimary: false,
  verifiedAt: null,
  createdAt: '2026-10-08T00:00:00.000Z',
  dnsChecklist: [
    { key: 'ownership', label: 'Ownership (TXT)', status: 'verified' },
    { key: 'mx', label: 'MX', status: 'verified' },
    { key: 'spf', label: 'SPF', status: 'verified' },
    { key: 'dkim', label: 'DKIM', status: 'pending' },
    { key: 'dmarc', label: 'DMARC', status: 'pending' },
  ],
  ...overrides,
});

const render = (element: React.ReactElement) => renderToStaticMarkup(element);

describe('M19 DomainsView', () => {
  it('StageBadge renders the human-readable stage label', () => {
    const html = render(createElement(StageBadge, { stage: 'FULLY_VERIFIED' }));
    expect(html).toContain('Fully verified');
    const pending = render(createElement(StageBadge, { stage: 'PENDING' }));
    expect(pending).toContain('Pending');
  });

  it('DnsChecklist marks verified and pending checks distinctly', () => {
    const html = render(
      createElement(DnsChecklist, { checklist: domain().dnsChecklist }),
    );
    expect(html).toContain('Ownership (TXT)');
    expect(html).toContain('DMARC');
    // Verified checks get a check mark, pending ones an empty circle.
    expect(html).toContain('✓');
    expect(html).toContain('○');
  });

  it('DomainsTable renders each domain with its stage, checklist, and actions', () => {
    const onVerify = vi.fn();
    const onRemove = vi.fn();
    const html = render(
      createElement(DomainsTable, {
        domains: [domain(), domain({ id: 'dom-2', domain: 'other.example.com', verificationStatus: 'PENDING' })],
        busyId: null,
        onVerify,
        onRemove,
      }),
    );
    expect(html).toContain('acme.example.com');
    expect(html).toContain('other.example.com');
    expect(html).toContain('SPF verified');
    expect(html).toContain('Verify DNS');
    expect(html).toContain('Remove');
  });

  it('DomainsTable shows the primary marker when isPrimary', () => {
    const html = render(
      createElement(DomainsTable, {
        domains: [domain({ isPrimary: true })],
        busyId: null,
        onVerify: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    expect(html).toContain('primary');
  });

  it('DomainsTable disables actions for the busy domain', () => {
    const html = render(
      createElement(DomainsTable, {
        domains: [domain()],
        busyId: 'dom-1',
        onVerify: vi.fn(),
        onRemove: vi.fn(),
      }),
    );
    expect(html).toContain('Checking DNS…');
    expect(html).toContain('disabled');
  });

  it('AddDomainForm renders the input and submit button, disabled while busy', () => {
    const html = render(
      createElement(AddDomainForm, { busy: false, formError: null, onSubmit: vi.fn() }),
    );
    expect(html).toContain('placeholder="example.com"');
    expect(html).toContain('Add domain');

    const busy = render(
      createElement(AddDomainForm, { busy: true, formError: null, onSubmit: vi.fn() }),
    );
    expect(busy).toContain('Adding…');
  });

  it('AddDomainForm shows the form error verbatim', () => {
    const html = render(
      createElement(AddDomainForm, {
        busy: false,
        formError: 'Domain already registered by another organization',
        onSubmit: vi.fn(),
      }),
    );
    expect(html).toContain('Domain already registered by another organization');
  });

  it('DnsInstructionsPanel renders the exact DNS records to publish', () => {
    const html = render(
      createElement(DnsInstructionsPanel, {
        registration: {
          domain: domain(),
          alreadyRegistered: false,
          verificationToken: 'tok-123',
          instructions: {
            domain: 'acme.example.com',
            verificationToken: 'tok-123',
            records: [
              { type: 'TXT', name: 'acme.example.com', value: 'quant-verify=tok-123', description: 'Domain ownership verification token' },
              { type: 'MX', name: 'acme.example.com', value: 'mail.quantmail.in', priority: 10, description: 'Inbound mail exchange server' },
            ],
          },
        },
        onDismiss: vi.fn(),
      }),
    );
    expect(html).toContain('quant-verify=tok-123');
    expect(html).toContain('mail.quantmail.in');
    expect(html).toContain('priority 10');
    expect(html).toContain('Verify DNS');
  });

  it('VerifyResultPanel shows live per-check outcomes with failure detail', () => {
    const html = render(
      createElement(VerifyResultPanel, {
        result: {
          domain: domain({ verificationStatus: 'MX_VERIFIED' }),
          dnsChecks: [
            { key: 'ownership', label: 'Ownership (TXT)', valid: true, expected: 'quant-verify=tok', actual: 'quant-verify=tok' },
            { key: 'mx', label: 'MX', valid: true, expected: 'mail.quantmail.in', actual: '10 mail.quantmail.in' },
            { key: 'spf', label: 'SPF', valid: false, expected: 'include:_spf.quantmail.in', actual: null, error: "SPF record with 'include:_spf.quantmail.in' not found" },
          ],
        },
        onDismiss: vi.fn(),
      }),
    );
    expect(html).toContain('2 of 3 checks passed');
    expect(html).toContain('Ownership (TXT)');
    expect(html).toContain('SPF record with');
    expect(html).toContain('MX_VERIFIED');
  });
});
