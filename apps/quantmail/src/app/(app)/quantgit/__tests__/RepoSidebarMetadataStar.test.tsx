// @vitest-environment jsdom
// QM-FIX (fix/qm-quantgit-star-persist): the QuantGit star button fabricated the
// star count purely in local state — handleStarClick toggled `starred` and did
// setCurrentStars(prev ± 1) while the real POST/DELETE /api/repos/:id/star
// endpoints were never called (nothing in the quantgit tree passed onToggleStar),
// so the displayed count was invented and lost on refresh. The button is now
// wired to the real backend with optimistic toggle + rollback. These tests pin:
//   1. toggleRepoStar POSTs to /api/repos/:id/star when starring and DELETEs when
//      unstarring, returning the server's authoritative { stars, starred }.
//   2. the repo id is URL-encoded in the request path.
//   3. HTTP failures and malformed envelopes throw honest errors (never silent).
//   4. clicking the button calls the backend; the UI updates optimistically,
//      then syncs to the server's count (the server is the source of truth).
//   5. a failed toggle rolls back the optimistic update and shows an honest
//      error instead of keeping the fabricated count.
//   6. rapid double-clicks while a toggle is in flight fire exactly one request.
//   7. without a repoId (and no onToggleStar) the button is disabled rather than
//      fabricating a count; the legacy onToggleStar path still works.
//   8. switching repos resyncs the star state instead of showing stale counts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  RepoSidebarMetadata,
  toggleRepoStar,
  type RepoSidebarMetadataProps,
} from '../components/RepoSidebarMetadata';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

function starSuccess(stars: number, starred: boolean) {
  return jsonResponse({ success: true, data: { id: 'repo-1', stars, starred } });
}

function renderSidebar(props: Partial<RepoSidebarMetadataProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  const render = (p: Partial<RepoSidebarMetadataProps>) => {
    const merged: RepoSidebarMetadataProps = {
      repoOwner: 'quantrinitylab',
      repoName: 'demo',
      starsCount: 41,
      forksCount: 3,
      watchersCount: 7,
      ...p,
    };
    act(() => {
      root.render(<RepoSidebarMetadata {...merged} />);
    });
  };
  act(() => {
    root = createRoot(container);
  });
  render(props);
  // NOTE (fix/qm-quantgit-dead-resources-rows): the sidebar now renders real
  // <button> Resources rows (Readme, Security policy) BEFORE the star button,
  // so `querySelector('button')` no longer selects the star button. Select it
  // by its stable aria-label instead.
  const starButton = () =>
    container.querySelector(
      'button[aria-label="Star this repository"], button[aria-label="Unstar this repository"]',
    ) as HTMLButtonElement;
  return {
    container,
    starButton,
    rerender: (p: Partial<RepoSidebarMetadataProps>) => render(p),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function clickAndFlush(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('toggleRepoStar — real /api/repos/:id/star wiring', () => {
  it('stars with POST and returns the server count', async () => {
    fetchMock.mockResolvedValue(starSuccess(42, true));
    const result = await toggleRepoStar('repo-1', false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/repos/repo-1/star');
    expect(init.method).toBe('POST');
    expect(result).toEqual({ stars: 42, starred: true });
  });

  it('unstars with DELETE when currently starred', async () => {
    fetchMock.mockResolvedValue(starSuccess(41, false));
    const result = await toggleRepoStar('repo-1', true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ stars: 41, starred: false });
  });

  it('URL-encodes the repo id in the request path', async () => {
    fetchMock.mockResolvedValue(starSuccess(1, true));
    await toggleRepoStar('owner/my repo', false);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/repos/owner%2Fmy%20repo/star');
  });

  it('throws an honest error carrying the backend message on HTTP failure', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { message: 'Repository not found' } }, false, 404),
    );
    await expect(toggleRepoStar('nope', false)).rejects.toThrow(
      /Could not star this repository \(HTTP 404\): Repository not found/,
    );
  });

  it('throws an honest error on a malformed success envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await expect(toggleRepoStar('repo-1', false)).rejects.toThrow(/unexpected response/);
  });
});

