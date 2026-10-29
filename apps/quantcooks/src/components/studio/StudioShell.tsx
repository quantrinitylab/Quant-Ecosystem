// ============================================================================
// QuantCooks Studio — shell (spec §1.1, Phase 2 Unit 1 scope)
//
// Top bar + side nav for the studio surfaces. Reconciliation with §1.1,
// recorded per the unit's rules: the spec's shell replaces the app shell
// wholesale (its Projects/Templates/Brand Kit entries included) — Unit 1
// could only create new files, so the studio shell landed as an additive
// shell for the /studio routes carrying the spec's studio nav.
//
// Follow-up batch update (F-1): the spec's workspace entries now render
// as their own sidebar group (SHELL_LINKS below) — Projects, Templates
// and Brand Kit are real routes; Connect QuantAI has no route yet (the
// CP-5 connect surface), so it renders as a disabled "in build" entry,
// never a dead link. The studio entries flip to links as their units
// land: Image, Photo Editor, Video, Promo, Recipe Film Studio, Story
// Series, Canvas Board, Voice Studio and Quick Tools are live routes
// now (Film and Board flipped by the small-fixes unit once Units 5 and
// 6 had landed; Voice flipped by shared-file batch #2 once Unit 7 had
// landed; Tools flipped by shared-file batch #3 once Unit 8 had landed
// /tools; Photo Editor and Story Series added by shared-file batch #4
// once C-3 and Unit 9 had landed /studio/photo and /studio/stories).
// Credits flipped last, by shared-file batch #5, once Unit 10 had
// landed /account — NO STUDIO_NAV entry remains in build now: every
// studio entry below is a link to a real route. Design Studio was
// ADDED as an entry by the C-7 unit once it landed /studio/design
// (the library home; the Screens editor lives one level below it). (The workspace
// group's Connect QuantAI entry in SHELL_LINKS below is a separate,
// deliberate disabled entry for the unbuilt CP-5 connect surface —
// it is not a studio nav entry and is not "in build" in this sense.)
// Only routes that exist are links — a surface without a route would
// be a disabled "in build" entry, never a link to a 404. Credits sits
// at the bottom of the sidebar as the pill (§1.1), in its honest state.
// ============================================================================

import React from 'react';
import { CreditsPill, type CreditsPillProps } from './CreditsPill';
import { BrandMark } from '../BrandMark';
import { NavIcon } from './NavIcons';

export interface StudioNavItem {
  id: string;
  label: string;
  /** Route when the surface exists; null while it is still in build. */
  href: string | null;
}

export const STUDIO_NAV: StudioNavItem[] = [
  { id: 'explore', label: 'Explore', href: '/studio' },
  { id: 'image', label: 'Image Studio', href: '/studio/image' },
  { id: 'photo', label: 'Photo Editor', href: '/studio/photo' },
  { id: 'video', label: 'Video Studio', href: '/studio/video' },
  { id: 'promo', label: 'Promo Studio', href: '/studio/promo' },
  { id: 'film', label: 'Recipe Film Studio', href: '/studio/film' },
  { id: 'stories', label: 'Story Series', href: '/studio/stories' },
  { id: 'board', label: 'Canvas Board', href: '/studio/board' },
  { id: 'design', label: 'Design Studio', href: '/studio/design' },
  { id: 'voice', label: 'Voice Studio', href: '/studio/voice' },
  { id: 'tools', label: 'Quick Tools', href: '/tools' },
  { id: 'assets', label: 'Assets', href: '/assets' },
  { id: 'credits', label: 'Credits', href: '/account' },
];

/**
 * The workspace group (§1.1's shell-level destinations, F-1). Projects,
 * Templates and Brand Kit are long-standing real pages of this app.
 * Connect QuantAI is the CP-5 connect surface — not built yet, so it is
 * a disabled entry, not a link.
 */
export const SHELL_LINKS: StudioNavItem[] = [
  { id: 'projects', label: 'Projects', href: '/projects' },
  { id: 'templates', label: 'Templates', href: '/templates' },
  { id: 'brand-kit', label: 'Brand Kit', href: '/brand-kit' },
  { id: 'connect-quantai', label: 'Connect QuantAI', href: null },
];

export interface StudioShellProps {
  /** STUDIO_NAV id of the current surface. */
  active: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  credits?: CreditsPillProps;
  children: React.ReactNode;
}

export const StudioShell: React.FC<StudioShellProps> = ({
  active,
  searchValue,
  onSearchChange,
  credits,
  children,
}) => {
  const renderNavItem = (item: StudioNavItem) => (
    <li key={item.id}>
      {item.href ? (
        <a
          href={item.href}
          aria-current={active === item.id ? 'page' : undefined}
          className={active === item.id ? 'studio-nav-active' : undefined}
        >
          <NavIcon id={item.id} />
          {item.label}
        </a>
      ) : (
        <span className="studio-nav-disabled" data-testid={`nav-in-build-${item.id}`} aria-disabled="true">
          <NavIcon id={item.id} />
          {item.label} <em className="studio-nav-badge">in build</em>
        </span>
      )}
    </li>
  );

  return (
    <div className="studio-shell" data-testid="studio-shell">
      <aside className="studio-shell-nav" aria-label="Studio">
        <div className="studio-shell-wordmark">
          <BrandMark size={26} variant="accent" />
          <span>QuantCooks Studio</span>
        </div>
        <nav>
          <ul>{STUDIO_NAV.map(renderNavItem)}</ul>
        </nav>
        <nav aria-label="Workspace">
          <p className="studio-shell-nav-heading">Workspace</p>
          <ul>{SHELL_LINKS.map(renderNavItem)}</ul>
        </nav>
        <div className="studio-shell-credits">
          <CreditsPill {...credits} />
        </div>
      </aside>

      <div className="studio-shell-main">
        <header className="studio-shell-topbar">
          <label className="studio-shell-search">
            <span className="sr-only">Search presets, projects and tools</span>
            <input
              type="search"
              data-testid="studio-search"
              placeholder="Search presets, projects, tools…"
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </label>
          <a className="studio-shell-new-project" href="/projects">
            New Project
          </a>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
};

export default StudioShell;
