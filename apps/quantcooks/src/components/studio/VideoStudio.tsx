// ============================================================================
// QuantCooks Studio — Video Studio screen (spec §3.1–§3.3, checklist
// #23 Create + #25 Motion Control tab; G-3/G-4)
//
// Anatomy: workspace tabs across the top — Create · Edit · Motion
// Control. CREATE is the fully-built tab: a source panel (your real media
// + uploads), the shared Composer as the brief, and a results rail fed by
// the unified JobStrip. EDIT hands off to the user's real projects (the
// timeline editor itself is the existing /editor surface, entered from
// the Projects gallery today). MOTION CONTROL is the camera-stack builder
// (MotionControl.tsx) as its own surface.
//
// What is REAL on this screen today:
//  - Source picking from the caller's READY assets and uploads through
//    the P0-3 three-step flow (the page injects useAssetUpload).
//  - The camera stack and its price: stacking re-prices Generate through
//    pricing.ts's stacked-extras term, written into the Composer's
//    controlled settings (F-U3-2 — see composerSettings below).
// What is NOT configured, and says so on the surface:
//  - Generation. quantcooks.generate_video_from_text / animate_image are
//    registered (CP-1) but their provider tier is fail-closed, so the
//    Composer is passed generation='not-configured': Generate stays
//    disabled, the price still re-prices live, nothing is charged, and no
//    clip, progress bar or result is ever faked.
// ============================================================================

import React, { useRef, useState } from 'react';
import type { ServerAsset, ServerProject } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  VIDEO_ANIMATE_TOOL,
  VIDEO_CAMERA_PRESETS_TOOL,
  VIDEO_EFFECTS_TOOL,
  VIDEO_PERSONA_TOOL,
  VIDEO_STARTERS,
  VIDEO_TEXT_TOOL,
  pickableFrameAssets,
  pickableVideoAssets,
  runSourceUpload,
  sourceFromAsset,
  sourceUploadPhaseLabel,
  stackLabel,
  tryAddCameraMove,
  moveCameraMove,
  removeCameraMove,
  videoResultsFromJobs,
  videoToolForMode,
  type SourceAsset,
  type SourceUploadPhase,
  type VideoMode,
} from '../../lib/studio/video';
import { Composer, defaultComposerSettings, type ComposerChip } from './Composer';
import type { ComposerSettings } from '../../lib/studio/pricing';
import { JobStrip } from './JobStrip';
import { MotionControl } from './MotionControl';

export type VideoDataState = 'loading' | 'ready' | 'error';
export type VideoTab = 'create' | 'edit' | 'motion';

export interface VideoStudioProps {
  /** Project uploads save into (uploads are project assets, P0-3). */
  projectId?: string | null;
  projectName?: string | null;
  /** The caller's assets, as listAssets returned them (unfiltered is fine). */
  assets?: ServerAsset[];
  assetsState: VideoDataState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /** The caller's projects, for the Edit tab (real, via useProjects). */
  projects?: ServerProject[];
  projectsState?: VideoDataState;
  projectsError?: string | null;
  onRetryProjects?: () => void;
  /** The real P0-3 upload (page wires useAssetUpload). Omit = uploads off. */
  upload?: (file: File) => Promise<ServerAsset>;
  initialTab?: VideoTab;
  initialMode?: VideoMode;
  initialPrompt?: string;
  /** Pre-picked sources (deep links from a preset / tests). */
  initialStartFrameAsset?: ServerAsset | null;
  initialEndFrameAsset?: ServerAsset | null;
  initialSourceClipAsset?: ServerAsset | null;
  initialCameraStack?: string[];
  /** Real jobs for the strip/results (export-shaped today; [] is honest). */
  jobs?: StudioJob[];
}

