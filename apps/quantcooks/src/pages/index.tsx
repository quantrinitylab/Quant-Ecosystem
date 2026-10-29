// ============================================================================
// QuantCooks — home (route: /)
//
// F-1: `/` is the studio Explore home (spec §1.2: "Route: / becomes
// Explore"). This page renders the exact component the /studio route
// renders — one screen, two routes, no copy.
//
// What used to live here: the teardown-era project gallery (Recent /
// Templates / Shared tabs). Nothing real was lost in the move — that
// gallery's open/duplicate/template handlers were no-op stubs, and its
// three tabs survive as real pages the shell now links directly:
// Projects (/projects, the project manager), Templates (/templates) and
// the projects gallery (/projects-gallery), with Brand Kit (/brand-kit)
// alongside them in the shell's Workspace group.
// ============================================================================

import React from 'react';
import StudioExplorePage from './studio/index';

export default function HomePage() {
  return <StudioExplorePage />;
}
