// ============================================================================
// Quant Workplace — suite mark
// ============================================================================
// One ring, five arcs: Mail, Calendar, Drive, Contacts, Git in their pillar
// accents, plus the "Q" tail. The current app's arc is lit (full opacity,
// thicker stroke, soft glow) so the brand doubles as a "you are here" cue.
// Pure static SVG — no hooks, safe to render on the server.
// ============================================================================

import { PILLAR_ACCENTS, type PillarAccentId } from '../pillar-accents';

const ARC_ORDER: readonly PillarAccentId[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];
const ARC_LENGTH = (100 / ARC_ORDER.length - 3.2).toFixed(2);

export interface WorkplaceMarkProps {
  size?: number;
  /** The app whose arc is lit. */
  active?: PillarAccentId;
  className?: string;
}

export function WorkplaceMark({ size = 30, active, className = '' }: WorkplaceMarkProps) {
  return (
    <svg
      className={`qw-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      data-testid="workplace-mark"
      data-active-arc={active}
    >
      {ARC_ORDER.map((id, i) => (
        <circle
          key={id}
          className={`qw-mark-arc${id === active ? ' is-on' : ''}`}
          data-arc={id}
          cx="16"
          cy="16"
          r="10"
          fill="none"
          stroke={PILLAR_ACCENTS[id]}
          color={PILLAR_ACCENTS[id]}
          strokeWidth={3.6}
          pathLength={100}
          strokeDasharray={`${ARC_LENGTH} 100`}
          strokeDashoffset={(-i * 20 - 1.6).toFixed(2)}
          transform="rotate(-90 16 16)"
        />
      ))}
      <path d="M22.6 22.6 27 27" stroke="#F4F5F7" strokeWidth={3.4} strokeLinecap="round" />
    </svg>
  );
}

export default WorkplaceMark;
