'use client';

/**
 * The graphite material, as SVG — the twin of `lib/marks/material.glsl.ts`.
 *
 * WHY THIS EXISTS AT ALL. The WebGL tier is the hero tier and nothing else: it
 * cannot be a favicon, it cannot go in an email, it cannot be printed, it must
 * not run under `prefers-reduced-motion`, and at 16px it would burn a GPU
 * context to draw forty pixels. So every mark ships twice, and this is the half
 * that does the actual work in the product.
 *
 * WHY IT IS NOT A DOWNGRADE. Choosing "machined graphite + molten core" over the
 * reference sheet's glossy candy-3D was partly *this*: the material reduces to
 * flat dark plus a glowing path, which SVG expresses exactly. Nothing is
 * approximated here — the body gradient, the milled channel's wall colour, the
 * ember floor and the bevel highlight are the same six tokens the shader uses.
 * A candy-3D mark has no such reduction, and would have needed a PNG.
 *
 * WHY THE CHANNEL IS TWO STROKES. A single ember stroke is a line drawn *on* the
 * plate. The wall stroke underneath it is the cut, and the ember stroke is the
 * lit floor of that cut — so the accent is structural in both tiers, and the
 * dark halo it creates is what keeps the ember legible at 16px against a card,
 * a white email background, or a browser tab.
 */

import { useId, type ReactNode } from 'react';
import { SQUIRCLE } from '../AppMark';

export type GraphiteMarkProps = {
  size?: number;
  className?: string;
  title?: string;
  /** `false` renders the same glyph with no wrapper shadow — for favicons. */
  shadow?: boolean;
};

/** The channel's two layers, handed to the mark so it declares its path once. */
export type ChannelPaint = {
  /** The milled wall: `#2B1A11`. Stroke the channel with this first, wider. */
  wall: string;
  /** `url(#…)` of the ember floor gradient. Stroke on top, narrower. */
  ember: string;
  /** Half-lit wall, for a pocket that should not read as fully hot. */
  wallLit: string;
};

type Props = GraphiteMarkProps & {
  /**
   * `false` drops the graphite body and the bevel and renders the channel
   * network alone. That is the favicon tier — see `markMetrics` for why a plate
   * is the wrong thing to draw below 24px.
   */
  plate?: boolean;
  children: (paint: ChannelPaint) => ReactNode;
};

/**
 * THE TWO TIERS HAVE TO BE THE SAME SIZE, and they were not.
 *
 * Solve the hero's on-screen size rather than eyeballing it. Its shifted-ortho
 * camera puts the eye at z = 2.2 and the plate's front face at z = 0.155, and the
 * ray spread of 0.052 magnifies by 1 + 2.045 * 0.052 = 1.106 at that depth. The
 * family's default yaw of -0.22 rad foreshortens x by cos(0.22) = 0.976. So the
 * plate's projected half-width is 0.62 * 0.976 / 1.106 = 0.547 of a world unit,
 * and against a canvas half-height of VIEW_H / 2 = 0.667 that is 82% of the box.
 *
 * This SVG's squircle spans 29.5 of 32, i.e. 92%. At the same nominal `size` the
 * twin's plate was therefore 12% larger than the hero's, and any surface that
 * swaps one for the other — a reduced-motion user, a failed context, an email —
 * would have shown the mark visibly jump.
 *
 * So the plate tier is drawn into a padded box: 29.5 / 0.82 = 35.98 units, with
 * the 32-unit drawing centred in it. The favicon tier keeps the tight box, on
 * purpose — it has no plate, no shadow to make room for, and at 16px every pixel
 * of the box is worth more than agreement with a tier that is not on screen.
 */
const PLATE_VIEWBOX = '-1.99 -1.99 35.98 35.98';
const GLYPH_VIEWBOX = '0 0 32 32';

