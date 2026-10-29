// ============================================================================
// QuantCooks Studio — Design Studio home (plan unit C-7 step 2,
// route: /studio/design). The caller's library of design documents.
//
// Honesty contract (lib/studio/figcraft.ts carries the spike proof):
//  - The library lists ONLY the caller's real design documents —
//    READY assets whose file is the native .figcraft zip (P0-3). Each
//    card's preview is the REAL thumbnail embedded inside that file,
//    read out of the zip on this device; a design without a readable
//    thumbnail shows a named placeholder state, never a stock image.
//  - The mode switch is Screens (this surface) / Vector. Vector is a
//    DISABLED tab with its reason on screen — it arrives with the
//    VectorCraft unit (C-8); a dead or fake control is never rendered.
//  - No QuantAI twin is claimed for the embedded editor: the web build
//    has no control channel (spike, three evidences). QuantAI design
//    work arrives with the companion step, after CP-1 — the note below
//    says exactly that, and the chip is disabled, not decorative.
//  - No upstream branding appears on this surface (trademark terms);
//    attribution lives in lib/studio/figcraft-attribution.ts.
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import {
  NEW_DESIGN_ID,
  designDisplayName,
  designDocuments,
  designEditorRoute,
  extractFigcraftThumbnail,
} from '../../lib/studio/figcraft';

export type DesignAssetsState = 'loading' | 'ready' | 'error';

/**
 * One card's preview, as read from the design file itself:
 *  - loading:     the file's bytes are being fetched / read;
 *  - ready:       the embedded thumbnail, as an object URL;
 *  - missing:     the file is a valid design zip but carries no
 *                 embedded thumbnail;
 *  - unreadable:  the bytes could not be read as a design file;
 *  - unavailable: no byte fetcher is wired on this screen.
 */
export type DesignThumbnailView =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'missing' }
  | { status: 'unreadable'; reason: string }
  | { status: 'unavailable' };

export interface DesignStudioHomeProps {
  /** The caller's assets, as listAssets returned them (unfiltered is fine). */
  assets?: ServerAsset[];
  assetsState: DesignAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /**
   * Fetches a design asset's bytes (the page wires a fetch of the
   * asset's fresh signed URL). Used only to read the embedded
   * thumbnail — the asset itself is never modified. Omit = previews
   * render their unavailable state.
   */
  fetchAssetBytes?: (asset: ServerAsset) => Promise<Uint8Array>;
  initialThumbnails?: Record<string, DesignThumbnailView>;
}

function formatDesignMeta(asset: ServerAsset): string {
  const kib = asset.size / 1024;
  const size = kib >= 1024 ? `${(kib / 1024).toFixed(1)} MB` : `${kib.toFixed(1)} KB`;
  return `${asset.filename} · ${size}`;
}

