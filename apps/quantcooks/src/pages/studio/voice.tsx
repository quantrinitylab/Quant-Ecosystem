// ============================================================================
// QuantCooks Studio — Voice Studio page (route: /studio/voice, spec §7.1)
//
// Thin wiring, the Unit 1 pattern: the shell and the real hooks live
// here; all behaviour lives in the VoiceStudio component.
//
// One real data source, read-only from this page: the caller's assets
// (P0-3, unfiltered listAssets) — the screen itself applies the READY /
// kind rules per picker (audio samples, dub reference videos, persona
// reference photos). Scripts, personas and voice drafts persist in the
// component's device draft mirror; there is no upload on this screen
// (samples and references are picked from what already landed), so no
// project target is needed.
//
// Shell note: StudioShell's STUDIO_NAV still lists Voice Studio as
// "in build" (href: null). This page makes the route real when navigated
// to directly; flipping that one nav entry to href '/studio/voice' is a
// named follow-up for a unit allowed to edit StudioShell.tsx (this unit
// creates new files only).
// ============================================================================

import React from 'react';
import { StudioShell } from '../../components/studio/StudioShell';
import { VoiceStudio, type VoiceAssetsState } from '../../components/studio/VoiceStudio';
import { useAssets } from '../../hooks/useAssets';

export default function StudioVoicePage() {
  // Unfiltered: the pickers apply the READY/kind rules themselves.
  const assetsQuery = useAssets();

  const assetsState: VoiceAssetsState = assetsQuery.isLoading
    ? 'loading'
    : assetsQuery.isError
      ? 'error'
      : 'ready';

  return (
    <StudioShell active="voice">
      <VoiceStudio
        assets={assetsQuery.data ?? []}
        assetsState={assetsState}
        assetsError={assetsQuery.error instanceof Error ? assetsQuery.error.message : null}
        onRetryAssets={() => {
          void assetsQuery.refetch();
        }}
        jobs={[]}
      />
    </StudioShell>
  );
}
