// ============================================================================
// QuantCooks Studio — Recipe Film project workspace page
// (route: /studio/film/[projectId], spec §5.4, checklist #43)
//
// Thin wiring: the project row is the caller's real project
// (useProjectById → getProject, P0-1), assets come from useAssets (P0-3,
// unfiltered — element picking applies the READY rules itself), and brand
// kits are read live through useBrandKit (pre-Phase-0 CRUD) for the
// header's kit line. The film document itself (brief, elements, shots)
// is owned by the FilmWorkspace component and its per-project draft
// mirror — see that file's header for the persistence evidence.
// ============================================================================

import React from 'react';
import { useRouter } from 'next/router';
import { StudioShell } from '../../../components/studio/StudioShell';
import { FilmWorkspace, type FilmDataState } from '../../../components/studio/FilmWorkspace';
import { useAssets } from '../../../hooks/useAssets';
import { useBrandKit } from '../../../hooks/useBrandKit';
import { useProjectById } from '../../../hooks/useProjectById';

export default function StudioFilmWorkspacePage() {
  const router = useRouter();
  const projectId = typeof router.query.projectId === 'string' ? router.query.projectId : '';

  const projectQuery = useProjectById(projectId);
  const assetsQuery = useAssets();
  const brandKit = useBrandKit();

  const projectState: FilmDataState = !projectId || projectQuery.isLoading
    ? 'loading'
    : projectQuery.isError
      ? 'error'
      : 'ready';

  const assetsState: FilmDataState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  const brandKitsState: FilmDataState = brandKit.isLoading
    ? 'loading'
    : brandKit.error
      ? 'error'
      : 'ready';

  return (
    <StudioShell active="film">
      <FilmWorkspace
        project={projectQuery.data ?? null}
        projectState={projectState}
        projectError={projectQuery.error instanceof Error ? projectQuery.error.message : null}
        onRetryProject={() => {
          void projectQuery.refetch();
        }}
        assets={assetsQuery.data ?? []}
        assetsState={assetsState}
        assetsError={assetsQuery.error instanceof Error ? assetsQuery.error.message : null}
        onRetryAssets={() => {
          void assetsQuery.refetch();
        }}
        brandKits={brandKit.kits}
        brandKitsState={brandKitsState}
        jobs={[]}
      />
    </StudioShell>
  );
}
