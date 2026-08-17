'use client';

import { useId } from 'react';

export type QuantMailLogoProps = {
  /** Rendered square size in px. */
  size?: number;
  /** Eyes blink periodically (default true). */
  blink?: boolean;
  /** Soft light sweep across the tile (default true). */
  shine?: boolean;
  className?: string;
  title?: string;
};

/**
 * QuantMail brand mark — THE official logo (user-approved reference art):
 * a dark rounded tile with flowing orange→red→amber energy, a white
 * twin-peak envelope, and two happy eyes that blink.
 *
 * Pure SVG + CSS (no image assets) so it stays crisp at every size,
 * with a soft 3D treatment: warm drop shadow, gloss and a light sweep.
 * Keep this exactly on-model — do NOT restyle the tile or the envelope.
 */
export function QuantMailLogo({
  size = 40,
  blink = true,
  shine = true,
  className = '',
  title = 'QuantMail',
}: QuantMailLogoProps) {
  const uid = useId().replace(/:/g, '');
  const tileClip = uid + '-clip';
  const fireTop = uid + '-fire-top';
  const fireLeft = uid + '-fire-left';
  const fireAmber = uid + '-fire-amber';
  const fireRight = uid + '-fire-right';
  const glossGrad = uid + '-gloss';
  const paperGrad = uid + '-paper';
  const blobBlur = uid + '-blur';
  const envShadow = uid + '-env-shadow';

  const classes = ['qml-logo'];
  if (blink) classes.push('qml-blink');
  if (shine) classes.push('qml-shine');
  if (className) classes.push(className);

  return (
    <span
      className={classes.join(' ')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title}
      title={title}
    >
      <svg viewBox="0 0 128 128" fill="none" aria-hidden="true">
        <defs>
          <clipPath id={tileClip}>
            <rect x="4" y="4" width="120" height="120" rx="30" />
          </clipPath>
          <radialGradient
            id={fireTop}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(74 2) scale(74 52)"
          >
            <stop stopColor="#ff7a1a" />
            <stop offset="0.55" stopColor="#e01313" stopOpacity="0.9" />
            <stop offset="1" stopColor="#e01313" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={fireLeft}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(4 54) scale(46 58)"
          >
            <stop stopColor="#e21212" stopOpacity="0.85" />
            <stop offset="1" stopColor="#e21212" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={fireAmber}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(24 120) scale(74 62)"
          >
            <stop stopColor="#ffc21a" />
            <stop offset="0.45" stopColor="#ff8a00" stopOpacity="0.92" />
            <stop offset="1" stopColor="#ff6a00" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={fireRight}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(120 112) scale(54 50)"
          >
            <stop stopColor="#ff3d00" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ff3d00" stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={glossGrad}
            x1="18"
            y1="6"
            x2="70"
            y2="70"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={paperGrad}
            x1="64"
            y1="36"
            x2="64"
            y2="96"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#f1ece1" />
          </linearGradient>
          <filter id={blobBlur} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id={envShadow} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="3"
              stdDeviation="3.4"
              floodColor="#3d0a00"
              floodOpacity="0.55"
            />
          </filter>
        </defs>

        {/* Tile base */}
        <rect x="4" y="4" width="120" height="120" rx="30" fill="#0b0503" />

        {/* Flowing fire gradient (clipped to tile) */}
        <g clipPath={'url(#' + tileClip + ')'}>
          <g filter={'url(#' + blobBlur + ')'}>
            <ellipse cx="74" cy="2" rx="74" ry="52" fill={'url(#' + fireTop + ')'} />
            <ellipse cx="4" cy="54" rx="46" ry="58" fill={'url(#' + fireLeft + ')'} />
            <ellipse cx="24" cy="120" rx="74" ry="62" fill={'url(#' + fireAmber + ')'} />
            <ellipse cx="120" cy="112" rx="54" ry="50" fill={'url(#' + fireRight + ')'} />
          </g>
          {/* gloss + moving light sweep for the 3D feel */}
          <rect x="4" y="4" width="120" height="62" rx="30" fill={'url(#' + glossGrad + ')'} />
          <rect
            className="qml-sweep"
            x="34"
            y="-20"
            width="26"
            height="168"
            rx="13"
            fill="#ffffff"
            opacity="0.09"
            transform="rotate(14 64 64)"
          />
        </g>

        {/* Inner rim light */}
        <rect
          x="5.2"
          y="5.2"
          width="117.6"
          height="117.6"
          rx="28.8"
          stroke="#ffffff"
          strokeOpacity="0.1"
          strokeWidth="2"
        />

        {/* Twin-peak envelope */}
        <g filter={'url(#' + envShadow + ')'}>
          <path
            d="M35 40 L60 62 Q64 65.4 68 62 L93 40 Q97.5 36.5 97.5 42.5 L97.5 84 Q97.5 94.5 87 94.5 L41 94.5 Q30.5 94.5 30.5 84 L30.5 42.5 Q30.5 36.5 35 40 Z"
            fill={'url(#' + paperGrad + ')'}
            stroke={'url(#' + paperGrad + ')'}
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>

        {/* Happy eyes (blink) */}
        <g className="qml-eye">
          <path
            d="M46.5 76.5 Q53 83.5 59.5 76.5"
            stroke="#0b0503"
            strokeWidth="5.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
        <g className="qml-eye">
          <path
            d="M68.5 76.5 Q75 83.5 81.5 76.5"
            stroke="#0b0503"
            strokeWidth="5.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>
      <style>{logoCss}</style>
    </span>
  );
}

const logoCss = `
.qml-logo{position:relative;display:inline-flex;flex:none;line-height:0;filter:drop-shadow(0 5px 12px rgba(255,106,0,0.25));}
.qml-logo svg{width:100%;height:100%;display:block;}
.qml-logo .qml-eye{transform-box:fill-box;transform-origin:50% 50%;}
.qml-blink .qml-eye{animation:qml-eye-blink 5.4s ease-in-out infinite;}
.qml-logo .qml-sweep{transform-box:fill-box;transform-origin:50% 50%;}
.qml-shine .qml-sweep{animation:qml-sweep-move 6.2s ease-in-out infinite;}
@keyframes qml-eye-blink{0%,90%,100%{transform:scaleY(1);}93%{transform:scaleY(0.14);}96%{transform:scaleY(1);}}
@keyframes qml-sweep-move{0%,100%{transform:translateX(-42px);}50%{transform:translateX(42px);}}
@media (prefers-reduced-motion: reduce){.qml-blink .qml-eye,.qml-shine .qml-sweep{animation:none;}}
`;

export default QuantMailLogo;
