// ============================================================================
// QuantCooks Studio — Explore home page (route: /studio)
//
// Phase 2 Unit 1. Spec §1.2 puts Explore at `/`; Unit 1 could only create
// new files, so Explore first landed here at /studio. The F-1 follow-up
// re-homed `/` to this same screen (pages/index.tsx renders this page's
// component), so / and /studio are one Explore surface, never two copies.
//
// Wiring here is deliberately thin: the shell's search feeds the feed,
// the api-client provides the real createProject, and useAssetUpload
// provides the wizard photo step's real upload — all behaviour lives in
// ExploreHome. The wizard no longer navigates on success (F-2): its
// success state offers the editor deep-link and /projects as choices.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { StudioShell } from '../../components/studio/StudioShell';
import { ExploreHome, type ExploreFeedState } from '../../components/studio/ExploreHome';
import apiClient from '../../services/api-client';
import { useAssetUpload } from '../../hooks/useAssets';

export default function StudioExplorePage() {
  const [query, setQuery] = useState('');
  // The catalogue is local data today (a list_presets feed joins in CP-1);
  // the first paint is the loading state so the skeleton grammar is real,
  // then the feed resolves on mount.
  const [feedState, setFeedState] = useState<ExploreFeedState>('loading');
  const assetUpload = useAssetUpload();

  useEffect(() => {
    setFeedState('ready');
  }, []);

  return (
    <StudioShell active="explore" searchValue={query} onSearchChange={setQuery}>
      <ExploreHome
        feedState={feedState}
        onRetryFeed={() => setFeedState('ready')}
        query={query}
        createProject={(data) => apiClient.createProject(data)}
        uploadPhoto={(projectId, file) => assetUpload.mutateAsync({ projectId, file })}
      />
    </StudioShell>
  );
}
