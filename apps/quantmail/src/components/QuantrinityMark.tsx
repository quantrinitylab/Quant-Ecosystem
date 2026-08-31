'use client';

import { QuantMailLogo } from './QuantMailLogo';

interface QuantrinityMarkProps {
  className?: string;
  compact?: boolean;
  label?: string;
}

/**
 * Brand mark bridge — the old tri-colour infinity ribbon is retired
 * (user decision, msg#30). Every surface that rendered QuantrinityMark now
 * shows THE official QuantMail logo: fire-gradient tile, twin-peak envelope,
 * blinking happy eyes. Component name + props are kept so existing imports
 * keep working without churn.
 */
export function QuantrinityMark({
  className = '',
  compact = false,
  label = 'QuantMail',
}: QuantrinityMarkProps) {
  return (
    // The mark is decoration with a brand name, not a control: it sits on the
    // invite landing page beside its own heading, and as a live logo a click
    // pushed `/` — which for a signed-out invitee bounces straight to /login.
    // `role="img"` gives the name without inventing a button.
    <span
      role="img"
      aria-label={label}
      className={'quantrinity-mark is-quantmail ' + (compact ? 'is-compact ' : '') + className}
    >
      <QuantMailLogo size={compact ? 28 : 56} interactive={false} />
    </span>
  );
}
