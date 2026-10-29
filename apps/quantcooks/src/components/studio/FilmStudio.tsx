// ============================================================================
// QuantCooks Studio — Recipe Film Studio home (spec §5.1, checklist #38)
//
// Projects are the centre of gravity: the caller's REAL projects as a
// searchable, sortable grid; a hero with the shared film composer; a
// My Generations rail fed only by real jobs; and the New Film brief flow
// whose project creation is real end-to-end (createProject, P0-1).
//
// States with no real source say so instead of inventing content:
//  - My Elements / My Favourites are account-level views that do not
//    exist yet — Elements live inside a project, and favourites arrive
//    with the community layer. The nav names both honestly.
//  - The Community Feed (spec §5.7, G-17) has no backend and no posts;
//    it renders its not-available state. No community film is invented.
//  - The hero composer's Generate is not-configured: it names
//    quantcooks.create_shot_sequence and charges nothing.
// ============================================================================

import React, { useState } from 'react';
import type { ServerProject } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  FILM_CREATE_PROJECT_TOOL,
  FILM_PROJECTS_TOOL,
  FILM_SHOTS_TOOL,
  FILM_STORYBOARD_TOOL,
  DEFAULT_FILM_STYLE,
  EMPTY_FILM_DRAFT,
  FILM_PROJECT_SORTS,
  emptyBrief,
  filmDraftKey,
  filterFilmProjects,
  filmGenreById,
  filmResultsFromJobs,
  filmStyleSummary,
  runFilmCreate,
  serializeFilmDraft,
  sortFilmProjects,
  type FilmCreateOutcome,
  type FilmProjectClient,
  type FilmProjectSort,
  type FilmStyle,
} from '../../lib/studio/film';
import { cameraMoveById, type CameraMove } from '../../lib/studio/video';
import type { FilmGenre } from '../../lib/studio/film';
import { Composer, type ComposerChip } from './Composer';
import { JobStrip } from './JobStrip';
import { CameraMovePicker, GenrePickerModal, StylePanel } from './FilmPickers';

export type FilmDataState = 'loading' | 'ready' | 'error';

export interface FilmStudioProps {
  /** The caller's real projects (page wires useProjects). */
  projects?: ServerProject[];
  projectsState: FilmDataState;
  projectsError?: string | null;
  onRetryProjects?: () => void;
  /** The real createProject (page wires the api-client). Omit = create off. */
  createProject?: FilmProjectClient['createProject'];
  /** Real jobs for the strip / generations rail (export-shaped today). */
  jobs?: StudioJob[];
  initialQuery?: string;
  initialSort?: FilmProjectSort;
  initialBriefOpen?: boolean;
  initialTitle?: string;
  initialContext?: string;
  initialCreatedProject?: ServerProject | null;
  initialGenreId?: string | null;
}

