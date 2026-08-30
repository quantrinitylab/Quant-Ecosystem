'use client';

/**
 * Quanty — the QuantAI mascot (v2 — realistic 2.5D).
 *
 * One face for every AI surface in the Quant ecosystem (QuantMail copilot,
 * CodeHub coding chat, QuantChat, future apps). Pure SVG + CSS — no runtime
 * dependencies, no hooks, safe to render anywhere at any size.
 *
 * v2 realism: layered shell shading (radial core + bottom-right ambient
 * occlusion), helmet specular gloss, glass sheen + rim light on the screen,
 * metallic ear pods, teal button with highlight, and a grounded contact
 * shadow that "breathes" in sync with the float animation.
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
  /** Gentle floating animation (with breathing ground shadow). */
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
          <path
            d="M73 112 Q95 136 117 112"
            stroke={LED}
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M143 112 Q165 136 187 112"
            stroke={LED}
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case 'wink':
      return (
        <g filter={GLOW}>
          <ellipse cx="95" cy="118" rx="24" ry="20" fill={LED} transform="rotate(-8 95 118)" />
          <path
            d="M184 103 Q166 118 184 133"
            stroke={LED}
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
          />
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
          <path
            d="M73 126 Q95 105 117 126"
            stroke={LED}
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M143 126 Q165 105 187 126"
            stroke={LED}
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case 'cry':
      return (
        <g filter={GLOW}>
          <path
            d="M75 122 Q95 104 115 122"
            stroke={LED}
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M145 122 Q165 104 185 122"
            stroke={LED}
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
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
      {/* The animation lives in globals.css, not in here. An SVG-namespaced
       * <style> is not hidden the way an HTML one is, so the rules counted as this
       * element's text: a button wrapping Quanty read out its whole stylesheet
       * before its label, and every instance repeated the rules into the DOM. */}
      <defs>
        <radialGradient id="qtyShell" cx="0.34" cy="0.24" r="1.15">
          <stop offset="0" stopColor="#fffef9" />
          <stop offset="0.4" stopColor="#f6f0e2" />
          <stop offset="0.75" stopColor="#e2d9c4" />
          <stop offset="1" stopColor="#c9bda1" />
        </radialGradient>
        <linearGradient id="qtyGloss" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="qtyScreen" cx="0.36" cy="0.28" r="1.05">
          <stop offset="0" stopColor="#33406f" />
          <stop offset="0.5" stopColor="#161d3f" />
          <stop offset="0.85" stopColor="#0a0e26" />
          <stop offset="1" stopColor="#070a1c" />
        </radialGradient>
        <linearGradient id="qtyTeal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fe3d0" />
          <stop offset="0.55" stopColor="#2cc4b2" />
          <stop offset="1" stopColor="#178f84" />
        </linearGradient>
        <linearGradient id="qtyPod" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a3040" />
          <stop offset="0.5" stopColor="#171b28" />
          <stop offset="1" stopColor="#0d101b" />
        </linearGradient>
        <radialGradient id="qtyShadowG" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" stopOpacity="0.38" />
          <stop offset="0.7" stopColor="#000000" stopOpacity="0.16" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
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

      {/* Grounded contact shadow — breathes while Quanty floats */}
      <ellipse
        cx="130"
        cy="212"
        rx="64"
        ry="7"
        fill="url(#qtyShadowG)"
        className={bob ? 'qty-shadow qty-shadow-pulse' : 'qty-shadow'}
      />

      {/* Ear pods — brushed metal with glowing stripe */}
      <g>
        <rect x="2" y="86" width="30" height="60" rx="14" fill="url(#qtyPod)" />
        <rect
          x="2"
          y="86"
          width="30"
          height="60"
          rx="14"
          fill="none"
          stroke="#000000"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <rect x="6" y="90" width="10" height="14" rx="5" fill="#ffffff" opacity="0.08" />
        <rect
          x="13"
          y="93"
          width="7"
          height="46"
          rx="3.5"
          fill="#2fe1e9"
          className="qty-earglow"
          filter={GLOW}
        />
      </g>
      <g>
        <rect x="228" y="86" width="30" height="60" rx="14" fill="url(#qtyPod)" />
        <rect
          x="228"
          y="86"
          width="30"
          height="60"
          rx="14"
          fill="none"
          stroke="#000000"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <rect x="232" y="90" width="10" height="14" rx="5" fill="#ffffff" opacity="0.08" />
        <rect
          x="240"
          y="93"
          width="7"
          height="46"
          rx="3.5"
          fill="#2fe1e9"
          className="qty-earglow"
          filter={GLOW}
        />
      </g>

      {/* Helmet shell — ambient-occlusion base + lit shell offset up-left */}
      <ellipse cx="130" cy="114" rx="96" ry="89" fill="#bfb296" />
      <ellipse cx="127" cy="110" rx="94" ry="87" fill="url(#qtyShell)" />
      <ellipse
        cx="130"
        cy="114"
        rx="96"
        ry="89"
        fill="none"
        stroke="#b3a687"
        strokeWidth="1.6"
        opacity="0.8"
      />
      {/* Left rim light */}
      <path
        d="M46 74 Q38 108 48 142"
        stroke="#ffffff"
        strokeWidth="3"
        opacity="0.35"
        fill="none"
        strokeLinecap="round"
      />
      {/* Specular gloss sweep across the helmet top */}
      <path
        d="M58 62 Q112 20 188 46 Q150 30 104 38 Q72 48 58 62 Z"
        fill="url(#qtyGloss)"
        opacity="0.55"
      />

      {/* Top button with highlight */}
      <rect x="117" y="11" width="26" height="16" rx="8" fill="url(#qtyTeal)" />
      <rect
        x="117"
        y="11"
        width="26"
        height="16"
        rx="8"
        fill="none"
        stroke="#0c6b61"
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      <ellipse cx="126" cy="15.5" rx="6" ry="2.6" fill="#ffffff" opacity="0.5" />

      {/* Face screen — deep glass with rim light + sheen */}
      <ellipse
        cx="130"
        cy="120"
        rx="75"
        ry="69"
        fill="url(#qtyScreen)"
        stroke="#080b1a"
        strokeWidth="5"
      />
      <ellipse
        cx="130"
        cy="120"
        rx="71"
        ry="65"
        fill="none"
        stroke="#4a5b9e"
        strokeWidth="1.4"
        opacity="0.4"
      />
      <ellipse
        cx="102"
        cy="83"
        rx="44"
        ry="19"
        fill="#ffffff"
        className="qty-sheen"
        opacity="0.10"
        transform="rotate(-16 102 83)"
      />
      <circle cx="84" cy="75" r="6.5" fill="#ffffff" opacity="0.18" />
      <path
        d="M76 172 Q130 190 184 172"
        stroke="#31cfe8"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.07"
        fill="none"
      />

      <Eyes expression={expression} />
    </svg>
  );
}

export default Quanty;
