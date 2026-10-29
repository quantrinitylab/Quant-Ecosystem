// ============================================================================
// QuantCooks Studio — Design Studio home page (route: /studio/design,
// plan unit C-7 step 2). Thin wiring (the Unit 1/2 pattern): shell +
// real hooks here, behaviour in the component.
//
// Two real things are wired:
//  - the caller's assets via useAssets (unfiltered — the component
//    applies the design-document rule itself: READY + .figcraft);
//  - a byte fetcher over each design asset's fresh signed URL, used
//    ONLY to read the thumbnail embedded inside the .figcraft zip —
//    the asset is never modified by this screen.
// ============================================================================

import React from 'react';
import { StudioShell } from '../../components/studio/StudioShell';
import {
  DesignStudioHome,
  type DesignAssetsState,
} from '../../components/studio/DesignStudioHome';
import { useAssets } from '../../hooks/useAssets';
import type { ServerAsset } from '../../services/api-client';

export default function StudioDesignPage() {
  const assetsQuery = useAssets();

  const assetsState: DesignAssetsState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  const fetchAssetBytes = async (asset: ServerAsset): Promise<Uint8Array> => {
    if (!asset.url) {
      throw new Error('This design has no readable file yet.');
    }
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error(`Design file request failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };

  return (
    <StudioShell active="design">
      <DesignStudioHome
        assets={assetsQuery.data ?? []}
        assetsState={assetsState}
        assetsError={
          assetsQuery.error instanceof Error ? assetsQuery.error.message : null
        }
        onRetryAssets={() => void assetsQuery.refetch()}
        fetchAssetBytes={fetchAssetBytes}
      />
    </StudioShell>
  );
}
