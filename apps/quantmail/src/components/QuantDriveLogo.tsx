'use client';

import { useCallback } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  MARK_COLORS,
  markSquirclePath,
  paintEmberPlate,
  paintGlossSweep,
  paintPlateDome,
  strokeMarkBezel,
} from '../lib/marks/canvas-mark';

/**
 * QuantDrive's mark — a modern, multi-layered cloud & storage platter symbol
 * on the family's live ember plate.
 *
 * Replaces the legacy paper-with-hat and red spheres look with a cohesive,
 * architectural cloud storage mark that belongs directly to the Quant Ecosystem.
 */

/** Helper to draw a sleek, modern cloud silhouette centered at (cx, cy) */
function drawCloudPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  ctx.beginPath();
  // Base rounded pill
  ctx.roundRect(-22, -4, 44, 20, 10);
  // Left lobe
  ctx.arc(-9, -4, 11, Math.PI * 0.9, Math.PI * 1.9);
  // Center top lobe (main apex)
  ctx.arc(4, -9, 14, Math.PI * 1.05, Math.PI * 2.05);
  // Right lobe
  ctx.arc(14, -2, 9, Math.PI * 1.25, Math.PI * 2.25);
  ctx.closePath();

  ctx.restore();
}

/** Helper to draw an isometric elliptical storage platter */
function drawPlatter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  h: number,
  fillTop: string | CanvasGradient,
  fillSide: string | CanvasGradient,
  stroke: string,
): void {
  // Side extrusion
  ctx.beginPath();
  ctx.ellipse(cx, cy + h, rx, ry, 0, 0, Math.PI);
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = fillSide;
  ctx.fill();

  // Top surface
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fillTop;
  ctx.fill();

  ctx.lineWidth = 0.8;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export function QuantDriveLogo({
  size = 32,
  className = '',
  title = 'QuantDrive',
}: QuantLogoProps) {
  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const t = reduced ? 0 : time;
      const breathe = reduced ? 0 : Math.sin(t * 0.8);

      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();

      // 1. Base Ember Plate
      paintEmberPlate(ctx, cx, cy, t, tiltX, tiltY);
      paintPlateDome(ctx, cx, cy);

      // 2. Ambient hover glow
      if (hover > 0.01) {
        const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 42);
        glow.addColorStop(0, `rgba(255, 220, 180, ${0.28 * hover})`);
        glow.addColorStop(1, 'rgba(255, 140, 66, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 45, cy - 45, 90, 90);
      }

      // 3. Dynamic tilt & float transform
      const lift = hover * 2 - press * 1.2;
      ctx.translate(cx + tiltX * 2.2, cy + tiltY * 2.2 - lift + breathe * 0.8);
      const scale = 1 + breathe * 0.006 + hover * 0.02 - press * 0.03;
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // Center of object assembly
      const ox = cx;
      const oy = cy + 2;

      // 4. Platter 1: Bottom Obsidian-Ember Storage Disc
      const p1Top = ctx.createLinearGradient(ox - 24, oy + 12, ox + 24, oy + 12);
      p1Top.addColorStop(0, '#241208');
      p1Top.addColorStop(0.5, '#481F0D');
      p1Top.addColorStop(1, '#1A0D06');

      const p1Side = ctx.createLinearGradient(ox, oy + 12, ox, oy + 17);
      p1Side.addColorStop(0, '#381608');
      p1Side.addColorStop(1, '#120703');

      drawPlatter(ctx, ox, oy + 13, 23, 7.5, 3.5, p1Top, p1Side, 'rgba(255, 140, 66, 0.35)');

      // 5. Platter 2: Middle Amber-Gold Storage Disc
      const p2Top = ctx.createLinearGradient(ox - 21, oy + 6, ox + 21, oy + 6);
      p2Top.addColorStop(0, '#7A360D');
      p2Top.addColorStop(0.45, MARK_COLORS.ember);
      p2Top.addColorStop(1, '#4A1D06');

      const p2Side = ctx.createLinearGradient(ox, oy + 6, ox, oy + 10);
      p2Side.addColorStop(0, '#8A3B0E');
      p2Side.addColorStop(1, '#331204');

      drawPlatter(ctx, ox, oy + 7, 21, 6.8, 3.2, p2Top, p2Side, 'rgba(255, 200, 140, 0.45)');

      // Micro storage track concentric rings on middle disc
      ctx.beginPath();
      ctx.ellipse(ox, oy + 7, 15, 4.8, 0, 0, Math.PI * 2);
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(255, 230, 200, 0.25)';
      ctx.stroke();

      // 6. Platter 3: Sleek Modern Frosted Cloud Surface (Top)
      ctx.save();
      ctx.shadowColor = 'rgba(24, 8, 2, 0.65)';
      ctx.shadowBlur = 6 + hover * 3;
      ctx.shadowOffsetY = 3;

      drawCloudPath(ctx, ox, oy - 7, 0.88);

      const cloudFill = ctx.createLinearGradient(ox - 18, oy - 20, ox + 18, oy + 4);
      cloudFill.addColorStop(0, '#FFFFFF');
      cloudFill.addColorStop(0.35, '#FFF8F0');
      cloudFill.addColorStop(0.75, '#FFE2C6');
      cloudFill.addColorStop(1, '#FFB27D');
      ctx.fillStyle = cloudFill;
      ctx.fill();
      ctx.restore();

      // Cloud Perimeter Metallic Chamfer Bezel
      drawCloudPath(ctx, ox, oy - 7, 0.88);
      const cloudStroke = ctx.createLinearGradient(ox - 18, oy - 20, ox + 18, oy + 4);
      cloudStroke.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      cloudStroke.addColorStop(0.5, 'rgba(255, 200, 150, 0.6)');
      cloudStroke.addColorStop(1, 'rgba(168, 70, 18, 0.7)');
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = cloudStroke;
      ctx.stroke();

      // 7. Central Glowing Data Diamond Nucleus
      ctx.save();
      const coreY = oy - 4 + Math.sin(t * 1.5) * 1.2;
      const coreSize = 4.2;

      // Glow halo
      const coreGlow = ctx.createRadialGradient(ox, coreY, 0.5, ox, coreY, 8);
      coreGlow.addColorStop(0, 'rgba(255, 180, 80, 0.65)');
      coreGlow.addColorStop(0.5, 'rgba(255, 140, 66, 0.2)');
      coreGlow.addColorStop(1, 'rgba(255, 140, 66, 0)');
      ctx.fillStyle = coreGlow;
      ctx.fillRect(ox - 8, coreY - 8, 16, 16);

      // Isometric Data Diamond
      ctx.beginPath();
      ctx.moveTo(ox, coreY - coreSize);
      ctx.lineTo(ox + coreSize, coreY);
      ctx.lineTo(ox, coreY + coreSize);
      ctx.lineTo(ox - coreSize, coreY);
      ctx.closePath();

      const diamondFill = ctx.createLinearGradient(ox, coreY - coreSize, ox, coreY + coreSize);
      diamondFill.addColorStop(0, '#FFF9E6');
      diamondFill.addColorStop(0.5, '#FF9B42');
      diamondFill.addColorStop(1, '#B8450C');
      ctx.fillStyle = diamondFill;
      ctx.fill();

      ctx.lineWidth = 0.7;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.restore();

      // 8. Subtle Gloss Sweep across cloud
      const sweep = reduced ? 0.35 : (t * 0.08 + hover * 0.4) % 1;
      ctx.save();
      drawCloudPath(ctx, ox, oy - 7, 0.88);
      ctx.clip();
      paintGlossSweep(ctx, ox - 20, oy - 20, 40, 30, sweep, 0.16 + hover * 0.1);
      ctx.restore();

      // 9. Floating ambient micro-particles (data transfer nodes)
      const pAng1 = t * 1.1;
      const pAng2 = t * 0.9 + 2.1;
      const pAng3 = t * 1.3 + 4.2;

      const dots = [
        { x: ox + Math.cos(pAng1) * 22, y: oy - 6 + Math.sin(pAng1) * 7, r: 1.2, a: 0.8 },
        { x: ox + Math.cos(pAng2) * 25, y: oy - 3 + Math.sin(pAng2) * 8, r: 1.0, a: 0.65 },
        { x: ox + Math.cos(pAng3) * 19, y: oy - 10 + Math.sin(pAng3) * 6, r: 0.9, a: 0.5 },
      ];

      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 235, 200, ${dot.a})`;
        ctx.shadowColor = '#FF8C42';
        ctx.shadowBlur = 3;
        ctx.fill();
      }

      ctx.restore(); // squircle clip

      // Outer Mark Bezel
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