export function GraphiteMark({
  size = 32,
  className = '',
  title = 'Quant',
  shadow = true,
  plate = true,
  children,
}: Props) {
  // Two instances of one mark in a document collided when ids were hardcoded —
  // the second resolved its gradients against the first's `<defs>`.
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  const bodyId = `qg-body-${uid}`;
  const emberId = `qg-ember-${uid}`;
  const rimId = `qg-rim-${uid}`;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${
        // No contact shadow under the plate-less tier: there is no object there
        // to cast one, and a 6px blur under a 16px glyph is just mud.
        shadow && plate ? 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title}
    >
      <svg
        viewBox={plate ? PLATE_VIEWBOX : GLYPH_VIEWBOX}
        width={size}
        height={size}
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {plate && (
            <>
              {/* Raking light: the body is lit at the top-left corner and falls to
                  near-black at the bottom-right, which is the shader's key
                  direction flattened to two stops plus a midpoint. Both ends are
                  the material's own token pair — `#1A1D23` down to `#0D0F13` —
                  because the hero's `base` mixes between exactly those two, and a
                  lighter top stop is how the first draft of this twin ended up
                  looking like a different, greyer object beside the hero. */}
              <linearGradient
                id={bodyId}
                x1="3"
                y1="2"
                x2="29"
                y2="30"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#1A1D23" />
                <stop offset="0.46" stopColor="#13161B" />
                <stop offset="1" stopColor="#0D0F13" />
              </linearGradient>
              {/* The bevel. `#F5F5F5` at 22% is the shader's one white — the
                  specular pin that tells the eye the edge is hard, not blurred. */}
              <linearGradient
                id={rimId}
                x1="16"
                y1="1.25"
                x2="16"
                y2="19"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#F5F5F5" stopOpacity="0.22" />
                <stop offset="1" stopColor="#F5F5F5" stopOpacity="0" />
              </linearGradient>
            </>
          )}
          {/* The ember floor. Hotter where the shader's `hot` is 1 — top of the
              graph — so the two tiers agree about which end is the live one. */}
          <linearGradient
            id={emberId}
            x1="10"
            y1="8"
            x2="22"
            y2="24"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF9B5A" />
            <stop offset="1" stopColor="#FF8C42" />
          </linearGradient>
        </defs>

        {plate && <path d={SQUIRCLE} fill={`url(#${bodyId})`} />}
        {children({ wall: '#2B1A11', wallLit: '#5C3016', ember: `url(#${emberId})` })}
        {/* Bezel last, over the channel lip, as on a real milled part. */}
        {plate && <path d={SQUIRCLE} stroke={`url(#${rimId})`} strokeWidth="1" />}
      </svg>
    </span>
  );
}

/**
 * OPTICAL SIZING, not one drawing scaled three ways.
 *
 * The numbers below are measured off the shader, not guessed. At the family's
 * default 10% ember ratio `channelHalf()` is 0.0544 object units and
 * `emberHalf()` is 0.0211; the plate half-extent is 0.62 object units and this
 * box's squircle half-extent is 14.75, so one object unit is 23.79 units here.
 * That makes the cut 2.59 units wide with a 1.00-unit filament of heat on its
 * floor, and commit pockets of radius 2.20 lit to radius 1.41.
 *
 * At 96px that is a 6.9px groove with a 2.7px filament and the twin matches the
 * hero exactly. At 16px the filament is 0.5px and disappears. So the twin is
 * drawn three ways, which is what every real icon family does:
 *
 *   ≥ 44px  literal — the same proportions as the raymarched hero
 *   24–43px compact — the filament is thickened ~1.7x to survive the pixel grid
 *   < 24px  glyph — no plate at all
 *
 * The last tier is the interesting one. Below 24px nothing of the *material*
 * survives — a graphite plate is a dark square, and a dark square on a dark
 * browser tab is nothing. What survives is the *shape*, so the plate is dropped,
 * the graph is scaled up to fill the box it no longer shares with a plate, and
 * it is drawn in ember alone. That is a deliberate trade: the favicon keeps the
 * identity and gives up the material, rather than keeping the material and
 * giving up being visible.
 *
 * The graph's own bounding box is 10.94 x 15.56 units, centred on (16, 16). With
 * a node radius of 3.0 the outer extent is 10.78 from the centre, so 1.45x is the
 * most it scales before the caps clip the box. Stroke widths in the glyph row are
 * therefore pre-transform: 2.6 x 1.45 is the 3.77 the eye actually gets, which is
 * 1.9px of ember at 16px.
 */
