// @vitest-environment jsdom
// ============================================================================
// PR #1506 deep-fix — useDrive.setFolderColor optimistic-write contract.
//
// The hook claims optimistic update with rollback. These tests drive the REAL
// hook (mocked transport only) and prove, end to end:
// - the folder tint changes IMMEDIATELY on pick, before the PUT resolves;
// - a failed PUT rolls the tint back and surfaces an honest error, never a
//   stuck tint claiming a color the server rejected;
// - rapid re-picks are last-write-wins: a stale failure must not clobber a
//   newer pick, and two failures must not leave an unconfirmed tint behind.
//   (The pre-fix code failed both: a stale failure rolled back to its own
//   captured `previous`, so red-then-blue with red failing ended at null
//   even when blue succeeded, and fail-then-fail ended at red.)
// - the network itself is serialized per folder (issue order = server
//   order), while the tint itself is never delayed by that serialization.
// - files and other folders are never tinted or touched.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDrive, type UseDriveReturn, type DriveFile } from '../hooks/useDrive';

vi.mock('../services/browser-api-request', () => ({
  browserApiRequest: vi.fn(),
}));

import { browserApiRequest } from '../services/browser-api-request';

const mockRequest = vi.mocked(browserApiRequest);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RED = '#E87171';
const BLUE = '#63B3ED';

function folder(id: string, color: string | null): DriveFile {
  return {
    id,
    name: `Folder ${id}`,
    type: 'folder',
    mimeType: 'application/vnd.quant.folder',
    size: 0,
    path: `/Folder ${id}`,
    parentId: null,
    modifiedAt: '',
    owner: { name: 'A', email: 'a@example.com' },
    sharedWith: [],
    isStarred: false,
    versions: [],
    color,
  };
}

function fileItem(id: string): DriveFile {
  return {
    id,
    name: `File ${id}`,
    type: 'file',
    mimeType: 'text/plain',
    size: 10,
    path: `/File ${id}`,
    parentId: null,
    modifiedAt: '',
    owner: { name: 'A', email: 'a@example.com' },
    sharedWith: [],
    isStarred: false,
    versions: [],
  };
}

let latest: UseDriveReturn | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe() {
  latest = useDrive();
  return null;
}

function renderProbe() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Probe />);
  });
}

async function seedFiles(files: DriveFile[]) {
  mockRequest.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/drive/files')) {
      return new Response(JSON.stringify({ files }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  });
  await act(async () => {
    await latest!.fetchFiles();
  });
  expect(latest!.files).toHaveLength(files.length);
}

function folderColor(id: string): string | null | undefined {
  return latest!.files.find((f) => f.id === id)?.color;
}

function putCalls() {
  return mockRequest.mock.calls.filter(([url]) => String(url).includes('/color'));
}

// Drain the serialized PUT chain: each hop (deferred resolve → run →
// next PUT issued) costs several microtask ticks.
async function flushChain() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  latest = null;
});

beforeEach(() => {
  vi.clearAllMocks();
  renderProbe();
});

