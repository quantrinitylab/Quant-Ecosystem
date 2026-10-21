// @vitest-environment jsdom
// ============================================================================
// drive-cleaner-account-scope — CODEX-REVIEW 6308089740 corrective tests.
//
// The DuplicateCleanerManager used to be created once with useMemo([]) and was
// NOT account/session scoped: groups (filenames/paths), checkbox selections
// and retained deletion IDs survived an account switch, a late prior-epoch
// scan could repopulate the new account's view, and a failed FIRST scan
// marked hasScanned → error + "No duplicates found" rendered together.
//
// These are MOUNTED tests (real manager + real DriveCleanerSubView through
// React, following the PeopleList.test.tsx pattern — jsdom + createRoot +
// act; no @testing-library/react, which is not a dependency):
//   (a) A→B account switch leaks no names/paths/selected deletion IDs
//   (b) mid-scan account switch drops the late A response
//   (c) B's cleanup never submits A's retained IDs
//   (d) failed first scan renders the error only
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import React, { act, useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  DuplicateCleanerManager,
  type DuplicateGroup,
} from '../components/drive/AIDuplicateCleanerModal';
import {
  DriveCleanerSubView,
  duplicateGroupsToClusters,
} from '../app/drive/components/DriveCleanerSubView';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

type ApiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function okJson(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function accountAGroups(): DuplicateGroup[] {
  return [
    {
      hash: 'hash-aaa111',
      files: [
        {
          id: 'A-orig-1',
          name: 'A-quarterly-report.pdf',
          size: 1048576,
          modifiedAt: '2026-09-20T10:00:00Z',
          path: '/A-Drive/A-quarterly-report.pdf',
          contentHash: 'hash-aaa111',
          isOriginal: true,
          selectedForDeletion: false,
        },
        {
          id: 'A-dup-1',
          name: 'A-quarterly-report copy.pdf',
          size: 1048576,
          modifiedAt: '2026-09-10T10:00:00Z',
          path: '/A-Drive/Backups/A-quarterly-report copy.pdf',
          contentHash: 'hash-aaa111',
          isOriginal: false,
          selectedForDeletion: true,
        },
      ],
      potentialSavings: 1048576,
    },
  ];
}

/**
 * Mirrors the drive page wiring: one shared manager, bindAccount() on
 * identity change, hasScanned derived ONLY from completedScanCount.
 */
function CleanerHarness({
  accountKey,
  apiFetch,
  managerRef,
}: {
  accountKey: string | null;
  apiFetch: ApiFetch;
  managerRef: { current: DuplicateCleanerManager | null };
}) {
  const manager = useMemo(() => new DuplicateCleanerManager({ apiFetch }), [apiFetch]);
  useEffect(() => {
    manager.bindAccount(accountKey);
  }, [manager, accountKey]);
  useEffect(() => {
    managerRef.current = manager;
  }, [manager, managerRef]);
  const [state, setState] = useState(() => manager.getState());
  useEffect(() => manager.subscribe(setState), [manager]);
  const hasScanned = state.completedScanCount > 0;
  return (
    <DriveCleanerSubView
      clusters={duplicateGroupsToClusters(state.groups)}
      isScanning={state.isScanning}
      scanError={state.error}
      hasScanned={hasScanned}
      onScan={() => {
        manager.scanDuplicates().catch(() => {});
      }}
      onOpenCleanup={() => {}}
    />
  );
}

const roots: Root[] = [];
afterEach(() => {
  while (roots.length) roots.pop()!.unmount();
  document.body.innerHTML = '';
});

async function mountHarness(opts: {
  accountKey: string | null;
  apiFetch: ApiFetch;
  managerRef: { current: DuplicateCleanerManager | null };
}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<CleanerHarness {...opts} />);
  });
  return { container, root };
}

async function rerenderHarness(
  root: Root,
  opts: {
    accountKey: string | null;
    apiFetch: ApiFetch;
    managerRef: { current: DuplicateCleanerManager | null };
  },
) {
  await act(async () => {
    root.render(<CleanerHarness {...opts} />);
  });
}

async function runScan(managerRef: { current: DuplicateCleanerManager | null }) {
  await act(async () => {
    await managerRef.current!.scanDuplicates().catch(() => {});
  });
}

