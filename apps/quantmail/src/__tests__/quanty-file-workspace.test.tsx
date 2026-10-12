// QM-M39-011 — tests for the Quanty file workspace (manager + drawer).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QuantyFileWorkspace,
  QuantyFileWorkspaceManager,
} from '../components/drive/QuantyFileWorkspace';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

function makeFetch(routes: Record<string, unknown>) {
  const entries = Object.entries(routes).sort((a, b) => b[0].length - a[0].length);
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [prefix, body] of entries) {
      if (url.startsWith(prefix)) return jsonResponse(body);
    }
    return jsonResponse({ error: 'not mocked' }, false);
  });
}

const FILE = { id: 'file-1', name: 'notes.txt', mimeType: 'text/plain' };

function doneTask() {
  return {
    id: 'task-1',
    command: 'find files quarterly',
    status: 'done',
    steps: [{ id: 's1', label: 'Searching Drive files', status: 'done', destructive: false }],
    resultSummary: 'Found 2 files matching "quarterly".',
  };
}

describe('QuantyFileWorkspaceManager', () => {
  it('asks Quanty and reports the real task result (no simulated progress)', async () => {
    const apiFetch = makeFetch({
      '/api/quanty/tasks': { taskId: 'task-1' },
      '/api/quanty/tasks/task-1': doneTask(),
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any });
    manager.setCommand('find files quarterly');
    await manager.askQuanty();
    const { ask } = manager.getState();
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/quanty/tasks',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(ask.task?.status).toBe('done');
    expect(ask.task?.steps[0].label).toBe('Searching Drive files');
    expect(ask.task?.resultSummary).toContain('Found 2 files');
    expect(ask.polling).toBe(false);
    expect(ask.error).toBeNull();
    manager.dispose();
  });

  it('surfaces a real backend error instead of inventing a task', async () => {
    const apiFetch = vi.fn(async () => jsonResponse({ error: 'backend down' }, false));
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any });
    manager.setCommand('find files x');
    await manager.askQuanty();
    const { ask } = manager.getState();
    expect(ask.status).toBe('error');
    expect(ask.task).toBeNull();
    expect(ask.error).toContain('backend down');
    manager.dispose();
  });

  it('asks for confirmation on waiting-confirm and resumes honestly', async () => {
    let pollCount = 0;
    const apiFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/quanty/tasks' && init?.method === 'POST') {
        return jsonResponse({ taskId: 'task-1' });
      }
      if (url.endsWith('/confirm')) {
        return jsonResponse({ ok: true });
      }
      if (url.startsWith('/api/quanty/tasks/task-1')) {
        pollCount += 1;
        return jsonResponse(
          pollCount === 1
            ? {
                id: 'task-1',
                command: 'move budget.xlsx to its folder',
                status: 'waiting-confirm',
                steps: [{ id: 's1', label: 'Moving file', status: 'waiting-confirm', destructive: true }],
              }
            : doneTask(),
        );
      }
      return jsonResponse({ error: 'not mocked' }, false);
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any, pollIntervalMs: 60_000 });
    manager.setCommand('move budget.xlsx to its folder');
    await manager.askQuanty();
    expect(manager.getState().ask.task?.status).toBe('waiting-confirm');
    await manager.confirmTask(true);
    const { ask } = manager.getState();
    expect(ask.task?.status).toBe('done');
    expect(ask.polling).toBe(false);
    manager.dispose();
  });

  it('searches files and maps backend results without inventing fields', async () => {
    const apiFetch = makeFetch({
      '/api/drive/ai/search': {
        results: [
          { fileId: 'f1', fileName: 'report.pdf', snippet: 'quarterly…', relevanceScore: 0.9 },
          { fileId: 'f2', name: 'notes.txt', snippet: '' },
        ],
      },
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any });
    await manager.searchFiles('quarterly');
    const { search } = manager.getState();
    expect(search.status).toBe('done');
    expect(search.results).toEqual([
      { fileId: 'f1', fileName: 'report.pdf', snippet: 'quarterly…', score: 0.9 },
      { fileId: 'f2', fileName: 'notes.txt', snippet: '', score: null },
    ]);
    manager.dispose();
  });

  it('suggests a destination then moves for real and notifies the file list', async () => {
    const onFilesChanged = vi.fn();
    const apiFetch = makeFetch({
      '/api/drive/ai/organize': {
        fileId: 'file-1',
        suggestedFolder: '/Documents',
        category: 'Documents',
        confidence: 0.85,
        folderId: 'folder-docs',
        applied: true,
      },
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any, onFilesChanged });
    manager.setCurrentFile(FILE);
    await manager.suggestDestination();
    const suggestion = manager.getState().organize.suggestion;
    expect(suggestion).toMatchObject({
      suggestedFolder: '/Documents',
      category: 'Documents',
      confidence: 0.85,
    });
    await manager.applyMove();
    const { organize } = manager.getState();
    expect(organize.appliedResult).toEqual({ action: 'moved', folder: '/Documents' });
    expect(onFilesChanged).toHaveBeenCalled();
    // The apply call really sent apply=true.
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/drive/ai/organize',
      expect.objectContaining({ body: JSON.stringify({ fileId: 'file-1', apply: true }) }),
    );
    manager.dispose();
  });

  it('refuses to copy when the suggested folder does not exist — honest error, no false success', async () => {
    const onFilesChanged = vi.fn();
    const apiFetch = makeFetch({
      '/api/drive/ai/organize': {
        fileId: 'file-1',
        suggestedFolder: '/Reports',
        category: 'Reports',
        confidence: 0.9,
        folderId: null,
        applied: false,
      },
      '/api/drive/folders': { folders: [{ id: 'folder-docs', name: 'Documents' }] },
      '/api/drive/files/file-1/copy': { id: 'file-2', name: 'notes.txt (copy)' },
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any, onFilesChanged });
    manager.setCurrentFile(FILE);
    await manager.suggestDestination();
    const notified: string[] = [];
    manager.subscribe((s) => notified.push(s.organize.status));
    await manager.copyToSuggestedFolder();
    const { organize } = manager.getState();
    expect(organize.status).toBe('error');
    expect(organize.error).toContain("doesn't exist");
    expect(organize.missingFolderName).toBe('Reports');
    // Subscribers are told — the drawer re-renders the honest error + the
    // "create folder" offer.
    expect(notified).toContain('error');
    // The false claim is gone: no success result...
    expect(organize.appliedResult).toBeNull();
    // ...and no copy was ever attempted — nothing duplicated in place.
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/copy'),
      expect.anything(),
    );
    expect(onFilesChanged).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('copies into the resolved folder and reports the real destination', async () => {
    const onFilesChanged = vi.fn();
    const apiFetch = makeFetch({
      '/api/drive/ai/organize': {
        fileId: 'file-1',
        suggestedFolder: '/Reports',
        category: 'Reports',
        confidence: 0.9,
        folderId: null,
        applied: false,
      },
      '/api/drive/folders': { folders: [{ id: 'folder-reports', name: 'Reports' }] },
      '/api/drive/files/file-1/copy': { id: 'file-2', name: 'notes.txt (copy)' },
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any, onFilesChanged });
    manager.setCurrentFile(FILE);
    await manager.suggestDestination();
    await manager.copyToSuggestedFolder();
    const { organize } = manager.getState();
    expect(organize.appliedResult).toEqual({ action: 'copied', folder: '/Reports' });
    expect(organize.missingFolderName).toBeNull();
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/drive/files/file-1/copy',
      expect.objectContaining({ body: JSON.stringify({ targetFolderId: 'folder-reports' }) }),
    );
    expect(onFilesChanged).toHaveBeenCalled();
    manager.dispose();
  });

  it('creates the missing folder and copies into it when asked', async () => {
    const onFilesChanged = vi.fn();
    const posted: Array<{ url: string; method?: string; body?: string }> = [];
    const apiFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      posted.push({
        url,
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      if (url === '/api/drive/ai/organize') {
        return jsonResponse({
          fileId: 'file-1',
          suggestedFolder: '/Reports',
          category: 'Reports',
          confidence: 0.9,
          folderId: null,
          applied: false,
        });
      }
      if (url === '/api/drive/folders' && init?.method === 'GET') {
        return jsonResponse({ folders: [] });
      }
      if (url === '/api/drive/folders' && init?.method === 'POST') {
        return jsonResponse({ id: 'folder-new', name: 'Reports' });
      }
      if (url.endsWith('/copy')) return jsonResponse({ id: 'file-2' });
      return jsonResponse({ error: 'not mocked' }, false);
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any, onFilesChanged });
    manager.setCurrentFile(FILE);
    await manager.suggestDestination();
    await manager.copyToSuggestedFolder();
    expect(manager.getState().organize.missingFolderName).toBe('Reports');
    await manager.createFolderAndCopy();
    const { organize } = manager.getState();
    expect(organize.appliedResult).toEqual({ action: 'copied', folder: '/Reports' });
    expect(organize.missingFolderName).toBeNull();
    expect(organize.error).toBeNull();
    // The folder was really created first, then the copy targeted the new id.
    const createCall = posted.find((p) => p.url === '/api/drive/folders' && p.method === 'POST');
    expect(createCall).toBeDefined();
    expect(JSON.parse(createCall!.body!)).toEqual({ name: 'Reports' });
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/drive/files/file-1/copy',
      expect.objectContaining({ body: JSON.stringify({ targetFolderId: 'folder-new' }) }),
    );
    expect(onFilesChanged).toHaveBeenCalled();
    manager.dispose();
  });

  it("surfaces the backend's real copy error instead of the generic fallback", async () => {
    const apiFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/drive/ai/organize') {
        return jsonResponse({
          fileId: 'file-1',
          suggestedFolder: '/Reports',
          category: 'Reports',
          confidence: 0.9,
          folderId: null,
          applied: false,
        });
      }
      if (url === '/api/drive/folders') {
        return jsonResponse({ folders: [{ id: 'f-r', name: 'Reports' }] });
      }
      if (url.endsWith('/copy')) {
        return jsonResponse(
          { error: { code: 'FOLDER_NOT_FOUND', message: 'Target folder not found' } },
          false,
        );
      }
      return jsonResponse({ error: 'not mocked' }, false);
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any });
    manager.setCurrentFile(FILE);
    await manager.suggestDestination();
    await manager.copyToSuggestedFolder();
    const { organize } = manager.getState();
    expect(organize.status).toBe('error');
    expect(organize.error).toBe('Target folder not found');
    expect(organize.appliedResult).toBeNull();
    manager.dispose();
  });

  it('summarizes the current file with the real summary', async () => {
    const apiFetch = makeFetch({
      '/api/drive/ai/summarize': {
        summary: 'Meeting notes about Q3.',
        keyPoints: ['Revenue up', 'Hiring freeze'],
        fileType: 'text',
        wordCount: 42,
      },
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any });
    manager.setCurrentFile(FILE);
    await manager.summarizeCurrentFile();
    const { summarize } = manager.getState();
    expect(summarize.status).toBe('done');
    expect(summarize.data?.summary).toBe('Meeting notes about Q3.');
    expect(summarize.data?.keyPoints).toEqual(['Revenue up', 'Hiring freeze']);
    manager.dispose();
  });

  it('changing the current file resets organize and summarize results', async () => {
    const apiFetch = makeFetch({
      '/api/drive/ai/summarize': { summary: 'x', keyPoints: [], fileType: 't', wordCount: 1 },
    });
    const manager = new QuantyFileWorkspaceManager({ apiFetch: apiFetch as any });
    manager.setCurrentFile(FILE);
    await manager.summarizeCurrentFile();
    expect(manager.getState().summarize.data).not.toBeNull();
    manager.setCurrentFile({ id: 'file-2', name: 'other.txt', mimeType: 'text/plain' });
    expect(manager.getState().summarize.data).toBeNull();
    expect(manager.getState().organize.suggestion).toBeNull();
    manager.dispose();
  });
});

describe('QuantyFileWorkspace drawer', () => {
  const baseProps = {
    onClose: () => undefined,
    file: FILE,
    onOpenDuplicateCleaner: () => undefined,
  };

  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <QuantyFileWorkspace {...baseProps} isOpen={false} />,
    );
    expect(html).toBe('');
  });

  it('renders all five workspace sections when open', () => {
    const html = renderToStaticMarkup(<QuantyFileWorkspace {...baseProps} isOpen={true} />);
    expect(html).toContain('Quanty file workspace');
    expect(html).toContain('Ask Quanty');
    expect(html).toContain('Find files');
    expect(html).toContain('Organize this file');
    expect(html).toContain('Summarize this file');
    expect(html).toContain('Clean duplicates');
    // The current file is shown; example commands are real planner commands.
    expect(html).toContain('notes.txt');
    expect(html).toContain('find files quarterly report');
    expect(html).toContain('move budget.xlsx to its folder');
  });

  it('explains how to pick a file when none is selected', () => {
    const html = renderToStaticMarkup(
      <QuantyFileWorkspace {...baseProps} isOpen={true} file={null} />,
    );
    expect(html).toContain('Find a file above and tap it');
  });
});