describe('useDrive.setFolderColor optimistic write', () => {
  it('changes the tint immediately on pick, before the PUT resolves', async () => {
    await seedFiles([folder('f1', null)]);
    let resolvePut!: (res: Response) => void;
    mockRequest.mockImplementation(async (url: string) => {
      if (String(url).includes('/color')) {
        return new Promise<Response>((resolve) => {
          resolvePut = resolve;
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    let result: Promise<boolean> | null = null;
    act(() => {
      result = latest!.setFolderColor('f1', RED);
    });
    // PUT still in flight, but the tint already moved.
    expect(folderColor('f1')).toBe(RED);
    // Let the serialized chain issue the PUT (microtask), then resolve it.
    await act(async () => {
      await flushChain();
    });
    expect(typeof resolvePut).toBe('function');
    await act(async () => {
      resolvePut(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
      expect(await result).toBe(true);
    });
    expect(folderColor('f1')).toBe(RED);
    expect(latest!.error).toBeNull();
  });

  it('rolls back to the prior tint with an honest error when the PUT fails', async () => {
    await seedFiles([folder('f1', null), fileItem('file1')]);
    mockRequest.mockImplementation(async (url: string) => {
      if (String(url).includes('/color')) {
        return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await latest!.setFolderColor('f1', RED);
    });
    expect(ok).toBe(false);
    expect(folderColor('f1')).toBeNull();
    expect(latest!.error).toBe('Failed to set folder color');
    // The file row was never touched.
    expect(latest!.files.find((f) => f.id === 'file1')?.color).toBeUndefined();
  });

  it('rapid re-pick is last-write-wins: a stale failure never clobbers the newer pick', async () => {
    await seedFiles([folder('f1', null)]);
    const deferred: { resolve: (res: Response) => void }[] = [];
    mockRequest.mockImplementation(async (url: string) => {
      if (String(url).includes('/color')) {
        return new Promise<Response>((resolve) => {
          deferred.push({ resolve });
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    let p1: Promise<boolean> | null = null;
    let p2: Promise<boolean> | null = null;
    act(() => {
      p1 = latest!.setFolderColor('f1', RED);
    });
    act(() => {
      p2 = latest!.setFolderColor('f1', BLUE);
    });
    // Second pick applied immediately, but its PUT is still queued behind
    // the first (serialization): exactly one PUT has been issued.
    expect(folderColor('f1')).toBe(BLUE);
    await act(async () => {
      await flushChain();
    });
    expect(putCalls()).toHaveLength(1);
    expect(putCalls()[0][1]).toMatchObject({ method: 'PUT' });
    // First PUT fails → second PUT is now issued, in issue order.
    await act(async () => {
      deferred[0].resolve(
        new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } }),
      );
      await flushChain();
    });
    expect(putCalls()).toHaveLength(2);
    // Second PUT succeeds → final tint is the LAST pick, not the stale
    // rollback target (null). The pre-fix code ended here at null.
    let r1: boolean | undefined;
    let r2: boolean | undefined;
    await act(async () => {
      deferred[1].resolve(
        new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      );
      r1 = await p1;
      r2 = await p2;
    });
    expect(r1).toBe(false);
    expect(r2).toBe(true);
    expect(folderColor('f1')).toBe(BLUE);
    expect(latest!.error).toBeNull();
  });

  it('two failures leave no unconfirmed tint behind (rollback to server-confirmed)', async () => {
    await seedFiles([folder('f1', null)]);
    const deferred: { resolve: (res: Response) => void }[] = [];
    mockRequest.mockImplementation(async (url: string) => {
      if (String(url).includes('/color')) {
        return new Promise<Response>((resolve) => {
          deferred.push({ resolve });
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    let p1: Promise<boolean> | null = null;
    let p2: Promise<boolean> | null = null;
    act(() => {
      p1 = latest!.setFolderColor('f1', RED);
    });
    act(() => {
      p2 = latest!.setFolderColor('f1', BLUE);
    });
    expect(folderColor('f1')).toBe(BLUE);
    await act(async () => {
      await flushChain();
    });
    await act(async () => {
      deferred[0].resolve(
        new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } }),
      );
      await flushChain();
    });
    let r1: boolean | undefined;
    let r2: boolean | undefined;
    await act(async () => {
      deferred[1].resolve(
        new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } }),
      );
      r1 = await p1;
      r2 = await p2;
    });
    expect(r1).toBe(false);
    expect(r2).toBe(false);
    // Both picks failed: back to the original server-confirmed null, NOT
    // the first pick's unconfirmed red (the pre-fix code ended at red).
    expect(folderColor('f1')).toBeNull();
    expect(latest!.error).toBe('Failed to set folder color');
  });

  it('first succeeds then second fails: tint stays at the server-confirmed color', async () => {
    await seedFiles([folder('f1', null)]);
    const deferred: { resolve: (res: Response) => void }[] = [];
    mockRequest.mockImplementation(async (url: string) => {
      if (String(url).includes('/color')) {
        return new Promise<Response>((resolve) => {
          deferred.push({ resolve });
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    let p1: Promise<boolean> | null = null;
    let p2: Promise<boolean> | null = null;
    act(() => {
      p1 = latest!.setFolderColor('f1', RED);
    });
    act(() => {
      p2 = latest!.setFolderColor('f1', BLUE);
    });
    expect(folderColor('f1')).toBe(BLUE);
    await act(async () => {
      await flushChain();
    });
    await act(async () => {
      deferred[0].resolve(
        new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      );
      await flushChain();
    });
    let r1: boolean | undefined;
    let r2: boolean | undefined;
    await act(async () => {
      deferred[1].resolve(
        new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } }),
      );
      r1 = await p1;
      r2 = await p2;
    });
    expect(r1).toBe(true);
    expect(r2).toBe(false);
    // Blue failed, but red DID persist on the server — rolling back to the
    // pre-red null would lie about server state. Red is the honest tint.
    expect(folderColor('f1')).toBe(RED);
  });

  it('does not tint other folders or files', async () => {
    await seedFiles([folder('f1', null), folder('f2', BLUE), fileItem('file1')]);
    mockRequest.mockImplementation(async (url: string) => {
      if (String(url).includes('/color')) {
        return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    await act(async () => {
      expect(await latest!.setFolderColor('f1', RED)).toBe(true);
    });
    expect(folderColor('f1')).toBe(RED);
    expect(folderColor('f2')).toBe(BLUE);
    expect(latest!.files.find((f) => f.id === 'file1')?.color).toBeUndefined();
  });
});
