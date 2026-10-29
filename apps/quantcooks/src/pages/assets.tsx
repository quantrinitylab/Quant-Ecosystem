// ============================================================================
// QuantEdits - Asset Library
// Tabs: All/Media/Music/Stickers/Fonts, upload, search, sort.
//
// D-1 fix (P0-6 gate defect D-1, verdicted REAL; fixed by the small-fixes
// unit): this page used to cast backend rows to a private `Asset` type
// reading a name, a thumbnail, a folder, tags and a favorite flag —
// none of which the server sends, so every real asset rendered blank-named
// with a broken thumbnail and the favorites filter hid everything. The
// page now renders the real `ServerAsset` shape only (api-client.ts):
// `filename` is the name, `url` (a fresh signed URL, null while PENDING)
// is the preview, `type` is the content-type top-level segment the tabs
// filter on. The server has no folders, tags or favorites, so the page
// makes no such claims: the folder sidebar and the favorites filter /
// per-card star toggle are removed rather than fabricated over data
// that does not exist.
//
// Honesty fix (assets-page honesty unit): three more fabrications on this
// page were removed —
//  1. Upload was SIMULATED: handleFileUpload animated a fake percentage
//     with setInterval and never called the backend, so files picked
//     here were never uploaded. Uploads now run the real P0-3 flow
//     (useAssetUpload: signed URL → PUT → complete) into a real project
//     (below), show the hook's stage only — no invented percentage —
//     and surface real errors untouched. With no project to save into,
//     the upload zone is disabled and says why instead of pretending.
//  2. Delete was a no-op comment. It now calls apiClient.deleteAsset
//     behind an inline confirm (the FilmWorkspace pattern), refreshes
//     the list via the real query, and on failure keeps the asset and
//     shows the real error.
//  3. A tab labelled as a stock library listed the caller's OWN assets;
//     no stock library exists server-side. Tabs are now labelled by
//     what they actually filter (All / Photos & Video / Audio / …).
//
// Photo Editor entry point (C-3 follow-up F-C3-3, shared-file batch
// #4): image cards carry an "Edit" action linking to /studio/photo —
// the Photo Editor surface whose picker is this same library and whose
// save-back lands here as a new asset. The link is the plain route (no
// per-asset param): the editor page takes no asset selection from the
// URL today, so the card claims no deep-link it cannot honour.
//
// Load-failure fix (screenshot defect, 2026-10-29): a failed assets
// read — e.g. the proxy answering with an EMPTY body when the backend
// is unreachable, so the api client's res.json() rejects with
// "Unexpected end of JSON input" (src/services/api-client.ts) — used
// to end the whole page: the error branch returned early with the
// bare shared ErrorState, whose default title is the generic crash
// wording "Something went wrong" over the raw parser message, the
// library shell gone entirely (verified in the 2026-10-29 screenshot
// run, 12-assets.png). A failed read now keeps the shell up and puts
// a NAMED load-error state (describeAssetsLoadError) where the grid
// would be, with a working Retry through the query's refetch. The
// error state and the empty state stay distinct: a successful read
// of zero assets still renders "No assets found", never the panel.
// ============================================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useAssets, useAssetUpload } from '../hooks/useAssets';
import { useProjects } from '../hooks/useProjects';
import { apiClient } from '../services/api-client';
import type { ServerAsset } from '../services/api-client';
import { PageTransition } from '../components/PageTransition';
import { SignInRequired } from '../components/SignInRequired';
import { isUnauthorizedError } from '../lib/auth-errors';

// ---------------------------------------------------------------------------
// Upload / delete orchestration — the page's testable seams.
//
// These mirror runReferenceUpload (lib/studio/image.ts): the async flow
// lives in a plain function taking its dependencies, so tests drive the
// real seam with mocked deps and the component stays a thin state shell.
// Outcomes carry the backend's real error message untouched — a failed
// upload/delete is reported, never smoothed over.
// ---------------------------------------------------------------------------

export interface AssetUploadEntry {
  id: string;
  filename: string;
  phase: 'working' | 'error';
  error?: string;
}

export type AssetUploadOutcome =
  | { status: 'done'; asset: ServerAsset }
  | { status: 'error'; message: string };

export async function runAssetUpload(
  file: File,
  upload: (file: File) => Promise<ServerAsset>,
): Promise<AssetUploadOutcome> {
  try {
    const asset = await upload(file);
    return { status: 'done', asset };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'The upload failed.',
    };
  }
}

