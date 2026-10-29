// ============================================================================
// QuantCooks Studio — Promo Studio page (route: /studio/promo, spec §4.1)
//
// Thin wiring, Unit 1 pattern: the shell, the real hooks and the
// api-client live here; all behaviour lives in the PromoStudio component.
//
// Two real data sources, both read-only from this page:
//  - Assets (P0-3): unfiltered listAssets — the product slot picks READY
//    images from the caller's library; uploads save into a project, so
//    the upload target resolves like the other studios: an explicit
//    ?projectId= wins, otherwise the most recent project. With no project
//    the component disables uploads and says why.
//  - Brand kits: the pre-Phase-0 brand-kit CRUD through the existing
//    useBrandKit hook (verified fully working in the P0-2 inventory).
//
// Shell note: STUDIO_NAV links here — the Promo Studio nav entry was
// flipped to href '/studio/promo' by shared-file batch #1, once this
// page had landed (stale-comment fix recorded by shared-file batch #3).
// ============================================================================

import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { StudioShell } from '../../components/studio/StudioShell';
import { PromoStudio, type PromoDataState } from '../../components/studio/PromoStudio';
import { useAssets, useAssetUpload } from '../../hooks/useAssets';
import { useBrandKit } from '../../hooks/useBrandKit';
import { useProjects } from '../../hooks/useProjects';

export default function StudioPromoPage() {
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

  // Unfiltered: the product picker applies the READY/image rules itself.
  const assetsQuery = useAssets();
  const uploadMutation = useAssetUpload();
  const brandKit = useBrandKit();

  const assetsState: PromoDataState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  const brandKitsState: PromoDataState = brandKit.isLoading
    ? 'loading'
    : brandKit.error
      ? 'error'
      : 'ready';

  return (
    <StudioShell active="promo">
      <PromoStudio
        projectId={projectId}
        projectName={project?.name ?? null}
        assets={assetsQuery.data ?? []}
        assetsState={assetsState}
        assetsError={assetsQuery.error instanceof Error ? assetsQuery.error.message : null}
        onRetryAssets={() => {
          void assetsQuery.refetch();
        }}
        brandKits={brandKit.kits}
        brandKitsState={brandKitsState}
        brandKitsError={brandKit.error instanceof Error ? brandKit.error.message : null}
        onRetryBrandKits={() => {
          void brandKit.refetch();
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
