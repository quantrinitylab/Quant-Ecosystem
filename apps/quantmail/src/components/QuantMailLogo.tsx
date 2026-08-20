'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface QuantMailLogoProps {
  size?: number;
  unreadCount?: number;
  showBadge?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * World-Class 3D Claymorphic Volumetric Puffy Cloud Mail Mark (WebGL / Hardware-Accelerated Canvas)
 * Matches the exact aesthetic: Soft Pillowy Cloud + Glossy Clay Tubular Envelope + Dynamic Physics.
 */
export function QuantMailLogo({
  size = 38,
  unreadCount = 0,
  showBadge = true,
  className = '',
  onClick,
}: QuantMailLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const tiltRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 2;
    const renderSize = 128; // High-res internal rendering buffer
    canvas.width = renderSize * dpr;
    canvas.height = renderSize * dpr;

    let time = 0;

    const render = () => {
      time += 0.03;
      const { targetX, targetY } = tiltRef.current;
      tiltRef.current.x += (targetX - tiltRef.current.x) * 0.1;
      tiltRef.current.y += (targetY - tiltRef.current.y) * 0.1;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, renderSize, renderSize);

      const cx = renderSize / 2 + tiltRef.current.x * 6;
      const cy = renderSize / 2 + tiltRef.current.y * 6;

      // -------------------------------------------------------------
      // 1. SOFT 3D AMBIENT DROP SHADOW (Cloud floating depth)
      // -------------------------------------------------------------
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy + 32, 42, 14, 0, 0, Math.PI * 2);
      const shadowGrad = ctx.createRadialGradient(cx, cy + 32, 4, cx, cy + 32, 44);
      shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      shadowGrad.addColorStop(0.6, 'rgba(255, 122, 0, 0.12)');
      shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shadowGrad;
      ctx.fill();
      ctx.restore();

      // -------------------------------------------------------------
      // 2. VOLUMETRIC PUFFY CLOUD LOBES (Soft Pillowy 3D Geometry)
      // -------------------------------------------------------------
      const lobes = [
        { x: -22, y: 4, r: 24 }, // Left lobe
        { x: 22, y: 4, r: 24 }, // Right lobe
        { x: -14, y: -18, r: 22 }, // Top-left lobe
        { x: 14, y: -18, r: 22 }, // Top-right lobe
        { x: 0, y: -24, r: 21 }, // Top-center lobe
        { x: 0, y: 16, r: 26 }, // Bottom pillow lobe
        { x: 0, y: 0, r: 36 }, // Central pillow mass
      ];

      // Draw each cloud sphere with soft 3D directional lighting & subsurface occlusion
      lobes.forEach((lobe) => {
        const lx = cx + lobe.x;
        const ly = cy + lobe.y;
        const lr = lobe.r;

        ctx.save();
        ctx.beginPath();
        ctx.arc(lx, ly, lr, 0, Math.PI * 2);

        // Volumetric sphere gradient (light coming from top-left)
        const lightX = lx - lr * 0.35 + tiltRef.current.x * 4;
        const lightY = ly - lr * 0.4 + tiltRef.current.y * 4;
        const sphereGrad = ctx.createRadialGradient(lightX, lightY, lr * 0.1, lx, ly, lr);

        sphereGrad.addColorStop(0, '#FFFFFF'); // Bright top highlight
        sphereGrad.addColorStop(0.35, '#F4F7FB'); // Soft clay body
        sphereGrad.addColorStop(0.75, '#D5DEEA'); // Subsurface blue-gray shading
        sphereGrad.addColorStop(1, '#AAB8CC'); // Occlusion boundary

        ctx.fillStyle = sphereGrad;
        ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      });

      // -------------------------------------------------------------
      // 3. INNER CLOUD CREVICE (Recessed cavity for the envelope)
      // -------------------------------------------------------------
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx - 28, cy - 20, 56, 42, 12);
      const cavityGrad = ctx.createRadialGradient(cx, cy + 2, 8, cx, cy + 2, 32);
      cavityGrad.addColorStop(0, 'rgba(180, 195, 215, 0.4)');
      cavityGrad.addColorStop(0.7, 'rgba(135, 155, 185, 0.55)');
      cavityGrad.addColorStop(1, 'rgba(90, 110, 140, 0.7)');
      ctx.fillStyle = cavityGrad;
      ctx.fill();
      ctx.restore();

      // -------------------------------------------------------------
      // 4. GLOSSY 3D EMBOSSED ENVELOPE (Tubular Claymorphism)
      // -------------------------------------------------------------
      // A. Envelope Backing / Blue Core Plate
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx - 22, cy - 14, 44, 32, 6);
      const blueBaseGrad = ctx.createLinearGradient(cx, cy - 14, cx, cy + 18);
      blueBaseGrad.addColorStop(0, '#38BDF8'); // Vivid Sky Blue
      blueBaseGrad.addColorStop(0.6, '#0284C7'); // Royal Cyan
      blueBaseGrad.addColorStop(1, '#0369A1'); // Deep Ocean Core
      ctx.fillStyle = blueBaseGrad;
      ctx.fill();

      // Inner Flap Crease Lines
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy - 12);
      ctx.lineTo(cx, cy + 3);
      ctx.lineTo(cx + 20, cy - 12);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Glossy Flap Specular Glint
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 10);
      ctx.lineTo(cx, cy + 1);
      ctx.lineTo(cx + 18, cy - 10);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      // B. 3D Rounded M-Frame Tubular Pillars (Vibrant Saffron & Fire Amber)
      const drawGlossyPillar = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        color1: string,
        color2: string,
        width = 7.5,
      ) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineCap = 'round';
        ctx.lineWidth = width;

        // Shadow pass
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.stroke();

        // Color gradient pass
        const pGrad = ctx.createLinearGradient(x1, y1, x2, y2);
        pGrad.addColorStop(0, color1);
        pGrad.addColorStop(1, color2);
        ctx.strokeStyle = pGrad;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.stroke();

        // Gloss Specular Tubular Highlight (White Top Rim)
        ctx.beginPath();
        ctx.moveTo(x1 - 1, y1 - 1.2);
        ctx.lineTo(x2 - 1, y2 - 1.2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = width * 0.32;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      };

      // Left Pillar (Golden Saffron)
      drawGlossyPillar(cx - 20, cy + 14, cx - 20, cy - 12, '#FFB300', '#FF8F00', 7.5);

      // Right Pillar (Deep Fire Crimson/Amber)
      drawGlossyPillar(cx + 20, cy + 14, cx + 20, cy - 12, '#F4511E', '#D84315', 7.5);

      // Left Diagonal Arch (Saffron to Fire Red)
      drawGlossyPillar(cx - 20, cy - 12, cx, cy + 4, '#FF8F00', '#EA4335', 7.5);

      // Right Diagonal Arch (Fire Red)
      drawGlossyPillar(cx + 20, cy - 12, cx, cy + 4, '#D84315', '#EA4335', 7.5);

      // Central Vertex Gloss Specular Dot
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy + 3, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();

      // -------------------------------------------------------------
      // 5. TOP CLOUD RIM SPECULAR (Glassy Polish)
      // -------------------------------------------------------------
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy - 24, 18, 6, -0.15, 0, Math.PI * 2);
      const topShine = ctx.createLinearGradient(cx - 22, cy - 26, cx + 14, cy - 22);
      topShine.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      topShine.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
      ctx.fillStyle = topShine;
      ctx.fill();
      ctx.restore();

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.targetX = nx * 1.5;
    tiltRef.current.targetY = ny * 1.5;
  };

  const handleMouseLeave = () => {
    tiltRef.current.targetX = 0;
    tiltRef.current.targetY = 0;
    setIsHovered(false);
  };

  const handleClick = () => {
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 700);
    if (onClick) onClick();
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center cursor-pointer select-none group ${className}`}
      style={{ width: size, height: size }}
      title="QuantMail — 3D Living Cloud"
    >
      <motion.div
        className="relative flex items-center justify-center w-full h-full"
        animate={{
          rotate: isSpinning ? 360 : 0,
          scale: isSpinning ? [1, 0.85, 1.15, 1] : isHovered ? 1.12 : 1,
        }}
        transition={{
          rotate: { duration: 0.65, ease: [0.34, 1.56, 0.64, 1] },
          scale: { duration: 0.25, ease: 'easeOut' },
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="w-full h-full drop-shadow-[0_4px_16px_rgba(255,122,0,0.35)]"
        />
      </motion.div>

      {/* Dynamic Unread Counter HUD Pill */}
      {showBadge && (
        <div className="absolute -top-1 -right-1 z-10 pointer-events-none">
          {unreadCount > 0 ? (
            <span className="relative inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 text-[9.5px] font-black text-[#0B0C10] bg-gradient-to-r from-[#FF9800] to-[#FFC107] rounded-full shadow-[0_0_10px_rgba(255,152,0,0.9)] border border-white/60">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : (
            <span className="flex items-center justify-center size-3.5 rounded-full bg-emerald-500/20 border border-emerald-400/90 text-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]">
              <svg
                className="size-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default QuantMailLogo;