/** Stage text for an in-flight upload — the hook exposes no percentage. */
export function assetUploadStageLabel(entry: AssetUploadEntry): string | null {
  if (entry.phase === 'working') {
    return `Uploading ${entry.filename} — sending it to storage and confirming it landed…`;
  }
  return null;
}

export type AssetDeleteOutcome = { status: 'deleted' } | { status: 'error'; message: string };

export async function runAssetDelete(
  assetId: string,
  deps: {
    deleteAsset: (id: string) => Promise<{ success: boolean; error?: { message: string } }>;
    refetch: () => void;
  },
): Promise<AssetDeleteOutcome> {
  try {
    const response = await deps.deleteAsset(assetId);
    if (!response.success) {
      return { status: 'error', message: response.error?.message || 'Failed to delete the asset.' };
    }
    deps.refetch();
    return { status: 'deleted' };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Failed to delete the asset.',
    };
  }
}

export interface AssetsLoadErrorView {
  title: string;
  message: string;
}

/**
 * The named load-error view for a failed assets read. A read can fail
 * without the library being empty and without anything being broken
 * on the caller's side — the proxy answering an empty body while the
 * backend is down makes the api client's res.json() reject with a raw
 * parser message ("Unexpected end of JSON input"), a network failure
 * surfaces as a bare "Failed to fetch", and so on. The view names the
 * actual situation (the library could not be loaded) and keeps the
 * real detail visible, framed, instead of letting the raw parser text
 * stand as the whole page under a generic crash title.
 */
export function describeAssetsLoadError(error: unknown): AssetsLoadErrorView {
  const detail =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const base =
    "Your assets didn't come back from the server, so there's nothing to show yet — nothing was changed.";
  return {
    title: 'Couldn’t load your library',
    message: detail ? `${base} (${detail})` : base,
  };
}

/**
 * Uploads are project assets (P0-3), so an upload needs a target project:
 * an explicit one wins, otherwise the caller's most recent project (the
 * studio pages' rule). No project at all → null, and uploads stay off.
 */
export function resolveUploadProjectId(
  explicitProjectId: string | undefined,
  projects: { id: string }[],
): string | null {
  if (explicitProjectId) return explicitProjectId;
  return projects[0]?.id ?? null;
}

interface AssetsPageLibraryProps {
  projectId?: string;
  onDragToTimeline?: (asset: ServerAsset) => void;
  // Test seams (the Units 2–4 initial-* pattern): SSR renders cannot
  // click, so tests inject the transient upload/delete states directly.
  initialUploadEntries?: AssetUploadEntry[];
  initialConfirmingDeleteId?: string | null;
  initialDeleteError?: { id: string; message: string } | null;
}

type TabType = 'uploads' | 'media' | 'music' | 'stickers' | 'fonts';

