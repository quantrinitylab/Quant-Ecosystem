// ============================================================================
// QuantCooks Studio — Story series workspace page
// (route: /studio/stories/[seriesId], deep plan G-16, checklist #64)
//
// Thin wiring: the router supplies the series id; everything else —
// the per-device draft mirror read/write, the premise composer, the
// story bible, the episode plan, the quote and the Generate attempt —
// lives in the StoriesWorkspace component (stories.ts holds the rules).
// A series id that is not in this device's mirror renders the
// component's honest not-on-this-device state, never a blank page.
// ============================================================================

import React from 'react';
import { useRouter } from 'next/router';
import { StudioShell } from '../../../components/studio/StudioShell';
import { StoriesWorkspace, type StoriesWorkspaceState } from '../../../components/studio/StoriesWorkspace';

export default function StudioStoriesWorkspacePage() {
  const router = useRouter();
  const seriesId = typeof router.query.seriesId === 'string' ? router.query.seriesId : '';

  // Only router-not-ready is page-driven; after that the component's
  // own mirror state rules (including its read-error state).
  const workspaceState: StoriesWorkspaceState | undefined = router.isReady ? undefined : 'loading';

  return (
    <StudioShell active="stories">
      <StoriesWorkspace seriesId={seriesId} workspaceState={workspaceState} />
    </StudioShell>
  );
}