type Metrics = {
  plate: boolean;
  wall: number;
  floor: number;
  nodeWall: number;
  nodeEmber: number;
  /** Uniform scale about the box centre. Strokes scale with it. */
  scale: number;
};

export function markMetrics(size: number): Metrics {
  if (size < 24) {
    return { plate: false, wall: 0, floor: 2.6, nodeWall: 0, nodeEmber: 3.0, scale: 1.45 };
  }
  if (size < 44) {
    // Compact is the one tier that is deliberately not literal. The padded plate
    // box costs 11% of the drawing's on-screen scale, so a literal 1.0-unit
    // filament is 0.9px at 32px and dies; these numbers put ~1.8px of ember back.
    return { plate: true, wall: 3.1, floor: 2.0, nodeWall: 2.7, nodeEmber: 2.2, scale: 1 };
  }
  return { plate: true, wall: 2.59, floor: 1.0, nodeWall: 2.2, nodeEmber: 1.41, scale: 1 };
}

/**
 * The trunk, then the branch — one `d`, stroked twice.
 *
 * The branch is two segments through the elbow at (16,16) rather than the cubic
 * this used to be, because the shader's branch is two segments through that same
 * point and `strokeLinejoin="round"` rounds the corner by half the stroke width,
 * which is within a quarter-unit of the shader's `sminK` radius. A cubic was a
 * different curve that merely looked similar.
 */
const GRAPH_PATH = 'M10.53 8.22V23.78M10.53 13.55L16 16L21.47 18.93';

/** The three commits, at the coordinates `quantgit.glsl.ts` maps into the SDF. */
const COMMITS = [
  { cx: 10.53, cy: 8.22 },
  { cx: 10.53, cy: 23.78 },
  { cx: 21.47, cy: 18.93 },
] as const;

/**
 * QuantGit's twin. The same five points as `quantgit.glsl.ts` — a trunk, one
 * branch, three commits — in the 32x32 box they were mapped from, so the hero
 * and the favicon are provably the same mark rather than two similar drawings.
 */
export function QuantGitGraphiteMark({ size = 32, ...rest }: GraphiteMarkProps) {
  const m = markMetrics(size);
  return (
    <GraphiteMark size={size} title="QuantGit" plate={m.plate} {...rest}>
      {({ wall, wallLit, ember }) => (
        <g
          transform={
            m.scale === 1 ? undefined : `translate(16 16) scale(${m.scale}) translate(-16 -16)`
          }
        >
          {m.plate && (
            <>
              {/* The cut, then its lit floor. One `d` for both, so the groove and
                  the light inside it cannot drift apart. */}
              <path
                d={GRAPH_PATH}
                stroke={wall}
                strokeWidth={m.wall}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {COMMITS.map((node) => (
                <circle
                  key={node.cx + node.cy}
                  cx={node.cx}
                  cy={node.cy}
                  r={m.nodeWall}
                  fill={wall}
                />
              ))}
              {COMMITS.map((node) => (
                <circle
                  key={`rim-${node.cx + node.cy}`}
                  cx={node.cx}
                  cy={node.cy}
                  r={m.nodeWall}
                  stroke={wallLit}
                  strokeWidth="0.5"
                />
              ))}
            </>
          )}
          <path
            d={GRAPH_PATH}
            stroke={ember}
            strokeWidth={m.floor}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {COMMITS.map((node) => (
            <circle
              key={`hot-${node.cx + node.cy}`}
              cx={node.cx}
              cy={node.cy}
              r={m.nodeEmber}
              fill={ember}
            />
          ))}
        </g>
      )}
    </GraphiteMark>
  );
}

export default GraphiteMark;