export const FilmStudio: React.FC<FilmStudioProps> = ({
  projects = [],
  projectsState,
  projectsError,
  onRetryProjects,
  createProject,
  jobs = [],
  initialQuery = '',
  initialSort = 'edited',
  initialBriefOpen = false,
  initialTitle = '',
  initialContext = '',
  initialCreatedProject = null,
  initialGenreId = null,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<FilmProjectSort>(initialSort);
  const [briefOpen, setBriefOpen] = useState(initialBriefOpen);
  const [title, setTitle] = useState(initialTitle);
  const [context, setContext] = useState(initialContext);
  const [creating, setCreating] = useState(false);
  const [createOutcome, setCreateOutcome] = useState<FilmCreateOutcome | null>(() =>
    initialCreatedProject ? { status: 'created', project: initialCreatedProject } : null,
  );
  const [genreId, setGenreId] = useState<string | null>(initialGenreId);
  const [genreModalOpen, setGenreModalOpen] = useState(false);
  const [style, setStyle] = useState<FilmStyle>(DEFAULT_FILM_STYLE);
  const [manualStyle, setManualStyle] = useState(false);
  const [cameraMoveId, setCameraMoveId] = useState<string | null>(null);
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState('');

  const visibleProjects = sortFilmProjects(filterFilmProjects(projects, query), sort);
  const results = filmResultsFromJobs(jobs);
  const genre = filmGenreById(genreId);
  const cameraMove = cameraMoveById(cameraMoveId);

  const handleCreate = async () => {
    if (!createProject) return;
    setCreating(true);
    const outcome = await runFilmCreate({ createProject }, title);
    setCreating(false);
    setCreateOutcome(outcome);
    if (outcome.status === 'created' && context.trim() !== '') {
      // The brief joins the project in its workspace as the Context
      // section of the film document's draft mirror (same device — the
      // mirror is the film document's only home today, see film.ts).
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(
            filmDraftKey(outcome.project.id),
            serializeFilmDraft({
              ...EMPTY_FILM_DRAFT,
              brief: { ...emptyBrief(), context },
            }),
          );
        }
      } catch {
        // Mirror unavailable: the project is still created; the context
        // simply does not carry over, and the created panel says the
        // brief lives in the workspace draft.
      }
    }
  };

  const chips: ComposerChip[] = [
    {
      id: 'genre',
      label: 'Genre',
      value: genre?.name,
      onPick: () => setGenreModalOpen(true),
      onClear: () => setGenreId(null),
    },
    {
      id: 'style',
      label: 'Style',
      value: manualStyle ? filmStyleSummary(style) : undefined,
      onPick: () => setManualStyle((on) => !on),
      onClear: () => {
        setStyle(DEFAULT_FILM_STYLE);
        setManualStyle(false);
      },
    },
    {
      id: 'camera',
      label: 'Camera',
      value: cameraMove?.name,
      onPick: () => setCameraPickerOpen((open) => !open),
      onClear: () => setCameraMoveId(null),
    },
  ];

  return (
    <section className="studio-film" data-testid="film-studio">
      <header className="studio-film-head">
        <h1><span className="studio-title-accent">Recipe Film</span> Studio</h1>
        <p>
          Directed recipe films, project by project: a brief, a library of reusable elements, and a shot
          list the Director plans with you — frames approved before a single video credit moves.
        </p>
      </header>

      <div className="studio-film-layout">
        {/* ------------------------------------------------ in-screen nav */}
        <aside className="studio-film-nav" aria-label="Film studio sections">
          <ul>
            <li aria-current="page">Home</li>
            <li>
              <a href="#film-generations">My Generations</a>
            </li>
            <li>
              My Elements
              <p role="note">
                Elements live inside a film project — open one below, or start a new film, and its dishes,
                kitchens and products are managed there.
              </p>
            </li>
            <li>
              My Favourites
              <p role="note">Nothing favourited yet — favourites arrive with the community layer below.</p>
            </li>
            <li>
              <a href="#film-community">Community Feed</a>
            </li>
          </ul>
        </aside>

        <div className="studio-film-centre">
          {/* ------------------------------------------------ hero composer */}
          <div className="studio-film-hero" data-testid="film-hero">
            <h2>Create your first project</h2>
            <p>
              Describe the film — the dish, the kitchen, the moment it must land. This composer is the same
              one inside every project; its shots run through {FILM_SHOTS_TOOL}.
            </p>

            {manualStyle && <StylePanel style={style} onChange={setStyle} manual={manualStyle} onManualChange={setManualStyle} />}

            {cameraPickerOpen && (
              <CameraMovePicker
                selectedId={cameraMoveId}
                onSelect={(move: CameraMove) => {
                  setCameraMoveId(move.id);
                  setCameraPickerOpen(false);
                }}
                onClear={() => {
                  setCameraMoveId(null);
                  setCameraPickerOpen(false);
                }}
              />
            )}

            {/*
              The Composer prices from its initial settings only, so the
              camera pick re-prices Generate by remounting it keyed on the
              move (the F-U3-2 pattern from Video/Promo); the prompt is
              held here and handed back as initialPrompt.
            */}
            <Composer
              key={`film-hero-composer-${cameraMoveId ?? 'none'}`}
              kind="video"
              chips={chips}
              placeholder="Describe the film… @ a dish or presenter, / a collection"
              initialPrompt={prompt}
              onPromptChange={setPrompt}
              initialSettings={{ stackedExtras: cameraMoveId ? 1 : 0 }}
              generation="not-configured"
              notConfiguredReason={`Film generation is not connected yet — shots run through ${FILM_SHOTS_TOOL}, whose provider is not configured (NOT_CONFIGURED). Your projects are real; nothing will be charged.`}
            />
            <p role="note">
              Prefer to plan first? The storyboard flow ({FILM_STORYBOARD_TOOL}) lives inside a project:
              frames are approved before any video spend. Open a project below, or create one.
            </p>
          </div>

          {/* ------------------------------------------------ new film brief */}
          <div className="studio-film-new" data-testid="film-new">
            <h2>New film</h2>
            {!briefOpen && !createOutcome && (
              <>
                <p>
                  A film starts as a real project ({FILM_CREATE_PROJECT_TOOL}) with a brief. The brief and
                  the shot plan are kept as a draft on this device for now — the project itself is saved
                  for real, and nothing about that split is hidden.
                </p>
                <button type="button" data-testid="film-new-open" onClick={() => setBriefOpen(true)}>
                  Start a new film
                </button>
              </>
            )}
            {(briefOpen || createOutcome?.status === 'error') && (
              <div className="studio-film-brief-form" data-testid="film-brief-form">
                <label>
                  Film title
                  <input
                    type="text"
                    data-testid="film-new-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Monsoon Thali — a short film"
                  />
                </label>
                <label>
                  Context — what is this film, and where will it play?
                  <textarea
                    data-testid="film-new-context"
                    value={context}
                    rows={3}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="A 40-second film for our weekend thali launch, for Reels and the restaurant screen…"
                  />
                </label>
                <p role="note">
                  The project is created for real under this title; the context below joins it in the
                  workspace as a draft on this device, in the brief&rsquo;s Context section.
                </p>
                <button
                  type="button"
                  data-testid="film-new-create"
                  disabled={creating || !createProject}
                  onClick={() => void handleCreate()}
                >
                  {creating ? 'Creating the project…' : 'Create film project'}
                </button>
                {!createProject && (
                  <p role="note">Project creation is not connected on this surface right now.</p>
                )}
                {createOutcome?.status === 'error' && (
                  <p className="studio-film-create-error" data-testid="film-create-error" role="alert">
                    {createOutcome.message}
                  </p>
                )}
              </div>
            )}
            {createOutcome?.status === 'created' && (
              <div className="studio-film-created" data-testid="film-created">
                <p>
                  <strong>{createOutcome.project.name}</strong> is created and saved — it is a real project
                  ({FILM_PROJECTS_TOOL} lists it). Its brief, elements and shot plan live in the workspace
                  as a draft on this device until a server home for the film document lands.
                </p>
                <a data-testid="film-open-workspace" href={`/studio/film/${createOutcome.project.id}`}>
                  Open the workspace
                </a>
              </div>
            )}
          </div>

          {/* ------------------------------------------------ projects */}
          <section className="studio-film-projects" data-testid="film-projects" aria-label="Your film projects">
            <h2>Projects</h2>
            <div className="studio-film-projects-tools">
              <label>
                Search projects
                <input
                  type="search"
                  data-testid="film-projects-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name…"
                />
              </label>
              <label>
                Sort
                <select
                  data-testid="film-projects-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as FilmProjectSort)}
                >
                  {FILM_PROJECT_SORTS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {projectsState === 'loading' && (
              <div className="studio-film-skeletons" data-testid="film-projects-loading" aria-label="Loading your projects">
                <span className="studio-skeleton-tile" />
                <span className="studio-skeleton-tile" />
                <span className="studio-skeleton-tile" />
              </div>
            )}
            {projectsState === 'error' && (
              <div className="studio-film-projects-error" data-testid="film-projects-error" role="alert">
                <p>{projectsError ?? 'Your projects could not be loaded.'}</p>
                <button type="button" onClick={() => onRetryProjects?.()}>
                  Retry
                </button>
              </div>
            )}
            {projectsState === 'ready' && projects.length === 0 && (
              <div className="studio-film-projects-empty" data-testid="film-projects-empty">
                <h3>No film projects yet</h3>
                <p>
                  See how a recipe film is built: a brief first, elements next, then a shot list with every
                  shot priced before anything generates. Start your first film above — it saves as a real
                  project.
                </p>
              </div>
            )}
            {projectsState === 'ready' && projects.length > 0 && visibleProjects.length === 0 && (
              <p data-testid="film-projects-no-match">
                No project matches “{query}”. Clear the search to see all {projects.length}.
              </p>
            )}
            {projectsState === 'ready' && visibleProjects.length > 0 && (
              <ul className="studio-film-project-grid">
                {visibleProjects.map((project) => (
                  <li key={project.id} data-testid={`film-project-${project.id}`}>
                    <a href={`/studio/film/${project.id}`}>
                      <strong>{project.name}</strong>
                      <span>
                        {project.type} · Last edited {project.updatedAt.slice(0, 10)} · Private
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ------------------------------------------------ community */}
          <section className="studio-film-community" data-testid="film-community" id="film-community" aria-label="Community feed">
            <h2>Community Feed</h2>
            <p data-testid="film-community-empty">
              The community feed is part of the creator layer and is not connected yet — there are no posts
              to show, and this space will not invent other people&rsquo;s films to fill itself. Your own
              films stay private in your projects until you choose to publish one.
            </p>
          </section>
        </div>

        {/* ------------------------------------------------ generations rail */}
        <aside className="studio-film-generations" data-testid="film-generations" id="film-generations" aria-label="My generations">
          <h2>My Generations</h2>
          <JobStrip jobs={jobs} />
          {results.length === 0 ? (
            <p data-testid="film-generations-empty">
              No generated clips yet. Generation is not connected, so this rail stays honestly empty until
              a provider lands — finished shots will appear here and in Assets, each with its cost
              attached.
            </p>
          ) : (
            <ul className="studio-film-results-grid">
              {results.map((card) => (
                <li key={card.outputId} data-testid={`film-result-${card.outputId}`}>
                  {card.url && <video src={card.url} controls preload="metadata" />}
                  <span>{card.label}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <GenrePickerModal
        open={genreModalOpen}
        selectedId={genreId}
        onSelect={(picked: FilmGenre) => {
          setGenreId(picked.id);
          setGenreModalOpen(false);
        }}
        onClose={() => setGenreModalOpen(false)}
      />
    </section>
  );
};

export default FilmStudio;
