'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import { markSquirclePath, strokeMarkBezel } from '../lib/marks/canvas-mark';

/**
 * QuantDrive's official mark — a premium 3D folder mascot with expressive
 * blinking eyes, a pearl cloud-storage motif behind it, and a green-led
 * palette on a dark glass badge.
 *
 * Rendered with the family's shared `useLiveMark` Canvas 2D pipeline (no
 * WebGL/Three.js — the production logo system is Canvas; see marks/useLiveMark).
 * All motion (blink scheduler, success acknowledgement, hover/press response)
 * is driven by the frame's monotonic `time`; per-instance blink state lives in
 * a ref so remounts never duplicate loops, and the shared hook already stops
 * the loop off-screen / on hidden tabs / under reduced motion.
 *
 * Blink: genuine eye-geometry animation (vertical squash of the eye shapes),
 * not face-hiding. Randomised 2.5–6.5s idle interval.
 *
 * Success: listens for the honest `quant:drive:upload-complete` event
 * dispatched by useDrive at the real upload-completion point — a brief happy
 * eye expression. Never fires on failure; the app's own toast carries errors.
 */

/** Honest event fired by useDrive when an upload truly completes. */
export const DRIVE_UPLOAD_COMPLETE_EVENT = 'quant:drive:upload-complete';

interface BlinkState {
  /** Frame-time at which the next blink starts. */
  nextBlinkAt: number;
  /** Frame-time at which the current blink started, or -1. */
  blinkStart: number;
  /** Wall-clock ms of the last confirmed upload (success expression). */
  successAt: number;
}

/** Exported for tests. */
export type { BlinkState };

const BLINK_CLOSE_S = 0.11;
const BLINK_HOLD_S = 0.07;
const BLINK_OPEN_S = 0.14;
const SUCCESS_WINDOW_MS = 1400;

