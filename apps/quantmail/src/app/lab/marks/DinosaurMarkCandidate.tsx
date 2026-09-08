'use client';

import { useCallback } from 'react';
import {
  MARK_COLORS,
  markSquirclePath,
  paintGlossSweep,
  paintObsidianPlate,
  paintPlateDome,
  paintSideWall,
  strokeMarkBezel,
} from '../../../lib/marks/canvas-mark';
import { useLiveMark, type MarkFrame } from '../../../components/marks/useLiveMark';

export interface DinosaurMarkCandidateProps {
  size?: number;
  className?: string;
  title?: string;
}

/** One continuous profile: the candidate must still read when 100 units become 20 pixels. */
function dinosaurPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(13, 53);
  ctx.bezierCurveTo(24, 50, 30, 43, 40, 39);
  ctx.bezierCurveTo(50, 34, 60, 31, 69, 31);
  ctx.bezierCurveTo(77, 28, 85, 31, 87, 36);
  ctx.lineTo(83, 40);
  ctx.lineTo(89, 43);
  ctx.lineTo(84, 48);
  ctx.lineTo(75, 48);
  ctx.bezierCurveTo(72, 53, 68, 57, 63, 59);
  ctx.lineTo(68, 64);
  ctx.lineTo(64, 67);
  ctx.lineTo(58, 63);
  ctx.lineTo(55, 67);
  ctx.bezierCurveTo(58, 71, 59, 74, 59, 78);
  ctx.lineTo(67, 80);
  ctx.lineTo(65, 84);
  ctx.lineTo(52, 84);
  ctx.lineTo(51, 79);
  ctx.lineTo(53, 69);
  ctx.lineTo(46, 69);
  ctx.lineTo(44, 77);
  ctx.lineTo(50, 81);
  ctx.lineTo(48, 84);
  ctx.lineTo(35, 84);
  ctx.lineTo(34, 79);
  ctx.lineTo(38, 67);
  ctx.bezierCurveTo(31, 64, 23, 59, 13, 53);
  ctx.closePath();
}

export function DinosaurMarkCandidate({
  size = 36,
  className = '',
  title = 'Dinosaur mark candidate',
}: DinosaurMarkCandidateProps) {
  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();
      paintObsidianPlate(ctx, cx, cy, reduced ? 0 : time, tiltX, tiltY);
      paintPlateDome(ctx, cx, cy);
      ctx.restore();

      ctx.save();
      ctx.translate(tiltX * 0.75, tiltY * 0.55 + press * 0.8);

      ctx.save();
      dinosaurPath(ctx);
      ctx.shadowColor = 'rgba(255, 140, 66, 0.38)';
      ctx.shadowBlur = 7 + hover * 4;
      ctx.fillStyle = MARK_COLORS.emberDeep;
      ctx.fill();
      ctx.restore();

      paintSideWall(ctx, dinosaurPath, 2.4 - press * 1.2, '#8A421F', '#2B1A11', 28, 86);
      dinosaurPath(ctx);
      const amber = ctx.createLinearGradient(30, 31, 70, 84);
      amber.addColorStop(0, '#FFF0DE');
      amber.addColorStop(0.35, MARK_COLORS.peach);
      amber.addColorStop(0.74, MARK_COLORS.emberHot);
      amber.addColorStop(1, MARK_COLORS.emberDeep);
      ctx.fillStyle = amber;
      ctx.fill();

      ctx.save();
      dinosaurPath(ctx);
      ctx.clip();
      const sweep = reduced ? 0.42 : 0.32 + hover * 0.28 + Math.sin(time * 0.22) * 0.04;
      paintGlossSweep(ctx, 11, 27, 80, 59, sweep, 0.2);
      ctx.restore();

      dinosaurPath(ctx);
      const bevel = ctx.createLinearGradient(25, 30, 72, 74);
      bevel.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
      bevel.addColorStop(0.48, 'rgba(255, 224, 196, 0.24)');
      bevel.addColorStop(1, 'rgba(92, 48, 22, 0.72)');
      ctx.lineWidth = 1.35;
      ctx.strokeStyle = bevel;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(79.5, 36.2, 1.45, 0, Math.PI * 2);
      ctx.fillStyle = MARK_COLORS.void;
      ctx.fill();
      ctx.restore();

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
      className={`inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
      {...pointerProps}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </span>
  );
}
