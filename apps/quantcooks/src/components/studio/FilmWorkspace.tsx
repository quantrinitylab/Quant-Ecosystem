// ============================================================================
// QuantCooks Studio — Recipe Film project workspace (spec §5.2, §5.4;
// checklist #43 workspace, #39 Elements library, #40 element detail)
//
// Header (title, Share — link-first —, Open in timeline editor), the
// project brief as a slash-command block document in six sections, and
// mode tabs: Elements · Canvas · Chat · AI Director. The Director tab
// renders FilmDirector (composer, Director Panel, AI Director,
// storyboard); this component owns the film document state and its
// draft mirror.
//
// PERSISTENCE, stated plainly (see film.ts header for the full evidence):
// the project row is real and server-side; the film document (brief,
// shots, elements) has no server field today — createProject and
// updateProject accept name/type only, and the P0-5 state endpoint
// stores the timeline editor's document, which a film brief is not.
// So the film document mirrors to this device, the indicator says
// exactly that, and nothing here claims a server save. Follow-up: a
// server-side film document so briefs sync across devices.
// ============================================================================

import React, { useEffect, useState } from 'react';
import type { ServerAsset, ServerProject } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  ASSET_ELEMENT_KINDS,
  EMPTY_FILM_DRAFT,
  FILM_ASSETS_TOOL,
  FILM_BRIEF_SECTIONS,
  FILM_ELEMENT_GROUPS,
  FILM_ELEMENT_IMAGE_TOOL,
  FILM_PERSONA_TOOL,
  SLASH_BLOCKS,
  elementFromAsset,
  elementsByKind,
  filmDraftKey,
  insertBlock,
  parseFilmDraft,
  pickableElementAssets,
  serializeFilmDraft,
  type FilmDraft,
  type FilmElement,
  type FilmElementKind,
} from '../../lib/studio/film';
import { parsePromptMentions } from '../../lib/studio/mentions';
import type { PromoBrandKit } from '../../lib/studio/promo';
import { brandKitSwatches } from '../../lib/studio/promo';
import { FilmDirector } from './FilmDirector';

export type FilmDataState = 'loading' | 'ready' | 'error';

export type FilmWorkspaceTab = 'elements' | 'canvas' | 'chat' | 'director';

export interface FilmWorkspaceProps {
  /** The real project row (page wires useProjectById). */
  project?: ServerProject | null;
  projectState: FilmDataState;
  projectError?: string | null;
  onRetryProject?: () => void;
  /** The caller's assets, unfiltered (element picking applies its rules). */
  assets?: ServerAsset[];
  assetsState: FilmDataState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /** The caller's real brand kits (page wires useBrandKit), read-only here. */
  brandKits?: PromoBrandKit[];
  brandKitsState?: FilmDataState;
  jobs?: StudioJob[];
  initialTab?: FilmWorkspaceTab;
  /** Pre-loaded film document (deep links / tests); wins over the mirror. */
  initialDraft?: FilmDraft;
  /** Test seam: open the element detail modal for this asset id. */
  initialElementDetailId?: string | null;
}

function readDraftMirror(projectId: string | undefined) {
  try {
    if (!projectId || typeof window === 'undefined' || !window.localStorage) return EMPTY_FILM_DRAFT;
    return parseFilmDraft(window.localStorage.getItem(filmDraftKey(projectId)));
  } catch {
    return EMPTY_FILM_DRAFT;
  }
}

const TAB_LABELS: Array<{ id: FilmWorkspaceTab; label: string }> = [
  { id: 'elements', label: 'Elements' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'chat', label: 'Chat' },
  { id: 'director', label: 'AI Director' },
];

