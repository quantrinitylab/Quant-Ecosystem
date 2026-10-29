// ============================================================================
// QuantCooks Studio — Recipe Film Studio home page (route: /studio/film,
// spec §5.1, checklist #38)
//
// Thin wiring, Unit 1 pattern: the shell and the real hooks live here; all
// behaviour lives in the FilmStudio component. Projects are the caller's
// real projects (useProjects → listProjects, P0-1) and creating a film is
// the api-client's real createProject.
//
// Shell note: StudioShell's STUDIO_NAV is a static export with Recipe
// Film Studio still listed as "in build" (href: null). This page makes
// the route real when navigated to directly; flipping that one nav entry
// to href '/studio/film' is a named follow-up for a unit allowed to edit
// StudioShell.tsx (this unit creates new files only).
// ============================================================================

import React from 'react';
import { StudioShell } from '../../components/studio/StudioShell';
import { FilmStudio, type FilmDataState } from '../../components/studio/FilmStudio';
import { useProjects } from '../../hooks/useProjects';
import apiClient from '../../services/api-client';

export default function StudioFilmPage() {
  const projectsQuery = useProjects();

  const projectsState: FilmDataState = projectsQuery.isLoading
    ? 'loading'
    : projectsQuery.isError
      ? 'error'
      : 'ready';

  return (
    <StudioShell active="film">
      <FilmStudio
        projects={projectsQuery.data ?? []}
        projectsState={projectsState}
        projectsError={projectsQuery.error instanceof Error ? projectsQuery.error.message : null}
        onRetryProjects={() => {
          void projectsQuery.refetch();
        }}
        createProject={(data) => apiClient.createProject(data)}
        jobs={[]}
      />
    </StudioShell>
  );
}