// Renamed in P0-5 (spec C6): this page-private component used to share the
// name `AssetLibrary` with the shared panel in src/components/AssetLibrary
// — two components, one name, two incompatible Asset shapes. The shared
// panel keeps the name; this one is AssetsPageLibrary. Behaviour-neutral.
const AssetsPageLibrary: React.FC<AssetsPageLibraryProps> = ({
  projectId,
  onDragToTimeline,
  initialUploadEntries,
  initialConfirmingDeleteId,
  initialDeleteError,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('uploads');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRecent, setShowRecent] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [draggedAsset, setDraggedAsset] = useState<ServerAsset | null>(null);
  const [uploadEntries, setUploadEntries] = useState<AssetUploadEntry[]>(
    initialUploadEntries ?? [],
  );
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    initialConfirmingDeleteId ?? null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(
    initialDeleteError ?? null,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const uploadSeqRef = useRef(0);

  // No `category` argument: the backend treats `category` as an exact
  // `type` filter, so passing a tab id ('uploads', 'media', …) matched
  // nothing and the library could never populate. Tabs filter
  // client-side on the real `type`; the server-side `search` matches the
  // filename. (The `projectId` prop is not part of this list call —
  // unchanged from before; it is the upload target, below.)
  const { data: assetsData, isLoading, error, refetch } = useAssets(undefined, searchQuery);

  const assets: ServerAsset[] = assetsData ?? [];

  // Upload target (P0-3 uploads are project assets): the explicit prop
  // wins, otherwise the most recent project — the studio pages' rule.
  const projectsQuery = useProjects(undefined, 1);
  const uploadProjectId = resolveUploadProjectId(projectId, projectsQuery.data ?? []);
  const uploadsEnabled = uploadProjectId !== null;
  const projectsPending = !projectId && projectsQuery.isLoading;

  const uploadMutation = useAssetUpload();

  const filteredAssets = useMemo(() => {
    let result = assets
      .filter((a) => {
        if (activeTab === 'uploads') return true;
        if (activeTab === 'media') return a.type === 'image' || a.type === 'video';
        if (activeTab === 'music') return a.type === 'audio';
        if (activeTab === 'stickers') return a.type === 'sticker';
        if (activeTab === 'fonts') return a.type === 'font';
        return true;
      })
      .filter((a) => a.filename.toLowerCase().includes(searchQuery.toLowerCase()));

    if (showRecent) result = result.slice(0, 10);
    if (sortBy === 'date')
      result.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    else if (sortBy === 'name') result.sort((a, b) => a.filename.localeCompare(b.filename));
    else if (sortBy === 'size') result.sort((a, b) => b.size - a.size);
    return result;
  }, [assets, activeTab, showRecent, searchQuery, sortBy]);

  const handleFileUpload = useCallback(
    (files: FileList | null) => {
      // No target project → the zone is disabled on the surface; a stray
      // drop must not pretend to upload either.
      if (!files || !uploadProjectId) return;
      Array.from(files).forEach((file) => {
        uploadSeqRef.current += 1;
        const entryId = `upload-${uploadSeqRef.current}-${file.name}`;
        setUploadEntries((prev) => [...prev, { id: entryId, filename: file.name, phase: 'working' }]);
        void runAssetUpload(file, (f) =>
          uploadMutation.mutateAsync({ projectId: uploadProjectId, file: f }),
        ).then((outcome) => {
          if (outcome.status === 'done') {
            // The hook invalidates the assets query on success, so the
            // landed asset appears through the real list — the entry is
            // simply done and leaves the strip.
            setUploadEntries((prev) => prev.filter((e) => e.id !== entryId));
          } else {
            setUploadEntries((prev) =>
              prev.map((e) =>
                e.id === entryId ? { ...e, phase: 'error', error: outcome.message } : e,
              ),
            );
          }
        });
      });
    },
    [uploadProjectId, uploadMutation],
  );

  const dismissUploadEntry = useCallback((entryId: string) => {
    setUploadEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload],
  );

  const handleDragStart = useCallback((asset: ServerAsset) => {
    setDraggedAsset(asset);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedAsset && onDragToTimeline) {
      onDragToTimeline(draggedAsset);
      setDraggedAsset(null);
    }
  }, [draggedAsset, onDragToTimeline]);

  const handleDeleteConfirm = useCallback(
    async (asset: ServerAsset) => {
      setDeletingId(asset.id);
      const outcome = await runAssetDelete(asset.id, {
        deleteAsset: (id) => apiClient.deleteAsset(id),
        refetch: () => {
          void refetch();
        },
      });
      setDeletingId(null);
      if (outcome.status === 'deleted') {
        setConfirmingDeleteId(null);
        setDeleteError(null);
      } else {
        // The asset stays in the list; the real error shows on its card.
        setDeleteError({ id: asset.id, message: outcome.message });
      }
    },
    [refetch],
  );

  const formatSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }, []);

  if (isLoading) {
    // Design upgrade Phase B: the loading state takes the page's dark
    // ground too — it used to render the shared LoadingState bare on
    // the legacy light body (a white page) for the whole read.
    return (
      <div className="assets-page assets-loading">
        <LoadingState variant="skeleton" text="Loading assets..." />
      </div>
    );
  }

  // Never show the raw backend 401 ("Missing or invalid authorization header"):
  // an unauthenticated visitor gets the friendly sign-in state instead.
  if (error && isUnauthorizedError(error)) return <SignInRequired />;

  // Any other failed read is a LOAD error, not an empty library and
  // not a crash: the shell below stays up and the grid region carries
  // the named load-error state with a working retry (refetch re-runs
  // the read). While it stands, `assets` is empty because nothing
  // arrived — the sidebar count shows a dash rather than a fake 0.
  const loadError = error ? describeAssetsLoadError(error) : null;

  return (
    <PageTransition>
      <div className="asset-library assets-page">
        <div className="library-tabs">
          {[
            { id: 'uploads' as TabType, label: 'All', icon: '📁' },
            { id: 'media' as TabType, label: 'Photos & Video', icon: '🖼' },
            { id: 'music' as TabType, label: 'Audio', icon: '🎵' },
            { id: 'stickers' as TabType, label: 'Stickers', icon: '✨' },
            { id: 'fonts' as TabType, label: 'Fonts', icon: '🔤' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`lib-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div
          ref={dropZoneRef}
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            if (uploadsEnabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => {
            if (uploadsEnabled) fileInputRef.current?.click();
          }}
        >
          {uploadsEnabled ? (
            <div className="upload-content">
              <div className="upload-icon">&#8682;</div>
              <p>Drop files here or click to upload</p>
              <span className="upload-formats">MP4, MOV, JPG, PNG, MP3, WAV, GIF, SVG</span>
            </div>
          ) : (
            <div className="upload-content" data-testid="assets-upload-unavailable">
              <div className="upload-icon">&#8682;</div>
              <p>Uploads are saved into a project.</p>
              {projectsPending ? (
                <span className="upload-formats">Finding a project to save uploads into…</span>
              ) : (
                <span className="upload-formats">
                  Create a project first, then come back to upload into it —{' '}
                  <a href="/projects">go to Projects</a>
                </span>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*,audio/*,.ttf,.otf,.woff"
            hidden
            disabled={!uploadsEnabled}
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </div>

        {uploadEntries.length > 0 && (
          <div className="upload-progress-list">
            {uploadEntries.map((entry) => (
              <div key={entry.id} className="upload-progress-item">
                <span className="upload-name">{entry.filename}</span>
                {entry.phase === 'working' ? (
                  <span className="upload-stage" role="status">
                    {assetUploadStageLabel(entry)}
                  </span>
                ) : (
                  <>
                    <span className="upload-error" role="alert">
                      {entry.error}
                    </span>
                    <button
                      type="button"
                      className="upload-dismiss-btn"
                      onClick={() => dismissUploadEntry(entry.id)}
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="library-toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="quick-filters">
            <button
              className={`filter-btn ${showRecent ? 'active' : ''}`}
              onClick={() => setShowRecent(!showRecent)}
            >
              Recent
            </button>
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date">Newest</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
        </div>

        <div className="library-sidebar">
          <h4>Library</h4>
          <div className="folder-list">
            <div className="folder-item active">
              <span className="folder-name">All Assets</span>
              <span className="folder-count">{loadError ? '—' : assets.length}</span>
            </div>
          </div>
        </div>

        <div className="assets-grid">
          {loadError ? (
            <div data-testid="assets-load-error">
              <ErrorState
                title={loadError.title}
                message={loadError.message}
                onRetry={() => void refetch()}
              />
            </div>
          ) : filteredAssets.length === 0 ? (
            <EmptyState title="No assets found" description="Upload files to build your library" />
          ) : (
            filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="asset-item"
                draggable
                onDragStart={() => handleDragStart(asset)}
                onDragEnd={handleDragEnd}
              >
                <div className="asset-thumbnail">
                  {asset.type === 'image' && asset.url ? (
                    <img src={asset.url} alt={asset.filename} />
                  ) : asset.type === 'video' && asset.url ? (
                    <video src={asset.url} muted preload="metadata" aria-label={asset.filename} />
                  ) : asset.type === 'audio' ? (
                    <div className="audio-waveform">♪</div>
                  ) : (
                    <div className="asset-file-icon">{asset.type}</div>
                  )}
                  {asset.uploadStatus === 'PENDING' && (
                    <span className="asset-status">Uploading…</span>
                  )}
                </div>
                <div className="asset-info">
                  <span className="asset-name" title={asset.filename}>
                    {asset.filename}
                  </span>
                  <span className="asset-size">{formatSize(asset.size)}</span>
                </div>
                <div className="asset-actions">
                  {asset.type === 'image' && (
                    <a
                      className="edit-btn"
                      href="/studio/photo"
                      aria-label={`Edit ${asset.filename} in the Photo Editor`}
                    >
                      Edit
                    </a>
                  )}
                  {confirmingDeleteId === asset.id ? (
                    <div className="delete-confirm">
                      <span role="alert">
                        Delete {asset.filename}? The file will be removed from your library.
                      </span>
                      <button
                        type="button"
                        className="delete-confirm-btn"
                        disabled={deletingId === asset.id}
                        onClick={() => void handleDeleteConfirm(asset)}
                      >
                        {deletingId === asset.id ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        type="button"
                        className="delete-cancel-btn"
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button
                      className="delete-btn"
                      aria-label={`Delete ${asset.filename}`}
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmingDeleteId(asset.id);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {deleteError?.id === asset.id && (
                  <p className="asset-delete-error" role="alert">
                    {deleteError.message}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default AssetsPageLibrary;