export const FilmWorkspace: React.FC<FilmWorkspaceProps> = ({
  project,
  projectState,
  projectError,
  onRetryProject,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  brandKits = [],
  brandKitsState = 'ready',
  jobs = [],
  initialTab = 'elements',
  initialDraft,
  initialElementDetailId = null,
}) => {
  const projectId = project?.id;
  const [mirror] = useState(() => readDraftMirror(projectId));
  const [draft, setDraft] = useState<FilmDraft>(() => initialDraft ?? mirror);
  const [tab, setTab] = useState<FilmWorkspaceTab>(initialTab);
  const [shareOpen, setShareOpen] = useState(false);
  const [elementDetailId, setElementDetailId] = useState<string | null>(initialElementDetailId);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<FilmElementKind>('dish');

  // Draft mirror: the film document persists across a reload of THIS
  // device. It never claims more than that (see the header note).
  useEffect(() => {
    try {
      if (!projectId || typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(filmDraftKey(projectId), serializeFilmDraft(draft));
    } catch {
      // A mirror is a convenience; storage being unavailable changes nothing.
    }
  }, [draft, projectId]);

  const patchDraft = (patch: Partial<FilmDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const pickable = pickableElementAssets(assets);
  const detailElement = draft.elements.find((e) => e.assetId === elementDetailId) ?? null;
  const defaultKit = brandKits.find((k) => k.isDefault) ?? brandKits[0] ?? null;

  if (projectState === 'loading') {
    return (
      <section className="studio-film-workspace" data-testid="film-workspace">
        <div className="studio-film-skeletons" data-testid="film-workspace-loading" aria-label="Loading the project">
          <span className="studio-skeleton-tile" />
          <span className="studio-skeleton-tile" />
          <span className="studio-skeleton-tile" />
        </div>
      </section>
    );
  }

  if (projectState === 'error' || !project) {
    return (
      <section className="studio-film-workspace" data-testid="film-workspace">
        <div className="studio-film-workspace-error" data-testid="film-workspace-error" role="alert">
          <h1>This film could not be opened</h1>
          <p>{projectError ?? 'The project could not be loaded — it may not exist, or it is not yours.'}</p>
          <button type="button" onClick={() => onRetryProject?.()}>
            Retry
          </button>{' '}
          <a href="/studio/film">Back to Recipe Film Studio</a>
        </div>
      </section>
    );
  }

  return (
    <section className="studio-film-workspace" data-testid="film-workspace">
      {/* ------------------------------------------------ header */}
      <header className="studio-film-workspace-head">
        <p>
          <a href="/studio/film">Recipe Film Studio</a> · Private
        </p>
        <h1 data-testid="film-workspace-title">{project.name}</h1>
        <div className="studio-film-workspace-actions">
          <button type="button" data-testid="film-share" onClick={() => setShareOpen((open) => !open)}>
            Share
          </button>
          <a data-testid="film-open-editor" href={`/editor?projectId=${project.id}`}>
            Open in timeline editor
          </a>
        </div>
        {shareOpen && (
          <p className="studio-film-share-link" data-testid="film-share-link" role="note">
            Link to this workspace: <code>/studio/film/{project.id}</code> — sharing is link-first; the
            project stays Private and publishing is always a separate, explicit step.
          </p>
        )}
        <p className="studio-film-draft-note" data-testid="film-draft-note" role="note">
          Draft on this device — the brief, elements and shot plan below autosave here as you type. The
          project itself is saved on the server; a server home for the film document is a named follow-up,
          so this draft does not yet follow you to another device.
        </p>
        {brandKitsState === 'ready' && defaultKit && (
          <p className="studio-film-brandkit" data-testid="film-brandkit">
            Brand kit on this film: <strong>{defaultKit.name}</strong>{' '}
            {brandKitSwatches(defaultKit).map((swatch) => (
              <span key={swatch.role}>
                <span className="studio-film-swatch" style={{ backgroundColor: swatch.hex }} /> {swatch.role}{' '}
              </span>
            ))}
          </p>
        )}
      </header>

      {/* ------------------------------------------------ brief doc (§5.4) */}
      <section className="studio-film-brief" data-testid="film-brief" aria-label="Project brief">
        <h2>Project brief</h2>
        <p>
          The brief is what the AI Director reads first. Write in blocks — / opens the block menu under
          each section — and @-mention the dishes, kitchens and presenters the film must match.
        </p>
        {FILM_BRIEF_SECTIONS.map((section) => {
          const text = draft.brief[section.id] ?? '';
          const mentions = parsePromptMentions(text);
          return (
            <div key={section.id} className="studio-film-brief-section" data-testid={`film-brief-${section.id}`}>
              <label>
                {section.label}
                <span> — {section.hint}</span>
                <textarea
                  data-testid={`film-brief-input-${section.id}`}
                  value={text}
                  rows={2}
                  onChange={(e) =>
                    patchDraft({ brief: { ...draft.brief, [section.id]: e.target.value } })
                  }
                />
              </label>
              <div className="studio-film-block-menu" aria-label={`Insert a block into ${section.label}`}>
                {SLASH_BLOCKS.map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    data-testid={`film-block-${section.id}-${block.id}`}
                    onClick={() =>
                      patchDraft({
                        brief: { ...draft.brief, [section.id]: insertBlock(text, block.id) },
                      })
                    }
                  >
                    / {block.label}
                  </button>
                ))}
              </div>
              {mentions.length > 0 && (
                <p className="studio-film-brief-mentions" data-testid={`film-brief-mentions-${section.id}`}>
                  Attached:{' '}
                  {mentions.map((m) => (
                    <span key={`${m.start}-${m.raw}`} className="studio-chip">
                      {m.raw}
                    </span>
                  ))}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* ------------------------------------------------ mode tabs */}
      <div className="studio-film-tabs" role="tablist" aria-label="Workspace modes">
        {TAB_LABELS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            data-testid={`film-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------ elements (#39) */}
      {tab === 'elements' && (
        <div data-testid="film-elements-panel">
          {FILM_ELEMENT_GROUPS.map((group) => {
            const groupElements = elementsByKind(draft.elements, group.id);
            return (
              <section
                key={group.id}
                className="studio-film-element-group"
                data-testid={`film-elements-${group.id}`}
                aria-label={group.label}
              >
                <h3>{group.label}</h3>
                {group.id === 'presenter' ? (
                  <p data-testid="film-elements-presenter-empty">
                    No presenters yet. Presenters are Chef Personas ({FILM_PERSONA_TOOL}) — created in
                    Voice Studio (which lives at /studio/voice) with an own-likeness consent gate before
                    any training. A photo with
                    a label is not a persona, so this group stays empty rather than casting one from your
                    uploads.
                  </p>
                ) : groupElements.length === 0 ? (
                  <p data-testid={`film-elements-empty-${group.id}`}>
                    No {group.label.toLowerCase()} in this film yet — add one from your library below and it
                    can be @-mentioned in every brief and shot.
                  </p>
                ) : (
                  <ul className="studio-film-element-grid">
                    {groupElements.map((element) => (
                      <li key={element.assetId} data-testid={`film-element-${element.assetId}`}>
                        <button
                          type="button"
                          data-testid={`film-element-open-${element.assetId}`}
                          onClick={() => setElementDetailId(element.assetId)}
                        >
                          {element.url && <img src={element.url} alt={element.filename} />}
                          <strong>{element.filename}</strong>
                          <span>{element.kind} · READY{element.note ? ` · ${element.note}` : ''}</span>
                        </button>
                        <label>
                          Kind
                          <select
                            data-testid={`film-element-kind-${element.assetId}`}
                            value={element.kind}
                            onChange={(e) =>
                              patchDraft({
                                elements: draft.elements.map((el) =>
                                  el.assetId === element.assetId
                                    ? { ...el, kind: e.target.value as FilmElementKind }
                                    : el,
                                ),
                              })
                            }
                          >
                            {ASSET_ELEMENT_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {kind}
                              </option>
                            ))}
                          </select>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <section className="studio-film-element-add" data-testid="film-element-add" aria-label="Add an element">
            <h3>Add an element from your library</h3>
            <p>
              Elements are references into your assets ({FILM_ASSETS_TOOL}) — the same photo can be a dish
              in this film and a product in an ad, without a copy.
            </p>
            <label>
              New elements join as
              <select
                data-testid="film-element-add-kind"
                value={addKind}
                onChange={(e) => setAddKind(e.target.value as FilmElementKind)}
              >
                {ASSET_ELEMENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            {assetsState === 'loading' && (
              <div className="studio-film-skeletons" data-testid="film-elements-loading" aria-label="Loading your library">
                <span className="studio-skeleton-tile" />
                <span className="studio-skeleton-tile" />
              </div>
            )}
            {assetsState === 'error' && (
              <div className="studio-film-elements-error" data-testid="film-elements-error" role="alert">
                <p>{assetsError ?? 'Your library could not be loaded.'}</p>
                <button type="button" onClick={() => onRetryAssets?.()}>
                  Retry
                </button>
              </div>
            )}
            {assetsState === 'ready' && pickable.length === 0 && (
              <p data-testid="film-elements-library-empty">
                Your library has no photos or clips with confirmed uploads yet — elements are picked from
                READY assets only, so there is nothing to add until an upload lands.
              </p>
            )}
            {assetsState === 'ready' && pickable.length > 0 && (
              <ul className="studio-film-element-picker">
                {pickable.map((asset) => {
                  const already = draft.elements.some((e) => e.assetId === asset.id);
                  return (
                    <li key={asset.id}>
                      <button
                        type="button"
                        data-testid={`film-element-pick-${asset.id}`}
                        disabled={already}
                        onClick={() =>
                          patchDraft({
                            elements: [...draft.elements, elementFromAsset(asset, addKind)],
                          })
                        }
                      >
                        {asset.url && <img src={asset.url} alt={asset.filename} />}
                        <span>{asset.filename}</span>
                        <span>{already ? 'Already an element' : `Add as ${addKind}`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p role="note" data-testid="film-element-generate-note">
              Creating a brand-new element by generation rides on {FILM_ELEMENT_IMAGE_TOOL}, whose provider
              is not configured yet (NOT_CONFIGURED) — so new elements come from your real library today,
              never from an invented image.
            </p>
          </section>
        </div>
      )}

      {/* ------------------------------------------------ canvas tab */}
      {tab === 'canvas' && (
        <div className="studio-film-canvas-tab" data-testid="film-canvas-tab">
          <h3>Canvas</h3>
          <p>
            The node board scoped to this project is its own build (the Canvas Board unit) and is still in
            build — this tab holds its place rather than opening a blank board that pretends to work. Your
            brief, elements and shots are unaffected.
          </p>
        </div>
      )}

      {/* ------------------------------------------------ chat tab */}
      {tab === 'chat' && (
        <div className="studio-film-chat-tab" data-testid="film-chat-tab">
          <h3>Chat</h3>
          <p>
            Project discussion and collaborators already live on the real Collaborate surface — members,
            roles and comments included — so this tab hands you there instead of running a second,
            emptier chat.
          </p>
          <a data-testid="film-chat-collaborate" href="/collaborate">
            Open Collaborate
          </a>
        </div>
      )}

      {/* ------------------------------------------------ director tab */}
      {tab === 'director' && (
        <FilmDirector
          shots={draft.shots}
          elements={draft.elements}
          genreId={draft.genreId}
          style={draft.style}
          heroPrompt={draft.heroPrompt}
          directorAsk={draft.directorAsk}
          assets={assets}
          jobs={jobs}
          onShotsChange={(shots) => patchDraft({ shots })}
          onGenreChange={(genreId) => patchDraft({ genreId })}
          onStyleChange={(style) => patchDraft({ style })}
          onHeroPromptChange={(heroPrompt) => patchDraft({ heroPrompt })}
          onDirectorAskChange={(directorAsk) => patchDraft({ directorAsk })}
        />
      )}

      {/* ------------------------------------------------ element detail (#40) */}
      {detailElement && (
        <div
          className="studio-film-element-modal"
          data-testid="film-element-modal"
          role="dialog"
          aria-label={`Element: ${detailElement.filename}`}
        >
          <h3 data-testid="film-element-modal-name">{detailElement.filename}</h3>
          <div className="studio-film-element-modal-strip">
            {detailElement.url ? (
              <img src={detailElement.url} alt={detailElement.filename} />
            ) : (
              <p>No preview — the library minted no signed URL for this read.</p>
            )}
          </div>
          <p data-testid="film-element-modal-meta">
            Type: {detailElement.kind} · Status: READY · Asset: {detailElement.assetId}
          </p>
          <label>
            Note — what this element is for in this film
            <textarea
              data-testid="film-element-modal-note"
              value={detailElement.note}
              rows={2}
              onChange={(e) =>
                patchDraft({
                  elements: draft.elements.map((el) =>
                    el.assetId === detailElement.assetId ? { ...el, note: e.target.value } : el,
                  ),
                })
              }
              placeholder="e.g. The hero thali — appears in frames 1 and 5…"
            />
          </label>
          <div className="studio-film-element-modal-actions">
            {detailElement.url && (
              <a data-testid="film-element-modal-download" href={detailElement.url} download>
                Download
              </a>
            )}
            {confirmingRemoveId === detailElement.assetId ? (
              <>
                <span role="alert">Remove this element from the film? The asset itself stays in your library.</span>
                <button
                  type="button"
                  data-testid="film-element-modal-remove-confirm"
                  onClick={() => {
                    patchDraft({
                      elements: draft.elements.filter((el) => el.assetId !== detailElement.assetId),
                      shots: draft.shots.map((shot) => ({
                        ...shot,
                        elementIds: shot.elementIds.filter((id) => id !== detailElement.assetId),
                      })),
                    });
                    setConfirmingRemoveId(null);
                    setElementDetailId(null);
                  }}
                >
                  Yes, remove the element
                </button>
                <button type="button" onClick={() => setConfirmingRemoveId(null)}>
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="film-element-modal-remove"
                onClick={() => setConfirmingRemoveId(detailElement.assetId)}
              >
                Delete element
              </button>
            )}
            <button type="button" data-testid="film-element-modal-close" onClick={() => setElementDetailId(null)}>
              Close
            </button>
          </div>
          <p role="note">
            Move to / Copy to / Share for elements ride on the same asset tools and land with the
            server-side film document — they are named here as follow-ups rather than shown as buttons
            that would do nothing.
          </p>
        </div>
      )}
    </section>
  );
};

export default FilmWorkspace;
