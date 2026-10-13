// ============================================================================
// QuantChat — HandIcon (QC-F-263)
// ============================================================================
//
// Raised-hand glyph used by the meet dock button, the ParticipantTile hand
// badge, and the raise-queue strip — one shape in all three places
// (specialist-qc-f-263.md §3/§5). Inline SVG only: the ✋ emoji/character is
// never used in UI (standing product rule). The palm is composed of simple
// rounded bars (four fingers of differing heights, a palm, and a thumb) so
// the silhouette stays legible from badge size (12px) to dock size (24px).

interface HandIconProps {
  className?: string;
}

export function HandIcon({ className = 'h-6 w-6' }: HandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Fingers — index, middle, ring, pinky (middle tallest) */}
      <rect x="7.15" y="4.6" width="2.1" height="6.9" rx="1.05" />
      <rect x="9.95" y="3.2" width="2.1" height="8.3" rx="1.05" />
      <rect x="12.75" y="4.3" width="2.1" height="7.2" rx="1.05" />
      <rect x="15.55" y="5.7" width="2.1" height="5.8" rx="1.05" />
      {/* Palm */}
      <rect x="6.9" y="10.1" width="10.9" height="9.2" rx="3.1" />
      {/* Thumb */}
      <rect
        x="3.9"
        y="11.2"
        width="2.2"
        height="6.4"
        rx="1.1"
        transform="rotate(24 5 14.4)"
      />
    </svg>
  );
}
