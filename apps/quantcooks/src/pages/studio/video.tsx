// ============================================================================
// QuantCooks Studio — Video Studio page (route: /studio/video, spec §3.1)
//
// Thin wiring, Unit 1/2 pattern: the shell, the real P0-3 hooks and the
// api-client live here; all behaviour lives in the VideoStudio component.
//
// Uploads are project assets (P0-3), so the page resolves the upload
// target project honestly: an explicit ?projectId= wins, otherwise the
// most recent project from listProjects. With no project at all the
// component disables uploads and says why — it never uploads into a void.
// The Edit tab's project list comes from the same listProjects read.
//
// Shell note: StudioShell's STUDIO_NAV is a static export with Video
// Studio still listed as "in build" (href: null). This page makes the
// route real when navigated to directly; flipping that one nav entry to
// href '/studio/video' is a named follow-up for a unit allowed to edit
// StudioShell.tsx (this unit creates new files only).
// ============================================================================

import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { StudioShell } from '../../components/studio/StudioShell';
import { VideoStudio, type VideoDataState } from '../../components/studio/VideoStudio';
import { useAssets, useAssetUpload } from '../../hooks/useAssets';
import { useProjects } from '../../hooks/useProjects';

export default function StudioVideoPage() {
  const router = useRouter();
  const queryProjectId = typeof router.query.projectId === 'string' ? router.query.projectId : null;

  const projectsQuery = useProjects(undefined, 1);

  const project = useMemo(() => {
    const items = projectsQuery.data ?? [];
    if (queryProjectId) return items.find((p) => p.id === queryProjectId) ?? null;
    return items[0] ?? null;
  }, [projectsQuery.data, queryProjectId]);
  // An explicit ?projectId= is honoured even before the list resolves.
  const projectId = queryProjectId ?? project?.id ?? null;

  // Unfiltered: the Create tab picks frames (image) and clips (video) from
  // one library; the component applies the READY/type filters.
  const assetsQuery = useAssets();
  const uploadMutation = useAssetUpload();

  const assetsState: VideoDataState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  const projectsState: VideoDataState = projectsQuery.isLoading
    ? 'loading'
    : projectsQuery.isError
      ? 'error'
      : 'ready';

  return (
    <StudioShell active="video">
      <VideoStudio
        projectId={projectId}
        projectName={project?.name ?? null}
        assets={assetsQuery.data ?? []}
        assetsState={assetsState}
        assetsError={assetsQuery.error instanceof Error ? assetsQuery.error.message : null}
        onRetryAssets={() => {
          void assetsQuery.refetch();
        }}
        projects={projectsQuery.data ?? []}
        projectsState={projectsState}
        projectsError={projectsQuery.error instanceof Error ? projectsQuery.error.message : null}
        onRetryProjects={() => {
          void projectsQuery.refetch();
        }}
        upload={
          projectId
            ? (file: File) => uploadMutation.mutateAsync({ projectId, file })
            : undefined
        }
        jobs={[]}
      />
    </StudioShell>
  );
}