describe('duplicate cleaner account scoping (CODEX-REVIEW 6308089740)', () => {
  it('(a) A→B account switch leaks no names, paths, or selected deletion IDs', async () => {
    const managerRef: { current: DuplicateCleanerManager | null } = { current: null };
    const apiFetch: ApiFetch = async () => okJson({ groups: accountAGroups() });
    const { container, root } = await mountHarness({
      accountKey: 'account-A',
      apiFetch,
      managerRef,
    });
    await runScan(managerRef);

    // A's data is visible before the switch.
    expect(container.textContent).toContain('A-quarterly-report.pdf');
    expect(managerRef.current!.getSelectedFileIds()).toContain('A-dup-1');

    // Switch identity without unmounting (the exact CODEX scenario).
    await rerenderHarness(root, { accountKey: 'account-B', apiFetch, managerRef });

    const text = container.textContent ?? '';
    expect(text).not.toContain('A-quarterly-report');
    expect(text).not.toContain('/A-Drive');
    expect(managerRef.current!.getState().groups).toHaveLength(0);
    expect(managerRef.current!.getSelectedFileIds()).toHaveLength(0);
    expect(managerRef.current!.getState().error).toBeNull();
    expect(managerRef.current!.getState().lastCleanedResult).toBeNull();
  });

  it('(b) mid-scan account switch drops the late A response', async () => {
    const managerRef: { current: DuplicateCleanerManager | null } = { current: null };
    let resolveScan!: (res: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      resolveScan = resolve;
    });
    const apiFetch: ApiFetch = async () => gate;
    const { container, root } = await mountHarness({
      accountKey: 'account-A',
      apiFetch,
      managerRef,
    });

    // Start A's scan; the network response has not arrived yet.
    let scanPromise: Promise<unknown>;
    await act(async () => {
      scanPromise = managerRef.current!.scanDuplicates().catch(() => {});
    });
    expect(managerRef.current!.getState().isScanning).toBe(true);

    // Identity changes mid-scan.
    await rerenderHarness(root, { accountKey: 'account-B', apiFetch, managerRef });

    // A's late response finally arrives — it must be dropped.
    await act(async () => {
      resolveScan(okJson({ groups: accountAGroups() }));
      await scanPromise;
    });

    expect(managerRef.current!.getState().groups).toHaveLength(0);
    expect(managerRef.current!.getState().completedScanCount).toBe(0);
    expect(container.textContent ?? '').not.toContain('A-quarterly-report');
  });

  it("(c) B's cleanup never submits A's retained IDs", async () => {
    const managerRef: { current: DuplicateCleanerManager | null } = { current: null };
    const trashBodies: string[] = [];
    const apiFetch: ApiFetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/api/drive/files/trash')) {
        trashBodies.push(String(init?.body ?? ''));
        return okJson({ success: true });
      }
      return okJson({ groups: accountAGroups() });
    };
    const { root } = await mountHarness({
      accountKey: 'account-A',
      apiFetch,
      managerRef,
    });
    await runScan(managerRef);

    // A's duplicate arrives pre-selected (auto-designation); the selection
    // is A's retained state. Then the identity changes.
    expect(managerRef.current!.getSelectedFileIds()).toContain('A-dup-1');
    await rerenderHarness(root, { accountKey: 'account-B', apiFetch, managerRef });

    // B hits cleanup (e.g. a stale handler): nothing of A's may be sent.
    let result!: { removedCount: number; savedBytes: number };
    await act(async () => {
      result = await managerRef.current!.executeCleanup();
    });
    expect(result).toEqual({ removedCount: 0, savedBytes: 0 });
    expect(trashBodies).toHaveLength(0);
  });

  it('(d) failed first scan renders the error only', async () => {
    const managerRef: { current: DuplicateCleanerManager | null } = { current: null };
    const apiFetch: ApiFetch = async () =>
      ({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Duplicate Scan Indexer unavailable' }),
      }) as Response;
    const { container } = await mountHarness({
      accountKey: 'account-A',
      apiFetch,
      managerRef,
    });
    await runScan(managerRef);

    const text = container.textContent ?? '';
    // The honest error is shown…
    expect(text).toContain('Duplicate scan failed');
    expect(text).toContain('Duplicate Scan Indexer unavailable');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    // …and nothing else claims a result: no false-clean empty state,
    // and no "No scan yet" (a scan WAS attempted).
    expect(text).not.toContain('No duplicates found');
    expect(text).not.toContain('No scan yet');
    expect(text).toContain("couldn't complete");
  });
});