export const DesignStudioHome: React.FC<DesignStudioHomeProps> = ({
  assets = [],
  assetsState,
  assetsError = null,
  onRetryAssets,
  fetchAssetBytes,
  initialThumbnails,
}) => {
  const designs = useMemo(() => designDocuments(assets), [assets]);
  const [thumbnails, setThumbnails] = useState<Record<string, DesignThumbnailView>>(
    initialThumbnails ?? {},
  );
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    if (!fetchAssetBytes) return;
    let live = true;
    for (const asset of designs) {
      if (thumbnails[asset.id]) continue;
      setThumbnails((prev) =>
        prev[asset.id] ? prev : { ...prev, [asset.id]: { status: 'loading' } },
      );
      void (async () => {
        try {
          const bytes = await fetchAssetBytes(asset);
          const thumb = await extractFigcraftThumbnail(bytes);
          if (!live) return;
          if (thumb.status === 'ready') {
            const url = URL.createObjectURL(new Blob([thumb.png], { type: 'image/png' }));
            objectUrls.current.push(url);
            setThumbnails((prev) => ({ ...prev, [asset.id]: { status: 'ready', url } }));
          } else if (thumb.status === 'missing') {
            setThumbnails((prev) => ({ ...prev, [asset.id]: { status: 'missing' } }));
          } else {
            setThumbnails((prev) => ({
              ...prev,
              [asset.id]: { status: 'unreadable', reason: thumb.reason },
            }));
          }
        } catch (err) {
          if (!live) return;
          setThumbnails((prev) => ({
            ...prev,
            [asset.id]: {
              status: 'unreadable',
              reason: err instanceof Error ? err.message : 'The design file could not be fetched.',
            },
          }));
        }
      })();
    }
    return () => {
      live = false;
    };
    // thumbnails is intentionally not a dependency: an entry, once
    // recorded, is never refetched by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs, fetchAssetBytes]);

  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const thumbnailFor = (asset: ServerAsset): DesignThumbnailView =>
    thumbnails[asset.id] ??
    (fetchAssetBytes ? { status: 'loading' } : { status: 'unavailable' });

  return (
    <section className="studio-design" data-testid="design-home">
      <header className="studio-design-head">
        <h1><span className="studio-title-accent">Design</span> Studio</h1>
        <p className="studio-design-explainer">
          A real UI design tool inside QuantCooks — frames, auto-layout, components and
          variants, and prototypes. Your designs live in your QuantCooks assets as design
          files; exports (PNG, SVG, PDF) arrive as downloads you can save back here.
        </p>
        <p className="studio-design-quantai-note" role="note">
          The embedded editor has no control channel, so QuantAI cannot drive it directly.
          Asking QuantAI to create or export a design arrives with the companion step, once
          the control-plane contract lands — until then this studio is a hands-on surface.{' '}
          <span
            className="studio-design-quantai-chip"
            data-testid="design-quantai-unavailable"
            aria-disabled="true"
          >
            QuantAI design tools — not configured yet
          </span>
        </p>
      </header>

      {/* ---- Mode switch: Screens is this surface; Vector is C-8 ---- */}
      <div className="studio-design-modes" role="tablist" aria-label="Design mode">
        <span
          role="tab"
          aria-selected="true"
          className="studio-design-mode studio-design-mode-active"
          data-testid="design-mode-screens"
        >
          Screens
        </span>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          disabled
          className="studio-design-mode studio-design-mode-disabled"
          data-testid="design-mode-vector"
        >
          Vector
        </button>
        <p className="studio-design-mode-reason" data-testid="design-mode-vector-reason" role="note">
          Vector mode arrives with the VectorCraft unit (C-8) — the switch is shown now so
          the studio&rsquo;s shape is stable, and it stays disabled until that editor is
          really embedded.
        </p>
      </div>

      <div className="studio-design-actions">
        <a
          className="studio-design-new"
          data-testid="design-new"
          href={designEditorRoute(NEW_DESIGN_ID)}
        >
          New Design
        </a>
      </div>

      {/* ---- The library: the caller's real design documents ---- */}
      <div className="studio-design-library" aria-label="Your designs">
        {assetsState === 'loading' && (
          <div
            className="studio-design-loading"
            data-testid="design-library-loading"
            aria-label="Loading your designs"
          >
            Loading your designs…
          </div>
        )}
        {assetsState === 'error' && (
          <div className="studio-design-error" data-testid="design-library-error" role="alert">
            <p>{assetsError ?? 'Your designs could not be loaded.'}</p>
            {onRetryAssets && (
              <button type="button" className="studio-design-retry" onClick={onRetryAssets}>
                Try again
              </button>
            )}
          </div>
        )}
        {assetsState === 'ready' && designs.length === 0 && (
          <div className="studio-design-empty" data-testid="design-library-empty">
            <p>
              No design documents yet. Designs are stored as <code>.figcraft</code> assets in
              your projects — start one with <strong>New Design</strong> above, save it in the
              editor, and store the downloaded file from the editor screen; it will appear
              here with the preview embedded in the file itself.
            </p>
          </div>
        )}
        {assetsState === 'ready' && designs.length > 0 && (
          <ul className="studio-design-grid">
            {designs.map((asset) => {
              const thumb = thumbnailFor(asset);
              return (
                <li key={asset.id} className="studio-design-card" data-testid={`design-card-${asset.id}`}>
                  <div className="studio-design-thumb">
                    {thumb.status === 'ready' && (
                      <img
                        className="studio-design-thumb-img"
                        data-testid={`design-thumb-${asset.id}`}
                        src={thumb.url}
                        alt=""
                      />
                    )}
                    {thumb.status === 'loading' && (
                      <p className="studio-design-thumb-placeholder" data-testid={`design-thumb-loading-${asset.id}`}>
                        Reading the preview from the design file…
                      </p>
                    )}
                    {thumb.status === 'missing' && (
                      <p className="studio-design-thumb-placeholder" data-testid={`design-thumb-missing-${asset.id}`}>
                        This design file carries no preview image.
                      </p>
                    )}
                    {thumb.status === 'unreadable' && (
                      <p className="studio-design-thumb-placeholder" data-testid={`design-thumb-unreadable-${asset.id}`}>
                        The preview could not be read from this file.
                      </p>
                    )}
                    {thumb.status === 'unavailable' && (
                      <p className="studio-design-thumb-placeholder" data-testid={`design-thumb-unavailable-${asset.id}`}>
                        Preview unavailable on this screen.
                      </p>
                    )}
                  </div>
                  <span className="studio-design-name">{designDisplayName(asset)}</span>
                  <span className="studio-design-meta">{formatDesignMeta(asset)}</span>
                  <div className="studio-design-card-actions">
                    <a
                      className="studio-design-open"
                      data-testid={`design-open-${asset.id}`}
                      href={designEditorRoute(asset.id)}
                    >
                      Open
                    </a>
                    {asset.url && (
                      <a
                        className="studio-design-download"
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download the file
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="studio-design-attribution">
        <p role="note">
          Editor: open-source, dual-licensed MIT OR Apache-2.0; attribution is recorded in the
          project notices.
        </p>
      </footer>
    </section>
  );
};

export default DesignStudioHome;
