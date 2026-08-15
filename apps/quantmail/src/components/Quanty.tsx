'use client';

/**
 * Quanty — the QuantAI mascot.
 *
 * One face for every AI surface in the Quant ecosystem (QuantMail copilot,
 * CodeHub coding chat, QuantChat, future apps). Pure SVG + CSS — no runtime
 * dependencies, no hooks, safe to render anywhere at any size.
 *
 * Look: cream helmet shell, dark navy face screen, glowing cyan LED eyes
 * (dot-matrix), teal top button, ear pods with glowing cyan stripes.
 *
 * Expressions: idle (blinks), happy, wink, thinking (eyes scan), sad,
 * cry (animated tears), shock, angry.
 */

export type QuantyExpression =
  | 'idle'
  | 'happy'
  | 'wink'
  | 'thinking'
  | 'sad'
  | 'cry'
  | 'shock'
  | 'angry';

export interface QuantyProps {
  expression?: QuantyExpression;
  /** Rendered width in px — height scales automatically. */
  size?: number;
  /** Gentle floating animation. */
  bob?: boolean;
  className?: string;
  title?: string;
}

const LED = 'url(#qtyLed)';
const GLOW = 'url(#qtyGlow)';

function Eyes({ expression }: { expression: QuantyExpression }) {
  switch (expression) {
    case 'happy':
      return (
        <g filter={GLOW}>
          <path d="M73 112 Q95 136 117 112" stroke={LED} strokeWidth="14" strokeLinecap="round" fill="none" />
          <path d="M143 112 Q165 136 187 112" stroke={LED} strokeWidth="14" strokeLinecap="round" fill="none" />
        </g>
      );
    case 'wink':
      return (
        <g filter={GLOW}>
          <ellipse cx="95" cy="118" rx="24" ry="20" fill={LED} transform="rotate(-8 95 118)" />
          <path d="M184 103 Q166 118 184 133" stroke={LED} strokeWidth="12" strokeLinecap="round" fill="none" />
        </g>
      );
    case 'thinking':
      return (
        <g filter={GLOW} className="qty-look">
          <ellipse cx="95" cy="116" rx="17" ry="21" fill={LED} />
          <ellipse cx="165" cy="116" rx="17" ry="21" fill={LED} />
        </g>
      );
    case 'sad':
      return (
        <g filter={GLOW}>
          <path d="M73 126 Q95 105 117 126" stroke={LED} strokeWidth="14" strokeLinecap="round" fill="none" />
          <path d="M143 126 Q165 105 187 126" stroke={LED} strokeWidth="14" strokeLinecap="round" fill="none" />
        </g>
      );
    case 'cry':
      return (
        <g filter={GLOW}>
          <path d="M75 122 Q95 104 115 122" stroke={LED} strokeWidth="13" strokeLinecap="round" fill="none" />
          <path d="M145 122 Q165 104 185 122" stroke={LED} strokeWidth="13" strokeLinecap="round" fill="none" />
          <g className="qty-tears">
            <rect x="86" y="130" width="15" height="46" rx="7.5" fill={LED} />
            <rect x="159" y="130" width="15" height="46" rx="7.5" fill={LED} />
          </g>
        </g>
      );
    case 'shock':
      return (
        <g filter={GLOW} className="qty-pop">
          <ellipse cx="95" cy="112" rx="25" ry="31" fill={LED} />
          <ellipse cx="165" cy="112" rx="25" ry="31" fill={LED} />
          <ellipse cx="130" cy="163" rx="9" ry="12" fill={LED} />
        </g>
      );
    case 'angry':
      return (
        <g filter={GLOW}>
          <path d="M68 102 Q98 118 122 129 L113 143 Q84 141 70 116 Z" fill={LED} />
          <path d="M192 102 Q162 118 138 129 L147 143 Q176 141 190 116 Z" fill={LED} />
        </g>
      );
    default:
      return (
        <g filter={GLOW} className="qty-blink">
          <ellipse cx="95" cy="118" rx="21" ry="25" fill={LED} />
          <ellipse cx="165" cy="118" rx="21" ry="25" fill={LED} />
        </g>
      );
  }
}

