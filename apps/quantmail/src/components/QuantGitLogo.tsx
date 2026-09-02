'use client';

import { useCallback } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  markSquirclePath,
  paintCornerNotch,
  paintGlossSweep,
  paintObsidianPlate,
  paintSideWall,
  strokeIridescentBezel,
} from '../lib/marks/canvas-mark';

/**
 * QuantGit's mark — Git's rotated diamond in ember, sitting on the family's *obsidian*
 * plate under an iridescent chrome ring.
 *
 * This is the one mark in the set whose reference sheet is dark rather than orange
 * (reference ⑤: "near-black squircle, iridescent chrome ring, notched light shape top
 * right"), and that is a feature: a suite where every icon is an orange square is a
 * swatch book. Mail, Calendar, Contacts and Drive are ember; QuantGit and Quanty are
 * graphite. Same silhouette, same 45/22 squircle, same buffer — different material, the
 * way a product line ships a graphite model beside the orange one.
 *
 * Inside it is Git's own geometry, not a paraphrase of it: the rotated square and the
 * branch graph that peels off the trunk. I had objected to using another project's mark
 * and was overruled, so it is drawn properly rather than hedged into an unrecognisable
 * "inspired by" shape — a version-control app that draws its own private symbol teaches
 * the user nothing.
 *
 * The animation is the product, not decoration on it: a commit travels up the trunk and
 * out along the branch, and hover pushes it faster. Everything else — the plate's two
 * moving passes, the ring's rotating iridescence, the specular chip on the corner — is
 * material, and material is what the family shares.
 */

/** Half-side of Git's square in its own 45°-rotated frame. Half-diagonal ≈ 31. */
const DIAMOND_HALF = 22;
const DIAMOND_R = 6;

/**
 * The graph, expressed in the *diamond's* frame and converted once.
 *
 * This has to be derived rather than eyeballed, and the first pass proves it: I placed the
 * trunk at (31,69)→(69,31) in plate coordinates because that looked like Git's diagonal,
 * and both end nodes were clipped away. A square rotated 45° reaches 31 units from centre
 * along the *plate axes* — its corners — but only 22 along the 45° diagonals, which is
 * exactly where a diagonal trunk runs. So the graph is laid out in `(u, v)` on the square
 * itself, where the walls are honestly at ±22, and `toPlate` rotates it. `-v` is up-and-
 * right in plate space, so the trunk runs the way Git's does, and `u` is the perpendicular
 * the branch peels along.
 */
const D = Math.SQRT1_2;
const toPlate = (u: number, v: number) => ({ x: 50 + D * (u - v), y: 50 + D * (u + v) });

/**
 * Trunk, offset +5 across the tile so the branch has room on its upper-left side, and
 * ±12 long rather than ±16.
 *
 * The first length was wrong for the size that matters. 32 units of trunk plus a 5.4
 * node halo at each end is 42.8 of the tile's 44, so the ink ran to the tile's own edges
 * and at 36px the mark read as an orange diamond with a white smudge in it — no ember
 * between the graph and the edge for the eye to resolve the shape against. Git's own
 * logo carries generous margin for exactly this reason. At ±12 the graph spans 36.8 and
 * leaves ~5 units of ember at each end, which is what makes it legible in a sidebar.
 */
const TRUNK_A = toPlate(5, 12);
const TRUNK_B = toPlate(5, -12);
/** The branch leaves the trunk tangentially at `PEEL`, turns about `FORK`, ends at `LEAF`. */
const PEEL = toPlate(5, 1);
const FORK = toPlate(5, -5);
const LEAF = toPlate(-9, -5);

/**
 * Git's square, rotated 45° about the plate centre.
 *
 * The transform is pushed and popped *inside* the builder on purpose. Canvas stores path
 * points in device space as they are added, so the rotation is baked into the geometry
 * and `restore()` leaves the caller's transform — and therefore any gradient it goes on
 * to build — in plain plate coordinates. That is what lets `paintSideWall` extrude a
 * rotated shape with an upright light ramp.
 */
function diamondPath(ctx: CanvasRenderingContext2D, half = DIAMOND_HALF): void {
  ctx.save();
  ctx.translate(50, 50);
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.roundRect(-half, -half, half * 2, half * 2, DIAMOND_R);
  ctx.restore();
}

/** Trunk and branch as one stroked path, so one `stroke()` lights them identically. */
function graphPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(TRUNK_A.x, TRUNK_A.y);
  ctx.lineTo(TRUNK_B.x, TRUNK_B.y);
  ctx.moveTo(PEEL.x, PEEL.y);
  ctx.quadraticCurveTo(FORK.x, FORK.y, LEAF.x, LEAF.y);
}

/** The three commits. Solid, and larger than the line, the way Git draws them. */
const NODES = [TRUNK_A, TRUNK_B, LEAF] as const;

