// ============================================================================
// QuantCooks Studio — Quick Tools directory page (route: /tools, spec §8.1)
//
// Route choice (recorded per the unit's rules): the master checklist
// (rows #58–#63) and spec §8 both assign the directory /tools and the
// single-purpose pages /tools/[toolId] — top-level routes, not
// /studio/tools — so the pages live here, inside the same StudioShell.
//
// Thin wiring: the shell's search field drives the directory filter;
// the catalogue itself is lib data (tools.ts), so this page needs no
// data hooks at all.
//
// Shell note: StudioShell's STUDIO_NAV links here — shared-file
// batch #3 flipped the Quick Tools entry to href '/tools' once this
// route had landed (Unit 8); shared-file batch #4 corrected this
// header, whose earlier wording predated that flip.
// ============================================================================

import React, { useState } from 'react';
import { StudioShell } from '../components/studio/StudioShell';
import { QuickToolsDirectory } from '../components/studio/QuickToolsDirectory';

export default function QuickToolsPage() {
  const [search, setSearch] = useState('');
  return (
    <StudioShell active="tools" searchValue={search} onSearchChange={setSearch}>
      <QuickToolsDirectory query={search} />
    </StudioShell>
  );
}