/** Exported for tests: 0 = fully open, 1 = fully closed. */
export function blinkPhase(blink: BlinkState, time: number, reduced: boolean): number {
  if (reduced) return 0;
  if (blink.blinkStart >= 0) {
    const t = time - blink.blinkStart;
    if (t < 0) return 0;
    if (t < BLINK_CLOSE_S) return t / BLINK_CLOSE_S;
    if (t < BLINK_CLOSE_S + BLINK_HOLD_S) return 1;
    if (t < BLINK_CLOSE_S + BLINK_HOLD_S + BLINK_OPEN_S) {
      return 1 - (t - BLINK_CLOSE_S - BLINK_HOLD_S) / BLINK_OPEN_S;
    }
    blink.blinkStart = -1;
    return 0;
  }
  if (time >= blink.nextBlinkAt) {
    blink.blinkStart = time;
    blink.nextBlinkAt = time + BLINK_CLOSE_S + BLINK_HOLD_S + BLINK_OPEN_S + 2.5 + Math.random() * 4;
    return 0;
  }
  return 0;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Pearl cloud silhouette from coordinated rounded lobes, centred at (cx, cy). */
function cloudPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  ctx.beginPath();
  ctx.arc(cx - 16 * s, cy + 4 * s, 11 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(cx - 6 * s, cy - 4 * s, 13 * s, Math.PI * 0.85, Math.PI * 1.95);
  ctx.arc(cx + 8 * s, cy - 6 * s, 12 * s, Math.PI, Math.PI * 2.05);
  ctx.arc(cx + 18 * s, cy + 2 * s, 9 * s, Math.PI * 1.2, Math.PI * 0.4);
  ctx.closePath();
}

export function QuantDriveLogo({
  size = 32,
  className = '',
  title = 'QuantDrive',
}: QuantLogoProps) {
  const blinkRef = useRef<BlinkState>({ nextBlinkAt: 2 + Math.random() * 3, blinkStart: -1, successAt: 0 });

  useEffect(() => {
    const onUploadComplete = () => {
      blinkRef.current.successAt = Date.now();
    };
    window.addEventListener(DRIVE_UPLOAD_COMPLETE_EVENT, onUploadComplete);
    return () => window.removeEventListener(DRIVE_UPLOAD_COMPLETE_EVENT, onUploadComplete);
  }, []);

  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const t = reduced ? 0 : time;
      const blink = blinkRef.current;
      const closed = blinkPhase(blink, time, reduced);
      const openness = 1 - closed;
      const success = !reduced && Date.now() - blink.successAt < SUCCESS_WINDOW_MS;
      const breathe = reduced ? 0 : Math.sin(t * 0.9);

      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();

      // ── 1. Dark glass badge ──────────────────────────────────────────
      const badge = ctx.createLinearGradient(cx - 45, cy - 45, cx + 45, cy + 45);
      badge.addColorStop(0, '#0D1512');
      badge.addColorStop(0.5, '#070B09');
      badge.addColorStop(1, '#0A120E');
      ctx.fillStyle = badge;
      ctx.fillRect(cx - 50, cy - 50, 100, 100);

      // Rim light: cool mint kiss on the top edge
      const rim = ctx.createLinearGradient(cx, cy - 46, cx, cy - 30);
      rim.addColorStop(0, 'rgba(140, 240, 195, 0.35)');
      rim.addColorStop(1, 'rgba(140, 240, 195, 0)');
      ctx.fillStyle = rim;
      ctx.fillRect(cx - 42, cy - 46, 84, 16);

      // ── 2. Shared tilt / float / press transform ─────────────────────
      const lift = hover * 2 - press * 1.4;
      ctx.translate(cx + tiltX * 2.4, cy + tiltY * 2.4 - lift + breathe * 0.7);
      const scale = 1 + breathe * 0.006 + hover * 0.02 - press * 0.035;
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      const ox = cx;
      const oy = cy + 3;

      // ── 3. Pearl cloud (behind folder) ───────────────────────────────
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      cloudPath(ctx, ox, oy - 12, 1);
      const cloudFill = ctx.createLinearGradient(ox - 28, oy - 30, ox + 28, oy + 4);
      cloudFill.addColorStop(0, '#FFFFFF');
      cloudFill.addColorStop(0.4, '#F2FBF6');
      cloudFill.addColorStop(0.75, '#CFEEDD');
      cloudFill.addColorStop(1, '#9ADBB8');
      ctx.fillStyle = cloudFill;
      ctx.fill();
      ctx.restore();

      // Cloud edge light: thin mint stroke on the upper lobes
      cloudPath(ctx, ox, oy - 12, 1);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(190, 245, 215, 0.7)';
      ctx.stroke();

      // ── 4. File edges peeking from behind the folder ─────────────────
      const files: Array<{ x: number; w: number; h: number; c: string; tilt: number }> = [
        { x: -14, w: 16, h: 22, c: '#FEF9EC', tilt: -0.1 },
        { x: -2, w: 16, h: 25, c: '#D9F7E8', tilt: 0.04 },
        { x: 10, w: 15, h: 21, c: '#FEF3C7', tilt: 0.12 },
        { x: 20, w: 13, h: 18, c: '#CFFAFE', tilt: 0.2 },
      ];
      for (const f of files) {
        ctx.save();
        ctx.translate(ox + f.x, oy - 16);
        ctx.rotate(f.tilt);
        roundRect(ctx, -f.w / 2, -f.h / 2, f.w, f.h, 2.5);
        const fg = ctx.createLinearGradient(0, -f.h / 2, 0, f.h / 2);
        fg.addColorStop(0, '#FFFFFF');
        fg.addColorStop(1, f.c);
        ctx.fillStyle = fg;
        ctx.fill();
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = 'rgba(6, 40, 28, 0.35)';
        ctx.stroke();
        ctx.restore();
      }

      // ── 5. Folder body ───────────────────────────────────────────────
      const fw = 56;
      const fh = 38;
      const fx = ox - fw / 2;
      const fy = oy - 8;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 10 + hover * 4;
      ctx.shadowOffsetY = 5;

      // Rear + tab
      const tabGrad = ctx.createLinearGradient(fx, fy - 10, fx, fy + 6);
      tabGrad.addColorStop(0, '#3DDC97');
      tabGrad.addColorStop(1, '#0E9F6E');
      ctx.fillStyle = tabGrad;
      roundRect(ctx, fx + 2, fy - 10, 22, 14, 4);
      ctx.fill();

      // Main body: emerald satin
      const bodyGrad = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
      bodyGrad.addColorStop(0, '#4ADE9E');
      bodyGrad.addColorStop(0.45, '#22C07A');
      bodyGrad.addColorStop(1, '#0B7A52');
      ctx.fillStyle = bodyGrad;
      roundRect(ctx, fx, fy, fw, fh, 7);
      ctx.fill();
      ctx.restore();

      // Darker green side faces for depth (left + bottom)
      ctx.save();
      roundRect(ctx, fx, fy, fw, fh, 7);
      ctx.clip();
      const sideGrad = ctx.createLinearGradient(fx, fy + fh - 12, fx, fy + fh);
      sideGrad.addColorStop(0, 'rgba(4, 60, 42, 0)');
      sideGrad.addColorStop(1, 'rgba(4, 60, 42, 0.55)');
      ctx.fillStyle = sideGrad;
      ctx.fillRect(fx, fy, fw, fh);
      // Top bevel highlight
      const bevel = ctx.createLinearGradient(fx, fy, fx, fy + 8);
      bevel.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
      bevel.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = bevel;
      ctx.fillRect(fx, fy, fw, 8);
      ctx.restore();

      // Folder outline
      roundRect(ctx, fx, fy, fw, fh, 7);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(220, 255, 238, 0.35)';
      ctx.stroke();

      // ── 6. Face inset ────────────────────────────────────────────────
      const faceW = 30;
      const faceH = 17;
      const faceX = ox - faceW / 2;
      const faceY = oy + 8;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      roundRect(ctx, faceX, faceY, faceW, faceH, 8.5);
      const faceGrad = ctx.createLinearGradient(faceX, faceY, faceX, faceY + faceH);
      faceGrad.addColorStop(0, '#0C1210');
      faceGrad.addColorStop(1, '#070B0A');
      ctx.fillStyle = faceGrad;
      ctx.fill();
      ctx.restore();
      roundRect(ctx, faceX, faceY, faceW, faceH, 8.5);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(160, 240, 200, 0.25)';
      ctx.stroke();

      // ── 7. Eyes ──────────────────────────────────────────────────────
      // Genuine geometry animation: the eye shapes squash vertically through
      // the blink; success morphs them into happy arches. Never hidden/flashed.
      const eyeGlow = success ? 0.95 : 0.75 + hover * 0.2;
      const eyeY = faceY + faceH / 2;
      const eyeDX = 8;
      const eyeW = 7;
      const eyeH = success ? 5 : 8.5;

      const drawEye = (ex: number) => {
        ctx.save();
        ctx.translate(ex, eyeY);
        if (success) {
          // Happy arch: upward-curving stroke
          ctx.beginPath();
          ctx.arc(0, 1.5, eyeW / 2, Math.PI * 1.15, Math.PI * 1.85);
          ctx.lineWidth = 2.6;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#A7F3D0';
          ctx.shadowColor = `rgba(110, 231, 183, ${eyeGlow})`;
          ctx.shadowBlur = 6;
          ctx.stroke();
        } else {
          // Open eye: soft vertical capsule, squashed by blink openness
          const h = Math.max(0.8, eyeH * openness);
          ctx.beginPath();
          ctx.ellipse(0, 0, eyeW / 2, h / 2, 0, 0, Math.PI * 2);
          const eg = ctx.createRadialGradient(0, -h / 4, 0.5, 0, 0, eyeW / 2);
          eg.addColorStop(0, '#D8FCE9');
          eg.addColorStop(0.6, '#8FF0C0');
          eg.addColorStop(1, '#4ADE9E');
          ctx.fillStyle = eg;
          ctx.shadowColor = `rgba(110, 231, 183, ${eyeGlow * openness})`;
          ctx.shadowBlur = 5;
          ctx.fill();
        }
        ctx.restore();
      };
      drawEye(ox - eyeDX);
      drawEye(ox + eyeDX);

      ctx.restore(); // squircle clip

      strokeMarkBezel(ctx, cx, cy);
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

export default QuantDriveLogo;
