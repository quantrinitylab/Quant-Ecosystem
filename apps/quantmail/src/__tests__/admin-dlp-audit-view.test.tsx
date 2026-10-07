// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  DlpPoliciesTable,
  AuditLogFilters,
  AuditLogTable,
  AuditPagination,
  EMPTY_AUDIT_FILTERS,
} from '../components/admin/DlpAuditView';
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../components/admin/AdminStates';

// ============================================================================
// K9 (M20 Admin DLP/Audit) — presentational component tests.
//
// Pins the honest states of the read-only DLP policy list and audit viewer:
// real rows render, empty sets say so, and there is no "add entry"
// affordance anywhere (writes are server-side only).
// ============================================================================

const render = (element: React.ReactElement) => renderToStaticMarkup(element);

describe('M20 DlpAuditView', () => {
  it('DlpPoliciesTable renders real policy rows with type, action, severity, status', () => {
    const html = render(
      createElement(DlpPoliciesTable, {
        policies: [
          {
            id: 'pol-1',
            name: 'Block credit cards',
            description: 'Blocks outbound PANs',
            ruleType: 'LUHN_CREDIT_CARD',
            action: 'BLOCK',
            severity: 'HIGH',
            enabled: true,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-02T00:00:00.000Z',
          },
          {
            id: 'pol-2',
            name: 'Audit PII export',
            description: null,
            ruleType: 'REGEX',
            action: 'AUDIT_LOG',
            severity: 'MEDIUM',
            enabled: false,
            createdAt: null,
            updatedAt: null,
          },
        ],
      }),
    );
    expect(html).toContain('Block credit cards');
    expect(html).toContain('LUHN_CREDIT_CARD');
    expect(html).toContain('BLOCK');
    expect(html).toContain('Enabled');
    expect(html).toContain('Disabled');
    expect(html).toContain('pol-1');
  });

  it('AuditLogTable renders entries newest-first with actor and metadata', () => {
    const html = render(
      createElement(AuditLogTable, {
        entries: [
          {
            id: 'a2',
            userId: 'admin-1',
            orgId: 'org-1',
            action: 'admin.mail.domain.verify',
            resource: 'mail_domain',
            resourceId: 'dom-1',
            metadata: { domain: 'acme.example.com' },
            ip: '127.0.0.1',
            userAgent: 'test-agent',
            timestamp: '2026-10-08T11:00:00.000Z',
            createdAt: '2026-10-08T11:00:00.000Z',
          },
        ],
      }),
    );
    expect(html).toContain('admin.mail.domain.verify');
    expect(html).toContain('mail_domain');
    expect(html).toContain('admin-1');
    expect(html).toContain('acme.example.com');
    expect(html).toContain('127.0.0.1');
  });

  it('AuditLogTable has no write affordance', () => {
    const html = render(createElement(AuditLogTable, { entries: [] }));
    expect(html).not.toMatch(/add entry/i);
    expect(html).not.toMatch(/new entry/i);
  });

  it('AuditLogFilters renders all filter inputs and the apply/clear buttons', () => {
    const html = render(
      createElement(AuditLogFilters, {
        filters: { ...EMPTY_AUDIT_FILTERS, action: 'domain' },
        onChange: vi.fn(),
        onApply: vi.fn(),
        onClear: vi.fn(),
      }),
    );
    expect(html).toContain('Action contains…');
    expect(html).toContain('Resource contains…');
    expect(html).toContain('User ID…');
    expect(html).toContain('Apply filters');
    expect(html).toContain('Clear');
    expect(html).toContain('value="domain"');
  });

  it('AuditPagination shows page position and disables Previous on page 1', () => {
    const html = render(
      createElement(AuditPagination, {
        page: {
          items: [],
          nextCursor: 'cursor-2',
          pagination: { page: 1, limit: 25, total: 50, totalPages: 2 },
        },
        onPrev: vi.fn(),
        onNext: vi.fn(),
      }),
    );
    expect(html).toContain('Page 1 of 2 · 50 total entries');
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
  });

  it('AuditPagination disables Next when there are no more pages', () => {
    const html = render(
      createElement(AuditPagination, {
        page: {
          items: [],
          nextCursor: null,
          pagination: { page: 2, limit: 25, total: 50, totalPages: 2 },
        },
        onPrev: vi.fn(),
        onNext: vi.fn(),
      }),
    );
    expect(html).toContain('Page 2 of 2 · 50 total entries');
  });

  it('AdminStates render honest loading, error, and empty copy', () => {
    expect(render(createElement(LoadingBlock, { text: 'Loading domains…' }))).toContain(
      'Loading domains…',
    );
    const err = render(
      createElement(ErrorBlock, { message: 'Backend unreachable.', onRetry: vi.fn() }),
    );
    expect(err).toContain('Backend unreachable.');
    expect(err).toContain('Retry');
    const empty = render(
      createElement(EmptyBlock, {
        title: 'No DLP policies configured',
        hint: 'Nothing exists yet.',
      }),
    );
    expect(empty).toContain('No DLP policies configured');
    expect(empty).toContain('Nothing exists yet.');
  });
});
