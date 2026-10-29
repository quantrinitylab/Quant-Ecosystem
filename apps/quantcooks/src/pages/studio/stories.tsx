// ============================================================================
// QuantCooks Studio — Episodic Stories home page (route: /studio/stories,
// deep plan G-16, checklist #64)
//
// Thin wiring, the established pattern: the shell lives here; all
// behaviour lives in the StoriesHome component. The series library has
// no server home yet, so there is deliberately NO data hook on this
// page — the component reads and writes the labelled per-device draft
// mirror (stories.ts), and this page only supplies the loading state
// until the first client render, when the mirror read has happened.
//
// Shell note: StudioShell's STUDIO_NAV has no Stories entry yet. This
// page makes the route real when navigated to directly; adding
// { id: 'stories', label: 'Story Series', href: '/studio/stories' } to
// STUDIO_NAV is a named follow-up for a shared-file batch (this unit
// creates new files only).
// ============================================================================

import React, { useEffect, useState } from 'react';
import { StudioShell } from '../../components/studio/StudioShell';
import { StoriesHome, type StoriesLibraryState } from '../../components/studio/StoriesHome';

export default function StudioStoriesPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Only the pre-mount moment is page-driven; after that the component's
  // own mirror state rules (including its read-error state).
  const libraryState: StoriesLibraryState | undefined = mounted ? undefined : 'loading';

  return (
    <StudioShell active="stories">
      <StoriesHome libraryState={libraryState} />
    </StudioShell>
  );
}