export function QuantGitLogo({ size = 32, className = '', title = 'QuantGit' }: QuantLogoProps) {
  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const t = reduced ? 0 : time;
      const breathe = reduced ? 0 : Math.sin(t * 0.55);

      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();
      paintObsidianPlate(ctx, cx, cy, t, tiltX, tiltY);

      // Warmth pooling behind the diamond on hover. On the ember marks this is a glow on
      // orange and barely registers; on obsidian it is the whole room lighting up.
      if (hover > 0.01) {
        const glow = ctx.createRadialGradient(50, 52, 4, 50, 52, 44);
        glow.addColorStop(0, `rgba(255, 168, 96, ${0.3 * hover})`);
        glow.addColorStop(1, 'rgba(255, 140, 66, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 45, cy - 45, 90, 90);
      }

      // Reference ⑤'s notched light on the plate's own top-right corner. It belongs to the
      // plate, not the tile, so it is painted before the group transform and does not
      // parallax with the diamond — a specular from a fixed light is exactly what tells the
      // eye the box is a solid while the ring's colours travel.
      paintCornerNotch(ctx, cx, cy, 0.72);

      // ---- the diamond: one transform, so the whole badge parallaxes as a unit ----
      const lift = hover * 1.5 - press * 1;
      ctx.translate(cx + tiltX * 2.8, cy + tiltY * 2.8 - lift);
      const scale = 1 + breathe * 0.005 + hover * 0.02 - press * 0.034;
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // Its thickness. Warm-dark, because what lights the underside of an ember tile on a
      // black plate is the tile itself.
      paintSideWall(ctx, diamondPath, 3 - press * 2.2, '#7A3A12', '#25120A', 19, 81);

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
      ctx.shadowBlur = 7 + hover * 4;
      ctx.shadowOffsetY = 2.6 + hover * 1.4;
      diamondPath(ctx);
      const tile = ctx.createLinearGradient(24, 24, 76, 76);
      tile.addColorStop(0, '#FFC493');
      tile.addColorStop(0.42, '#FF8C42');
      tile.addColorStop(0.76, '#E8752F');
      tile.addColorStop(1, '#B9550F');
      ctx.fillStyle = tile;
      ctx.fill();
      ctx.restore();

      // Everything printed on the tile is clipped to it.
      ctx.save();
      diamondPath(ctx);
      ctx.clip();

      // Shade pooled in the lower-right half of the tile, so it domes.
      const dome = ctx.createLinearGradient(50, 22, 50, 78);
      dome.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
      dome.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
      dome.addColorStop(1, 'rgba(88, 30, 4, 0.34)');
      ctx.fillStyle = dome;
      ctx.fillRect(16, 16, 68, 68);

      // ---- the graph ----
      // Drawn twice: a dark under-stroke slightly heavier than the white one, so the
      // white never sits directly on ember. Two light values touching read as a smear at
      // 24px however clean the geometry is — the same law that decided the calendar's
      // back sheet — and a dark seam is also what a real inlay has.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      graphPath(ctx);
      ctx.lineWidth = 6.2;
      ctx.strokeStyle = 'rgba(74, 26, 4, 0.5)';
      ctx.stroke();

      graphPath(ctx);
      ctx.lineWidth = 4;
      const ink = ctx.createLinearGradient(28, 28, 72, 72);
      ink.addColorStop(0, '#FFFFFF');
      ink.addColorStop(0.55, '#FFF6EC');
      ink.addColorStop(1, '#F0DCCA');
      ctx.strokeStyle = ink;
      ctx.stroke();

      // The dark seam is 1.1 units on each side of the line, so the nodes carry the same
      // 1.2 rather than the 0.4 they had — a node whose halo is thinner than the line it
      // sits on is a bead threaded onto it, not a commit on a branch.
      for (const n of NODES) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 5.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(74, 26, 4, 0.5)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
      }

      // A commit travelling the graph: a narrow white window sliding along the *trunk's*
      // axis, stroked over the ink. It lights the branch exactly when it reaches the fork,
      // because the branch's projection onto that axis is where the fork is — which is the
      // difference between an animation about version control and a light that wanders
      // around the tile.
      const march = 0.001 + (reduced ? 0.5 : (t * 0.15 + hover * 0.6) % 1) * 0.998;
      graphPath(ctx);
      ctx.lineWidth = 4;
      const pulse = ctx.createLinearGradient(TRUNK_A.x, TRUNK_A.y, TRUNK_B.x, TRUNK_B.y);
      const lo = Math.max(0, march - 0.15);
      const hi = Math.min(1, march + 0.15);
      pulse.addColorStop(0, 'rgba(255, 255, 255, 0)');
      if (lo > 0) pulse.addColorStop(lo, 'rgba(255, 255, 255, 0)');
      pulse.addColorStop(march, 'rgba(255, 255, 255, 0.9)');
      if (hi < 1) pulse.addColorStop(hi, 'rgba(255, 255, 255, 0)');
      pulse.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.strokeStyle = pulse;
      ctx.stroke();

      const sweep = reduced ? 0.34 : (t * 0.07 + hover * 0.5) % 1;
      paintGlossSweep(ctx, 16, 16, 68, 68, sweep, 0.1 + hover * 0.1);
      ctx.restore(); // tile clip

      // The tile's own edge, over the printing: caught light along the top-left pair of
      // sides, falling to a dark seam along the bottom-right pair.
      diamondPath(ctx);
      ctx.lineWidth = 1.1;
      const edge = ctx.createLinearGradient(28, 22, 66, 74);
      edge.addColorStop(0, 'rgba(255, 246, 232, 0.85)');
      edge.addColorStop(0.45, 'rgba(255, 214, 172, 0.26)');
      edge.addColorStop(1, 'rgba(116, 44, 8, 0.5)');
      ctx.strokeStyle = edge;
      ctx.stroke();

      ctx.restore(); // plate clip + group transform

      // The ring last and outside the clip, so it sits over the tile's corners the way
      // `strokeMarkBezel` sits over the ember marks' glyphs. `chrome`, not `spectral`:
      // reference ⑤ says chrome, a saturated rainbow beside three ember plates reads as
      // an RGB gaming bezel, and the spectral finish is Quanty's own signature.
      strokeIridescentBezel(ctx, cx, cy, t, 'chrome');
    },
    [],
  );

  const { canvasRef, pointerProps } = useLiveMark(paint, size);

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`inline-flex shrink-0 select-none items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      {...pointerProps}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        style={{ width: size, height: size }}
      />
    </span>
  );
}

export default QuantGitLogo;