export const VideoStudio: React.FC<VideoStudioProps> = ({
  projectId,
  projectName,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  projects = [],
  projectsState = 'ready',
  projectsError,
  onRetryProjects,
  upload,
  initialTab = 'create',
  initialMode = 'text',
  initialPrompt = '',
  initialStartFrameAsset,
  initialEndFrameAsset,
  initialSourceClipAsset,
  initialCameraStack = [],
  jobs = [],
}) => {
  const [tab, setTab] = useState<VideoTab>(initialTab);
  const [mode, setMode] = useState<VideoMode>(initialMode);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [startFrame, setStartFrame] = useState<SourceAsset | null>(() =>
    initialStartFrameAsset ? sourceFromAsset(initialStartFrameAsset) : null,
  );
  const [endFrame, setEndFrame] = useState<SourceAsset | null>(() =>
    initialEndFrameAsset ? sourceFromAsset(initialEndFrameAsset) : null,
  );
  const [sourceClip, setSourceClip] = useState<SourceAsset | null>(() =>
    initialSourceClipAsset ? sourceFromAsset(initialSourceClipAsset) : null,
  );
  const [stack, setStack] = useState<string[]>(initialCameraStack);
  // F-U3-2: the Composer's settings are controlled from here, so the
  // stack's priced size (stackedExtras) is one field of state this screen
  // owns — stacking re-prices Generate by writing that field, with no
  // remount, and the user's model/duration picks now survive stack
  // changes (the old remount workaround reset them; see git-era comment
  // this replaced). applyStack is the single stack-write path so the two
  // states can never disagree.
  const [composerSettings, setComposerSettings] = useState<ComposerSettings>(() =>
    defaultComposerSettings('video', { stackedExtras: initialCameraStack.length }),
  );
  const applyStack = (next: string[]) => {
    setStack(next);
    setComposerSettings((prev) => ({ ...prev, stackedExtras: next.length }));
  };
  const [stackNotice, setStackNotice] = useState<string | null>(null);
  const [effectsNoteOpen, setEffectsNoteOpen] = useState(false);
  const [personaNoteOpen, setPersonaNoteOpen] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<SourceUploadPhase>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Bumped when a starter writes a brief, so the Composer remounts with it.
  const [composerNonce, setComposerNonce] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const frames = pickableFrameAssets(assets);
  const clips = pickableVideoAssets(assets);
  const results = videoResultsFromJobs(jobs);
  const uploadsEnabled = Boolean(projectId && upload);
  const tool = videoToolForMode(mode);
  const isEmpty =
    tab === 'create' && !startFrame && !sourceClip && results.length === 0 && prompt.trim() === '';

  const handleAddMove = (moveId: string) => {
    const result = tryAddCameraMove(stack, moveId);
    if (result.ok) {
      applyStack(result.stack);
      setStackNotice(null);
    } else {
      setStackNotice(result.message);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file || !upload) return;
    setUploadPhase('working');
    setUploadError(null);
    const outcome = await runSourceUpload(file, (f) => upload(f as File));
    if (outcome.status === 'done') {
      const picked = sourceFromAsset(outcome.asset);
      if (picked.kind === 'video') {
        setSourceClip(picked);
      } else {
        setStartFrame(picked);
        setMode('image');
      }
      setUploadPhase('idle');
    } else {
      setUploadPhase('error');
      setUploadError(outcome.message);
    }
  };

  const chips: ComposerChip[] = [
    {
      id: 'camera',
      label: 'Camera move',
      value: stackLabel(stack) ?? undefined,
      onPick: () => setTab('motion'),
      onClear: () => {
        applyStack([]);
        setStackNotice(null);
      },
    },
    ...(startFrame
      ? [
          {
            id: 'start-frame',
            label: 'Start frame',
            value: startFrame.filename,
            onClear: () => setStartFrame(null),
          } as ComposerChip,
        ]
      : []),
    ...(endFrame
      ? [
          {
            id: 'end-frame',
            label: 'End frame',
            value: endFrame.filename,
            onClear: () => setEndFrame(null),
          } as ComposerChip,
        ]
      : []),
    ...(sourceClip
      ? [
          {
            id: 'source-clip',
            label: 'Source clip',
            value: sourceClip.filename,
            onClear: () => setSourceClip(null),
          } as ComposerChip,
        ]
      : []),
    {
      id: 'effects',
      label: 'Effects',
      onPick: () => setEffectsNoteOpen((open) => !open),
    },
    {
      id: 'persona',
      label: 'Chef Persona',
      onPick: () => setPersonaNoteOpen((open) => !open),
    },
  ];

  return (
    <section className="studio-video" data-testid="video-studio">
      <header className="studio-video-head">
        <h1><span className="studio-title-accent">Video</span> Studio</h1>
        <p>
          Describe a dish moment, or animate a dish photo into a hero clip. Camera moves stack — up to three —
          and every price is shown before anything could ever run.
        </p>
      </header>

      <div className="studio-video-tabs" role="tablist" aria-label="Video workspace">
        <button
          type="button"
          role="tab"
          data-testid="video-tab-create"
          aria-selected={tab === 'create'}
          onClick={() => setTab('create')}
        >
          Create Video
        </button>
        <button
          type="button"
          role="tab"
          data-testid="video-tab-edit"
          aria-selected={tab === 'edit'}
          onClick={() => setTab('edit')}
        >
          Edit Video
        </button>
        <button
          type="button"
          role="tab"
          data-testid="video-tab-motion"
          aria-selected={tab === 'motion'}
          onClick={() => setTab('motion')}
        >
          Motion Control
        </button>
      </div>

      {tab === 'create' && (
        <div className="studio-video-layout" data-testid="video-create-panel">
          {/* -------------------------------------------- left: source */}
          <aside className="studio-video-source" data-testid="video-source-panel" aria-label="Source media">
            <div className="studio-video-mode" aria-label="Creation mode">
              <button
                type="button"
                data-testid="video-mode-text"
                aria-pressed={mode === 'text'}
                onClick={() => setMode('text')}
              >
                Text → Video
              </button>
              <button
                type="button"
                data-testid="video-mode-image"
                aria-pressed={mode === 'image'}
                onClick={() => setMode('image')}
              >
                Image → Video
              </button>
            </div>

            {mode === 'image' && (
              <div className="studio-video-frames" aria-label="Frames">
                <div className="studio-video-frame-slot" data-testid="video-startframe-slot">
                  <h3>Start frame</h3>
                  {startFrame ? (
                    <div data-testid="video-startframe-selected">
                      {startFrame.url && <img src={startFrame.url} alt={startFrame.filename} />}
                      <span>{startFrame.filename}</span>
                      <button type="button" onClick={() => setStartFrame(null)}>
                        Remove start frame
                      </button>
                    </div>
                  ) : (
                    <p>Pick a photo from Your media below — the clip opens on it.</p>
                  )}
                </div>
                <div className="studio-video-frame-slot" data-testid="video-endframe-slot">
                  <h3>End frame · optional</h3>
                  {endFrame ? (
                    <div data-testid="video-endframe-selected">
                      {endFrame.url && <img src={endFrame.url} alt={endFrame.filename} />}
                      <span>{endFrame.filename}</span>
                      <button type="button" onClick={() => setEndFrame(null)}>
                        Remove end frame
                      </button>
                    </div>
                  ) : (
                    <p>Optionally pick where the clip should land; the move fills the space between.</p>
                  )}
                </div>
              </div>
            )}

            {sourceClip && (
              <div className="studio-video-sourceclip" data-testid="video-sourceclip-selected">
                <h3>Source clip</h3>
                <span>{sourceClip.filename}</span>
                <button type="button" onClick={() => setSourceClip(null)}>
                  Remove source clip
                </button>
              </div>
            )}

            <div
              className="studio-video-dropzone"
              data-testid="video-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (uploadsEnabled) void handleFiles(e.dataTransfer.files);
              }}
            >
              <p>Drop a dish photo or a short clip here, or pick one — it lands in your library for real.</p>
              <label>
                Choose a file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*"
                  data-testid="video-file-input"
                  disabled={!uploadsEnabled}
                  onChange={(e) => {
                    if (e.target.files) void handleFiles(e.target.files);
                  }}
                />
              </label>
            </div>

            {!uploadsEnabled && (
              <p className="studio-video-upload-off" data-testid="video-upload-unavailable" role="note">
                Uploads are saved into a project.
                {projectName
                  ? ' This surface was opened without an upload connection, so picking a file is off for now.'
                  : ' Open Video Studio with a project chosen, or create one first — '}{' '}
                {!projectName && <a href="/projects">go to Projects</a>}
              </p>
            )}

            {uploadPhase !== 'idle' && (
              <p className="studio-video-upload-state" data-testid="video-upload-state" role="status">
                {sourceUploadPhaseLabel(uploadPhase)}
              </p>
            )}
            {uploadPhase === 'error' && uploadError && (
              <p className="studio-video-upload-error" data-testid="video-upload-error" role="alert">
                {uploadError}
              </p>
            )}

            <div className="studio-video-picker" aria-label="Your media">
              <h3>Your media</h3>
              {assetsState === 'loading' && (
                <div className="studio-video-skeletons" data-testid="video-assets-loading" aria-label="Loading your media">
                  <span className="studio-skeleton-tile" />
                  <span className="studio-skeleton-tile" />
                  <span className="studio-skeleton-tile" />
                </div>
              )}
              {assetsState === 'error' && (
                <div className="studio-video-assets-error" data-testid="video-assets-error" role="alert">
                  <p>{assetsError ?? 'Your media could not be loaded.'}</p>
                  <button type="button" onClick={() => onRetryAssets?.()}>
                    Retry
                  </button>
                </div>
              )}
              {assetsState === 'ready' && frames.length === 0 && clips.length === 0 && (
                <p data-testid="video-assets-empty">
                  No photos or clips in your library yet — upload one above and it will live here.
                </p>
              )}
              {assetsState === 'ready' && frames.length > 0 && (
                <ul className="studio-video-asset-grid" aria-label="Your photos">
                  {frames.map((asset) => (
                    <li key={asset.id}>
                      <button
                        type="button"
                        data-testid={`video-frame-pick-${asset.id}`}
                        onClick={() => {
                          setStartFrame(sourceFromAsset(asset));
                          setMode('image');
                        }}
                      >
                        {asset.url && <img src={asset.url} alt={asset.filename} />}
                        <span>{asset.filename}</span>
                        <span>Use as start frame</span>
                      </button>
                      {startFrame && endFrame?.assetId !== asset.id && startFrame.assetId !== asset.id && (
                        <button
                          type="button"
                          data-testid={`video-endframe-pick-${asset.id}`}
                          onClick={() => setEndFrame(sourceFromAsset(asset))}
                        >
                          Use as end frame
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {assetsState === 'ready' && clips.length > 0 && (
                <ul className="studio-video-asset-grid" aria-label="Your clips">
                  {clips.map((asset) => (
                    <li key={asset.id}>
                      <button
                        type="button"
                        data-testid={`video-clip-pick-${asset.id}`}
                        onClick={() => setSourceClip(sourceFromAsset(asset))}
                      >
                        <span>{asset.filename}</span>
                        <span>Use as source clip</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {/* -------------------------------------------- centre: brief */}
          <div className="studio-video-centre" data-testid="video-composer-region">
            {isEmpty && (
              <div className="studio-video-empty" data-testid="video-empty-state">
                <h2>Start with a dish moment</h2>
                <p>Three ways in — a photo, a sentence, or a move. Nothing here spends a credit today.</p>
                <div className="studio-video-starters">
                  {VIDEO_STARTERS.map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      className="studio-video-starter"
                      data-testid={`video-starter-${starter.id}`}
                      onClick={() => {
                        setMode(starter.mode);
                        if (starter.prompt) {
                          setPrompt(starter.prompt);
                          setComposerNonce((n) => n + 1);
                        }
                      }}
                    >
                      <strong>{starter.title}</strong>
                      <span>{starter.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {effectsNoteOpen && (
              <p className="studio-video-effects-note" data-testid="video-effects-note" role="note">
                Effects (Steam Wisps, Flambé Burst, Sauce-Pour Emphasis and friends) layer onto a run through
                the {VIDEO_EFFECTS_TOOL} tool as effect choices on the video tools. That picker is its own
                build step in this studio, so the chip stays empty rather than pretending an effect is
                attached.
              </p>
            )}

            {personaNoteOpen && (
              <p className="studio-video-persona-note" data-testid="video-persona-note" role="note">
                Chef Personas are saved presenters you cast into a clip (the {VIDEO_PERSONA_TOOL} tool). None
                exist in your library yet — personas are created in Voice Studio (which lives at
                /studio/voice) — so this chip stays empty rather than inventing one.
              </p>
            )}

            <JobStrip jobs={jobs} />

            {/*
              F-U3-2 landed: the Composer's settings are controlled from
              this screen (composerSettings above), so stacking re-prices
              Generate by writing stackedExtras — no remount, and the
              user's model/duration picks survive stack changes. The key
              now only carries the starter nonce: a starter writes a new
              brief, and the remount hands it to the Composer as
              initialPrompt (the prompt itself is held here either way).
            */}
            <Composer
              key={`video-composer-${composerNonce}`}
              kind="video"
              chips={chips}
              placeholder="Describe the dish moment — steam, a pour, the pull… @ a dish or persona, / a collection"
              initialPrompt={prompt}
              onPromptChange={setPrompt}
              settings={composerSettings}
              onSettingsChange={setComposerSettings}
              showSettings={{ batch: false }}
              generation="not-configured"
              notConfiguredReason={`Video generation is not connected yet — the ${tool} tool has no provider configured (NOT_CONFIGURED). Your uploads and media are real; nothing will be charged.`}
            />
            <p className="studio-video-tool-note" role="note">
              Text runs call {VIDEO_TEXT_TOOL}; photo runs call {VIDEO_ANIMATE_TOOL} with your stacked moves
              from {VIDEO_CAMERA_PRESETS_TOOL}.
            </p>
          </div>

          {/* -------------------------------------------- right: results */}
          <aside className="studio-video-results" data-testid="video-results-rail" aria-label="Results">
            <h2>Results</h2>
            {results.length === 0 ? (
              <p data-testid="video-results-empty">
                No generated clips yet. Generation jobs do not exist yet — a provider is not connected — so
                this rail stays honestly empty until one lands; finished clips will appear here and in
                Assets, with their settings and cost attached. Exports you run from a project are real jobs
                and report in the strip above.
              </p>
            ) : (
              <ul className="studio-video-results-grid">
                {results.map((card) => (
                  <li key={card.outputId} data-testid={`video-result-${card.outputId}`}>
                    {card.url && <video src={card.url} controls preload="metadata" />}
                    <span>{card.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      {tab === 'edit' && (
        <div className="studio-video-edit" data-testid="video-edit-panel">
          <h2>Edit a project</h2>
          <p>
            Editing happens in the timeline editor — arrange clips, trims and layers there, and everything
            saves back to the project itself. Pick a project below and open it from the Projects gallery;
            that is the editor&rsquo;s front door today.
          </p>
          {projectsState === 'loading' && (
            <div className="studio-video-skeletons" data-testid="video-projects-loading" aria-label="Loading your projects">
              <span className="studio-skeleton-tile" />
              <span className="studio-skeleton-tile" />
              <span className="studio-skeleton-tile" />
            </div>
          )}
          {projectsState === 'error' && (
            <div className="studio-video-projects-error" data-testid="video-projects-error" role="alert">
              <p>{projectsError ?? 'Your projects could not be loaded.'}</p>
              <button type="button" onClick={() => onRetryProjects?.()}>
                Retry
              </button>
            </div>
          )}
          {projectsState === 'ready' && projects.length === 0 && (
            <p data-testid="video-projects-empty">
              No projects yet — <a href="/projects">create your first project</a> and it will be waiting here
              to edit.
            </p>
          )}
          {projectsState === 'ready' && projects.length > 0 && (
            <ul className="studio-video-project-list">
              {projects.map((project) => (
                <li key={project.id} data-testid={`video-project-${project.id}`}>
                  <strong>{project.name}</strong>
                  <span>
                    {project.type} project · last edited {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                  <a href="/projects">Open in Projects</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'motion' && (
        <div className="studio-video-motion" data-testid="video-motion-panel">
          <h2>Motion Control</h2>
          <p>
            The camera is this studio&rsquo;s signature. Stack up to three moves; they run in order on your
            next clip and ride on the generation tools as camera choices from {VIDEO_CAMERA_PRESETS_TOOL}.
            Some moves cannot share a shot — those pairs block here, with the reason, instead of failing
            later.
          </p>
          <MotionControl
            stack={stack}
            notice={stackNotice}
            onAdd={handleAddMove}
            onRemove={(moveId) => {
              applyStack(removeCameraMove(stack, moveId));
              setStackNotice(null);
            }}
            onMove={(moveId, direction) => applyStack(moveCameraMove(stack, moveId, direction))}
          />
          <p className="studio-video-motion-note" role="note">
            This library renders the move catalogue in the {VIDEO_CAMERA_PRESETS_TOOL} data shape; when that
            endpoint connects, the same names, families and prices arrive from the server instead.
          </p>
        </div>
      )}
    </section>
  );
};

export default VideoStudio;
