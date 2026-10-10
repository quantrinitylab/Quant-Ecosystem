// @vitest-environment jsdom
// ============================================================================
// QM-UIUX-091 — Wire a real data-export UI to the QM-BACK-006 export backend.
//
// The backend export center (`backend/routes/data-lifecycle.ts`) has been
// live since QM-BACK-006 — POST/GET `/data-lifecycle/exports`,
// POST `/data-lifecycle/exports/:id/build` — but no frontend surface ever
// referenced it, so a user had no way to request an export. These tests pin
// the Account page control (`DataExportSettings`) to the REAL contract:
//
//  - creating an export goes through `apiClient.requestDataExport` (which
//    posts to the proxied backend route) and the list is re-read from the
//    server afterwards — the row the user sees is the server's record, not
//    local optimism;
//  - each backend status (`requested` / `completed` / `failed` — the
//    DataExportStatus enum, nothing else exists) renders as itself,
//    including the backend's own `error` string on a failed export;
//  - generating renders the manifest the build actually returned (counts
//    only, per the backend's own note);
//  - failures surface as errors with the server's message — never as a
//    success state, and no invented timelines or delivery promises appear
//    anywhere in the copy.
//
// The apiClient boundary is mocked (it is the component's dependency; the
// proxy forwarding itself is pinned in api-route-allowlist.test.ts). The
// component, its state machine and its rendering are the production code.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  listDataExports: vi.fn(),
  requestDataExport: vi.fn(),
  buildDataExport: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    listDataExports: mocks.listDataExports,
    requestDataExport: mocks.requestDataExport,
    buildDataExport: mocks.buildDataExport,
  },
}));

import { DataExportSettings } from '../app/settings/account/DataExportSettings';
import type {
  DataExportManifest,
  DataExportRequestRecord,
} from '../services/api-client';

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; statusCode: number } };

const ok = <T,>(data: T): ApiResult<T> => ({ success: true, data });
const fail = (message: string): ApiResult<never> => ({
  success: false,
  error: { code: 'TEST_FAILURE', message, statusCode: 500 },
});

const row = (overrides?: Partial<DataExportRequestRecord>): DataExportRequestRecord => ({
  id: 'exp-1',
  userId: 'user-1',
  scope: 'mailbox-inventory',
  status: 'requested',
  artifactRef: null,
  error: null,
  requestedAt: '2026-10-09T10:00:00.000Z',
  completedAt: null,
  ...overrides,
});

const MANIFEST: DataExportManifest = {
  version: 'mailbox-inventory.v1',
  generatedAt: '2026-10-09T10:05:00.000Z',
  classes: {
    emails: { count: 12, retention: 'policy-driven (see retention_policies)' },
    threads: { count: 5, retention: 'follows member emails' },
    contacts: { count: 3, retention: 'until user deletes' },
    driveFiles: { count: 2, retention: 'until user deletes' },
  },
  compliance: {
    activeLegalHoldsPlacedByUser: 0,
    priorExports: 1,
    activeRetentionPolicies: 0,
  },
  note: 'Counts only. Message bodies, file contents and secrets are never included in lifecycle payloads.',
};

let container: HTMLDivElement;
let root: Root;

