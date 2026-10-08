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
