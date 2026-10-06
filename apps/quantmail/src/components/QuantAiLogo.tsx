interface QuantAiLogoProps {
  size?: number;
  /** When true, the ring spins/pulses faster to signal active inference. */
  thinking?: boolean;
  className?: string;
}

/**
 * Official Quant AI mark — white melting-ghost face in a purple neon ring,
 * recreated as SVG from the founder's artwork so every part can animate:
 * gentle float, ring glow pulse, eye blink, and a faster thinking state.
 * Pure transform/opacity animation; honors prefers-reduced-motion.
 */
export function QuantAiLogo({ size = 40, thinking = false, className = '' }: QuantAiLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Quant AI"
      className={`qai-logo ${thinking ? 'qai-thinking' : ''} ${className}`.trim()}
    >
      {/* neon ring */}
      <g className="qai-ring" aria-hidden="true">
        <circle cx="100" cy="100" r="84" fill="none" stroke="#2a1650" strokeWidth="15" />
        <circle cx="100" cy="100" r="84" fill="none" stroke="#a855f7" strokeWidth="7" />
        <circle
          className="qai-think-arc"
          cx="100"
          cy="100"
          r="84"
          fill="none"
          stroke="#e9d5ff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="46 482"
        />
      </g>
      {/* ghost body */}
      <g className="qai-ghost" aria-hidden="true">
        <path
          d="M52 132 L52 100 C52 62 72 34 100 34 C128 34 148 62 148 100 L148 132
             C148 140 140 142 136 136 C132 130 128 130 126 138 C124 150 118 158 110 158
             C102 158 100 148 94 148 C88 148 86 158 78 158 C70 158 66 148 62 140
             C59 134 55 134 52 140 C50 143 52 136 52 132 Z"
          fill="#ffffff"
        />
        {/* eyes */}
        <g className="qai-eyes" fill="#170a2e">
          <ellipse cx="79" cy="92" rx="12" ry="20" />
          <ellipse cx="121" cy="92" rx="12" ry="20" />
        </g>
        {/* drip dots along the melt line */}
        <circle cx="66" cy="164" r="5" fill="#ffffff" />
        <circle cx="134" cy="164" r="5" fill="#ffffff" />
      </g>
    </svg>
  );
}