describe('RepoSidebarMetadata star button — persisted, not fabricated', () => {
  it('renders the real starsCount from props — never an invented count', () => {
    const { container, unmount } = renderSidebar({ repoId: 'repo-1', starsCount: 42 });
    try {
      expect(container.textContent).toContain('42');
      expect(container.textContent).toContain('☆ Star');
    } finally {
      unmount();
    }
  });

  it('clicking Star POSTs to the backend and syncs the server count', async () => {
    fetchMock.mockResolvedValue(starSuccess(42, true));
    const { container, starButton, unmount } = renderSidebar({ repoId: 'repo-1' });
    try {
      await clickAndFlush(starButton());
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/repos/repo-1/star');
      expect(init.method).toBe('POST');
      // Server is the source of truth: starred indicator + server count.
      expect(container.textContent).toContain('★ Starred');
      expect(container.textContent).toContain('42');
    } finally {
      unmount();
    }
  });

  it('updates optimistically first, then adopts the server count', async () => {
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    const { container, starButton, unmount } = renderSidebar({ repoId: 'repo-1' });
    try {
      await act(async () => {
        starButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });
      // Optimistic: starred immediately, count +1, before the server answers.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('★ Starred');
      expect(container.textContent).toContain('42');
      await act(async () => {
        resolveFetch(starSuccess(99, true));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      // Then the server's authoritative count wins (not the optimistic 42).
      expect(container.textContent).toContain('99');
    } finally {
      unmount();
    }
  });

  it('clicking again DELETEs and decrements', async () => {
    fetchMock.mockResolvedValue(starSuccess(42, true));
    const { container, starButton, unmount } = renderSidebar({ repoId: 'repo-1' });
    try {
      await clickAndFlush(starButton());
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(starSuccess(41, false));
      await clickAndFlush(starButton());
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/repos/repo-1/star');
      expect(init.method).toBe('DELETE');
      expect(container.textContent).toContain('☆ Star');
      expect(container.textContent).toContain('41');
    } finally {
      unmount();
    }
  });

  it('a failed toggle rolls back and shows an honest error — never a kept fabrication', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { message: 'boom' } }, false, 500),
    );
    const { container, starButton, unmount } = renderSidebar({ repoId: 'repo-1' });
    try {
      await clickAndFlush(starButton());
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // Rolled back: unstarred indicator and the original count.
      expect(container.textContent).toContain('☆ Star');
      expect(container.textContent).toContain('41');
      // Honest error, not silence.
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toMatch(/HTTP 500/);
      expect(alert?.textContent).toMatch(/boom/);
    } finally {
      unmount();
    }
  });

  it('a double-click while a toggle is in flight fires exactly one request', async () => {
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    const { starButton, unmount } = renderSidebar({ repoId: 'repo-1' });
    try {
      await act(async () => {
        starButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });
      expect(starButton().disabled).toBe(true);
      await act(async () => {
        starButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await act(async () => {
        resolveFetch(starSuccess(42, true));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(starButton().disabled).toBe(false);
    } finally {
      unmount();
    }
  });

  it('without a repoId the button is disabled and never fabricates a count', async () => {
    const { container, starButton, unmount } = renderSidebar({});
    try {
      expect(starButton().disabled).toBe(true);
      await clickAndFlush(starButton());
      expect(fetchMock).not.toHaveBeenCalled();
      expect(container.textContent).toContain('☆ Star');
      expect(container.textContent).toContain('41');
    } finally {
      unmount();
    }
  });

  it('the legacy onToggleStar path still works without a repoId', async () => {
    const onToggleStar = vi.fn();
    const { starButton, unmount } = renderSidebar({ onToggleStar });
    try {
      expect(starButton().disabled).toBe(false);
      await clickAndFlush(starButton());
      expect(onToggleStar).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  it('switching repos resyncs the star state instead of showing stale counts', async () => {
    fetchMock.mockResolvedValue(starSuccess(42, true));
    const { container, starButton, rerender, unmount } = renderSidebar({
      repoId: 'repo-1',
      starsCount: 41,
    });
    try {
      await clickAndFlush(starButton());
      expect(container.textContent).toContain('★ Starred');
      rerender({ repoId: 'repo-2', starsCount: 7, isStarred: false });
      expect(container.textContent).toContain('☆ Star');
      expect(container.textContent).toContain('7');
      expect(container.textContent).not.toContain('42');
    } finally {
      unmount();
    }
  });
});
