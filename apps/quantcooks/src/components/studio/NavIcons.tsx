// ============================================================================
// QuantCooks Studio — shell nav icons (design upgrade D-3, landed in
// Phase B). One original thin-line glyph per shell entry, hand-drawn
// on a 24×24 grid in the study's icon idiom (1.7px stroke, round caps,
// no fills) — no icon font, no copied glyphs. Colour is currentColor:
// the nav link's own colour states (rest / hover / active) tint the
// glyph exactly like the label beside it.
// ============================================================================

import React from 'react';

const PATHS: Record<string, React.ReactNode> = {
  // Explore — a compass: ring, needle, centre point.
  explore: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.2 8.8l-2.1 4.3-4.3 2.1 2.1-4.3z" />
      <circle cx="12" cy="12" r="0.4" />
    </>
  ),
  // Image Studio — a framed picture: sun + ridge line.
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17.5l4.5-4 3.5 3 3-2.5 5 3.5" />
    </>
  ),
  // Photo Editor — a camera: body, lens, viewfinder bump.
  photo: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M8.5 7.5l1.4-2.5h4.2l1.4 2.5" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  // Video Studio — a play frame.
  video: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M10.2 9.3l4.8 2.7-4.8 2.7z" />
    </>
  ),
  // Promo Studio — a megaphone with sound arcs.
  promo: (
    <>
      <path d="M4 10.5v3l3 .8V9.7z" />
      <path d="M7 9.7l8-4.2v13L7 14.3" />
      <path d="M9 14.5l1 4" />
      <path d="M18 9.5a4 4 0 0 1 0 5" />
    </>
  ),
  // Recipe Film Studio — a film strip.
  film: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8.5 3.5v17M15.5 3.5v17" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h7" />
    </>
  ),
  // Story Series — stacked layers.
  stories: (
    <>
      <path d="M12 4l9 4.5-9 4.5-9-4.5z" />
      <path d="M4.5 12.8L12 16.5l7.5-3.7" />
      <path d="M4.5 16.3L12 20l7.5-3.7" />
    </>
  ),
  // Canvas Board — wired nodes.
  board: (
    <>
      <path d="M7 7l6.5 3.5M14.5 12.5L9 16.5" />
      <circle cx="6.5" cy="6.5" r="2.3" />
      <circle cx="17" cy="11.5" r="2.3" />
      <circle cx="7.5" cy="17.5" r="2.3" />
    </>
  ),
  // Design Studio — a pen nib.
  design: (
    <>
      <path d="M5 19L6.8 13L16.5 3.5a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5L11 17.2z" />
      <path d="M6.8 13L4 20l7-2.8" />
      <circle cx="15.5" cy="9.5" r="1.3" />
    </>
  ),
  // Voice Studio — a waveform of five bars.
  voice: (
    <>
      <path d="M5 10v4M9 7v10M13 4.5v15M17 8v8M20.5 10.5v3" />
    </>
  ),
  // Quick Tools — adjustment sliders.
  tools: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  // Assets — a four-up grid.
  assets: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  // Credits — a card with its stripe.
  credits: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M6.5 15h4" />
    </>
  ),
  // Projects — a folder.
  projects: (
    <>
      <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
    </>
  ),
  // Templates — a layout: header bar over two columns.
  templates: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M9.5 9.5v10" />
    </>
  ),
  // Brand Kit — a palette with paint wells.
  'brand-kit': (
    <>
      <path d="M12 4a8 8 0 1 0 0 16c1.4 0 2-.9 2-1.9 0-1.2-1-1.7-1-2.9 0-1 .8-1.7 2-1.7h2.3A3.7 3.7 0 0 0 21 9.7C20.4 6.4 16.5 4 12 4z" />
      <circle cx="8" cy="10" r="1.1" />
      <circle cx="12" cy="7.5" r="1.1" />
      <circle cx="16" cy="10" r="1.1" />
    </>
  ),
  // Connect QuantAI — a plug.
  'connect-quantai': (
    <>
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6.8 7.5h10.4V10a5.2 5.2 0 0 1-10.4 0z" />
      <path d="M12 15.2V21" />
    </>
  ),
};

export const NavIcon: React.FC<{ id: string }> = ({ id }) => {
  const paths = PATHS[id];
  if (!paths) return null;
  return (
    <svg
      className="studio-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
};

export default NavIcon;