async function renderSection() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<DataExportSettings />);
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`No button containing "${text}" was rendered`);
  return button as HTMLButtonElement;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const text = () => container.textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('QM-UIUX-091 DataExportSettings', () => {
  it('lists past exports with their real backend statuses — including the failure error', async () => {
    mocks.listDataExports.mockResolvedValue(
      ok([
        row({ id: 'exp-req', status: 'requested' }),
        row({
          id: 'exp-done',
          status: 'completed',
          artifactRef: 'inline-manifest:exp-done',
          completedAt: '2026-10-09T10:05:00.000Z',
        }),
        row({ id: 'exp-bad', status: 'failed', error: 'Export build failed: disk full' }),
      ]),
    );

    await renderSection();

    expect(text()).toContain('Data export');
    expect(text()).toContain('Requested');
    expect(text()).toContain('Completed');
    expect(text()).toContain('Failed');
    // The failed row shows the backend's own error string, not a paraphrase.
    expect(text()).toContain('Export build failed: disk full');
    // Only the still-requested export offers the generate action.
    expect(buttonByText('Generate inventory')).toBeTruthy();
    // A completed row names its real artifact reference; no download is
    // invented, because the backend delivers the manifest inline only.
    expect(text()).toContain('inline-manifest:exp-done');
    expect(container.querySelector('a[download]')).toBeNull();
    // No invented timelines or delivery promises anywhere in the section.
    expect(text()).not.toMatch(/within \d+\s*(day|hour|minute)/i);
    expect(text()).not.toMatch(/emailed to you|sent to your inbox/i);
  });

  it('creates an export through the real client call and re-reads the list', async () => {
    mocks.listDataExports
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValue(ok([row({ id: 'exp-new', status: 'requested' })]));
    mocks.requestDataExport.mockResolvedValue(
      ok({ exportId: 'exp-new', operationId: 'op-1', status: 'requested', scope: 'mailbox-inventory' }),
    );

    await renderSection();
    expect(text()).toContain('No exports yet');

    await click(buttonByText('Request data export'));

    expect(mocks.requestDataExport).toHaveBeenCalledTimes(1);
    // The list is re-read from the server after creating — the rendered row
    // is the server's record, not an optimistic local invention.
    expect(mocks.listDataExports).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Requested');
    expect(text()).not.toContain('No exports yet');
  });

  it('generates the inventory and renders the manifest the build returned', async () => {
    mocks.listDataExports
      .mockResolvedValueOnce(ok([row({ id: 'exp-1', status: 'requested' })]))
      .mockResolvedValue(
        ok([
          row({
            id: 'exp-1',
            status: 'completed',
            artifactRef: 'inline-manifest:exp-1',
            completedAt: '2026-10-09T10:05:00.000Z',
          }),
        ]),
      );
    mocks.buildDataExport.mockResolvedValue(
      ok({
        exportId: 'exp-1',
        status: 'completed',
        artifactRef: 'inline-manifest:exp-1',
        manifest: MANIFEST,
      }),
    );

    await renderSection();
    await click(buttonByText('Generate inventory'));

    expect(mocks.buildDataExport).toHaveBeenCalledTimes(1);
    expect(mocks.buildDataExport).toHaveBeenCalledWith('exp-1');
    expect(text()).toContain('Completed');
    // The counts are the manifest's real counts, labelled by class.
    expect(text()).toContain('Emails');
    expect(text()).toContain('12');
    expect(text()).toContain('Threads');
    expect(text()).toContain('Drive files');
    expect(text()).toContain('Counts only.');
  });

  it('surfaces a create failure as an error — never as a new export', async () => {
    mocks.listDataExports.mockResolvedValue(ok([]));
    mocks.requestDataExport.mockResolvedValue(fail('Data-lifecycle operations require the database'));

    await renderSection();
    await click(buttonByText('Request data export'));

    expect(mocks.requestDataExport).toHaveBeenCalledTimes(1);
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Data-lifecycle operations require the database');
    // No success theatre: the list still truthfully reads empty.
    expect(text()).toContain('No exports yet');
    expect(text()).not.toContain('Generate inventory');
  });

  it('surfaces a build failure honestly — the re-read row is Failed with the backend error', async () => {
    mocks.listDataExports
      .mockResolvedValueOnce(ok([row({ id: 'exp-1', status: 'requested' })]))
      .mockResolvedValue(
        ok([row({ id: 'exp-1', status: 'failed', error: 'Export build failed: boom' })]),
      );
    mocks.buildDataExport.mockResolvedValue(fail('Export build failed: boom'));

    await renderSection();
    await click(buttonByText('Generate inventory'));

    expect(mocks.buildDataExport).toHaveBeenCalledWith('exp-1');
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Export build failed: boom');
    expect(text()).toContain('Failed');
    expect(text()).not.toContain('Completed');
  });

  it('shows an honest error state with retry when the list cannot load', async () => {
    mocks.listDataExports
      .mockResolvedValueOnce(fail('The requested service is temporarily unavailable.'))
      .mockResolvedValue(ok([]));

    await renderSection();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The requested service is temporarily unavailable.');

    await click(buttonByText('Retry'));

    expect(mocks.listDataExports).toHaveBeenCalledTimes(2);
    expect(text()).toContain('No exports yet');
  });
});
