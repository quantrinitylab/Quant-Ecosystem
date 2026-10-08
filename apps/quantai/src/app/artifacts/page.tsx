'use client';

// ============================================================================
// QuantAI — Artifacts library screen (Muse S6 parity).
// Tabs: Artifacts / Media. Sort menu: grid/list, modified/opened/name,
// System Files. Tap -> CanvasArtifactsPanel viewer (artifacts) or media
// lightbox (media). Real backend data only; honest empty/error states.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken } from '../../lib/auth';
import { CanvasArtifactsPanel } from '../../components/CanvasArtifactsPanel';
import type { CanvasArtifact } from '../../types/agent-mode';
import { SortMenu } from '../../components/artifacts/SortMenu';
import { ArtifactRow } from '../../components/artifacts/ArtifactRow';
import { ArtifactCard } from '../../components/artifacts/ArtifactCard';
import {
  filterByTab,
  type ArtifactDetail,
  type ArtifactListItem,
  type ArtifactSortKey,
  type ArtifactTab,
  type ArtifactView,
} from '../../components/artifacts/types';
import { apiFetchRaw } from '@quant/api-client';

const API_BASE = '/api';
const VIEW_PREF_KEY = 'quanty.artifacts.view';

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function toCanvasArtifact(a: ArtifactDetail): CanvasArtifact {
  const type =
    a.type === 'component' || a.type === 'code' || a.type === 'markdown' ? a.type : 'code';
  return {
    id: a.id,
    title: a.title,
    type,
    language: a.language || 'text',
    code: a.code || '',
    markdown: a.markdown || undefined,
    previewHtml: a.previewHtml || undefined,
    createdAt: a.createdAt,
  };
}

function isHttpUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function ArtifactsLibraryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<ArtifactTab>('artifacts');
  const [view, setView] = useState<ArtifactView>('list');
  const [sort, setSort] = useState<ArtifactSortKey>('modified');
  const [showSystemFiles, setShowSystemFiles] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [items, setItems] = useState<ArtifactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [viewerItem, setViewerItem] = useState<ArtifactDetail | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const requestSeq = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_PREF_KEY);
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const loadItems = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        tab,
        sort,
        pageSize: '100',
      });
      const endpoint = showSystemFiles
        ? `${API_BASE}/quanty/artifacts/system`
        : `${API_BASE}/quanty/artifacts?${qs.toString()}`;
      const res = await apiFetchRaw(endpoint, { headers: authHeaders() });
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok) {
        throw new Error(`Library failed to load (HTTP ${res.status})`);
      }
      const json = await res.json();
      const list: ArtifactListItem[] = json?.data?.items ?? [];
      if (seq !== requestSeq.current) return;
      // When viewing system files, the backend returns all kinds — apply the tab filter locally.
      setItems(showSystemFiles ? filterByTab(list, tab) : list);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(e instanceof Error ? e.message : 'Library failed to load');
      setItems([]);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [tab, sort, showSystemFiles, router]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleViewChange = useCallback((v: ArtifactView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_PREF_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const openItem = useCallback(
    async (item: ArtifactListItem) => {
      setViewerLoading(true);
      setViewerError(null);
      setViewerItem(null);
      try {
        const res = await apiFetchRaw(
          `${API_BASE}/quanty/artifacts/${encodeURIComponent(item.id)}`,
          { headers: authHeaders() },
        );
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (!res.ok) {
          throw new Error(`Could not open “${item.title}” (HTTP ${res.status})`);
        }
        const json = await res.json();
        const detail: ArtifactDetail = json?.data;
        if (!detail || !detail.id) {
          throw new Error(`“${item.title}” has no retrievable content`);
        }
        setViewerItem(detail);
        // Record last-opened (fire and forget — must not block the viewer).
        apiFetchRaw(`${API_BASE}/quanty/artifacts/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          headers: authHeaders(),
        }).catch(() => undefined);
      } catch (e) {
        setViewerError(e instanceof Error ? e.message : 'Could not open artifact');
      } finally {
        setViewerLoading(false);
      }
    },
    [router],
  );

  const closeViewer = useCallback(() => {
    setViewerItem(null);
    setViewerError(null);
    setViewerLoading(false);
    // Refresh so "Sort by last opened" reflects the just-opened artifact.
    loadItems();
  }, [loadItems]);

  const deleteItem = useCallback(
    async (item: ArtifactListItem) => {
      setDeletingId(item.id);
      try {
        const res = await apiFetchRaw(
          `${API_BASE}/quanty/artifacts/${encodeURIComponent(item.id)}`,
          { method: 'DELETE', headers: authHeaders() },
        );
        if (!res.ok) {
          throw new Error(`Delete failed (HTTP ${res.status})`);
        }
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed');
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  const showingMediaTab = tab === 'media';
  const emptyTitle = showSystemFiles
    ? 'No system files'
    : showingMediaTab
      ? 'No media yet'
      : 'No artifacts yet';
  const emptyBody = showSystemFiles
    ? 'There are no built-in system files available right now.'
    : showingMediaTab
      ? 'Images and files you save from chats will appear here.'
      : 'Generate code or a component in Chat or Agent Mode, then save it here.';

  const viewerCanvas: CanvasArtifact | null = viewerItem ? toCanvasArtifact(viewerItem) : null;
  const viewerIsMedia = viewerItem?.kind === 'media';
  const viewerMediaUrl = viewerIsMedia && isHttpUrl(viewerItem?.contentRef ?? null)
    ? viewerItem!.contentRef!
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Top bar */}
      <header className="relative flex items-center justify-between px-4 pt-5 pb-2">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-11 h-11 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-xl text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          ←
        </button>
        <h1 className="text-[19px] font-semibold tracking-tight">Artifacts</h1>
        <div className="relative">
          <button
            type="button"
            aria-label="View and sort options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-xl text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            ⋯
          </button>
          <SortMenu
            open={menuOpen}
            view={view}
            sort={sort}
            showSystemFiles={showSystemFiles}
            onViewChange={handleViewChange}
            onSortChange={setSort}
            onToggleSystemFiles={() => setShowSystemFiles((v) => !v)}
            onClose={() => setMenuOpen(false)}
          />
        </div>
      </header>

      {/* Identity mark */}
      <div className="flex flex-col items-center mt-1 mb-4 select-none">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 flex items-center justify-center text-3xl shadow-lg shadow-fuchsia-950/40">
          🎨
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 mb-4">
        <div
          role="tablist"
          aria-label="Library tabs"
          className="flex rounded-full bg-zinc-900 border border-zinc-800 p-1"
        >
          {(['artifacts', 'media'] as ArtifactTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-full text-[15px] font-medium transition-all cursor-pointer ${
                tab === t
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'artifacts' ? 'Artifacts' : 'Media'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-5 pb-10">
        {loading ? (
          <div className="flex flex-col gap-3" aria-label="Loading artifacts">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[76px] rounded-3xl bg-zinc-900/60 border border-zinc-800/60 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-[15px] text-zinc-300 max-w-xs">{error}</p>
            <button
              type="button"
              onClick={loadItems}
              className="mt-5 px-6 py-2.5 rounded-full bg-zinc-800 text-white text-[15px] font-medium hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-3xl mb-4">
              {showingMediaTab ? '🖼️' : '📦'}
            </div>
            <h2 className="text-lg font-semibold">{emptyTitle}</h2>
            <p className="text-[14px] text-zinc-500 mt-1.5 max-w-xs">{emptyBody}</p>
          </div>
        ) : view === 'list' ? (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ArtifactRow
                key={item.id}
                item={item}
                onOpen={openItem}
                onDelete={deleteItem}
                deleting={deletingId === item.id}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => (
              <ArtifactCard
                key={item.id}
                item={item}
                onOpen={openItem}
                onDelete={deleteItem}
                deleting={deletingId === item.id}
              />
            ))}
          </div>
        )}
      </main>

      {/* Viewer overlay */}
      {(viewerLoading || viewerItem || viewerError) && (
        <div
          className="fixed inset-0 z-[100] bg-[#0a0a0f] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={viewerItem ? viewerItem.title : 'Artifact viewer'}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-[#0a0a0f]">
            <button
              type="button"
              aria-label="Close viewer"
              onClick={closeViewer}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-lg text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              ←
            </button>
            <h2 className="flex-1 text-[16px] font-semibold truncate">
              {viewerItem?.title ?? 'Opening…'}
            </h2>
          </div>

          <div className="flex-1 min-h-0">
            {viewerLoading && (
              <div className="h-full flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />
              </div>
            )}

            {viewerError && !viewerLoading && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="text-4xl mb-4">⚠️</div>
                <p className="text-[15px] text-zinc-300 max-w-xs">{viewerError}</p>
                <button
                  type="button"
                  onClick={closeViewer}
                  className="mt-5 px-6 py-2.5 rounded-full bg-zinc-800 text-white text-[15px] font-medium hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Back to library
                </button>
              </div>
            )}

            {viewerItem && !viewerLoading && !viewerError && (
              <>
                {viewerIsMedia ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 overflow-auto">
                    {viewerMediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={viewerMediaUrl}
                        alt={viewerItem.title}
                        className="max-w-full max-h-full rounded-2xl border border-zinc-800 object-contain"
                      />
                    ) : (
                      <div className="text-center">
                        <div className="text-5xl mb-4">🖼️</div>
                        <p className="text-[15px] text-zinc-400 max-w-xs">
                          “{viewerItem.title}” has no previewable file attached.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  viewerCanvas && (
                    <CanvasArtifactsPanel artifact={viewerCanvas} onClose={closeViewer} />
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
