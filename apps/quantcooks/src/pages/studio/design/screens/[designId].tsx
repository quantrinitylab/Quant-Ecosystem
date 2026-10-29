// ============================================================================
// QuantCooks Studio — Screens editor page (route:
// /studio/design/screens/[designId], plan unit C-7 step 3). designId
// is the EditAsset id of the .figcraft document, or the reserved id
// "new" for a fresh design.
//
// Thin wiring (the film workspace pattern): the source design is
// resolved by the component from the caller's real assets (useAssets,
// P0-3, unfiltered), the save-back target projects come from
// useProjects, the upload is the real P0-3 three-step seam
// (useAssetUpload), and the embedded editor's availability is the
// honest probe (probeDesignEditor against the installed bundle's
// index page — its genuine canvas marker, never a bare 200).
// ============================================================================

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { StudioShell } from '../../../../components/studio/StudioShell';
import { DesignEditor, type DesignDataState } from '../../../../components/studio/DesignEditor';
import { useAssets, useAssetUpload } from '../../../../hooks/useAssets';
import { useProjects } from '../../../../hooks/useProjects';
import {
  probeDesignEditor,
  type DesignEmbedProbe,
} from '../../../../lib/studio/figcraft';

export default function StudioDesignScreensPage() {
  const router = useRouter();
  const designId = typeof router.query.designId === 'string' ? router.query.designId : '';

  const assetsQuery = useAssets();
  const projectsQuery = useProjects();
  const uploadMutation = useAssetUpload();

  const [embedProbe, setEmbedProbe] = useState<DesignEmbedProbe | null>(null);
  useEffect(() => {
    let live = true;
    void probeDesignEditor({
      fetchText: async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Editor index request failed (${res.status})`);
        return res.text();
      },
    }).then((probe) => {
      if (live) setEmbedProbe(probe);
    });
    return () => {
      live = false;
    };
  }, []);

  const assetsState: DesignDataState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  const projectsState: DesignDataState = projectsQuery.isLoading
    ? 'loading'
    : projectsQuery.isError
      ? 'error'
      : 'ready';

  return (
    <StudioShell active="design">
      <DesignEditor
        designId={designId}
        assets={assetsQuery.data ?? []}
        assetsState={assetsState}
        assetsError={
          assetsQuery.error instanceof Error ? assetsQuery.error.message : null
        }
        onRetryAssets={() => void assetsQuery.refetch()}
        projects={projectsQuery.data ?? []}
        projectsState={projectsState}
        embedProbe={embedProbe}
        upload={(projectId, file) => uploadMutation.mutateAsync({ projectId, file })}
      />
    </StudioShell>
  );
}