export function Quanty({
  expression = 'idle',
  size = 48,
  bob = false,
  className,
  title = 'Quanty',
}: QuantyProps) {
  const height = Math.round(size * (220 / 260));
  return (
    <svg
      className={['qty-root', bob ? 'qty-bob' : '', className ?? ''].join(' ').trim()}
      width={size}
      height={height}
      viewBox="0 0 260 220"
      role="img"
      aria-label={title}
      data-expression={expression}
    >
      <title>{title}</title>
      <style>{`
        .qty-root { overflow: visible; }
        .qty-bob { animation: qty-bob 4.2s ease-in-out infinite; }
        .qty-blink { transform-origin: 130px 118px; animation: qty-blink 5.2s infinite; }
        .qty-look { animation: qty-look 2.4s ease-in-out infinite; }
        .qty-tears { transform-origin: 130px 132px; animation: qty-tears 1.5s ease-in infinite; }
        .qty-pop { transform-origin: 130px 120px; animation: qty-pop 1.6s ease-in-out infinite; }
        .qty-earglow { animation: qty-earglow 2.8s ease-in-out infinite; }
        @keyframes qty-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes qty-blink { 0%, 91%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.06); } 97% { transform: scaleY(1); } }
        @keyframes qty-look { 0%, 100% { transform: translateX(-7px); } 50% { transform: translateX(7px); } }
        @keyframes qty-tears { 0% { transform: scaleY(0.15); opacity: 0; } 25% { opacity: 1; } 85% { transform: scaleY(1); opacity: 0.9; } 100% { transform: scaleY(1.05); opacity: 0; } }
        @keyframes qty-pop { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes qty-earglow { 0%, 100% { opacity: 0.95; } 50% { opacity: 0.55; } }
        @media (prefers-reduced-motion: reduce) {
          .qty-root, .qty-root * { animation: none !important; }
        }
      `}</style>
      <defs>
        <linearGradient id="qtyShell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdfaf3" />
          <stop offset="0.6" stopColor="#efe9db" />
          <stop offset="1" stopColor="#d8d0be" />
        </linearGradient>
        <radialGradient id="qtyScreen" cx="0.38" cy="0.3" r="1">
          <stop offset="0" stopColor="#2b3560" />
          <stop offset="0.55" stopColor="#141a38" />
          <stop offset="1" stopColor="#0a0d22" />
        </radialGradient>
        <linearGradient id="qtyTeal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fd9c6" />
          <stop offset="1" stopColor="#1fa396" />
        </linearGradient>
        <pattern id="qtyLed" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#31cfe8" />
          <circle cx="3" cy="3" r="2.1" fill="#5fe8ff" />
        </pattern>
        <filter id="qtyGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" result="qb" />
          <feMerge>
            <feMergeNode in="qb" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g>
        <rect x="2" y="86" width="30" height="60" rx="14" fill="#171a23" />
        <rect x="13" y="93" width="7" height="46" rx="3.5" fill="#2fe1e9" className="qty-earglow" filter={GLOW} />
      </g>
      <g>
        <rect x="228" y="86" width="30" height="60" rx="14" fill="#171a23" />
        <rect x="240" y="93" width="7" height="46" rx="3.5" fill="#2fe1e9" className="qty-earglow" filter={GLOW} />
      </g>

      <ellipse cx="130" cy="114" rx="96" ry="89" fill="url(#qtyShell)" />
      <ellipse cx="130" cy="114" rx="96" ry="89" fill="none" stroke="#c9c0ac" strokeWidth="2" opacity="0.7" />
      <rect x="117" y="12" width="26" height="15" rx="7.5" fill="url(#qtyTeal)" />
      <ellipse cx="130" cy="120" rx="75" ry="69" fill="url(#qtyScreen)" stroke="#080b1a" strokeWidth="5" />
      <path d="M70 84 Q104 52 176 62 Q136 48 98 58 Q76 68 70 84 Z" fill="#ffffff" opacity="0.07" />

      <Eyes expression={expression} />
    </svg>
  );
}

export default Quanty;
