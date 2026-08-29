'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type LogoAppType = 'mail' | 'calendar' | 'drive' | 'contacts' | 'code';

interface Interactive3DLogoProps {
  app?: LogoAppType;
  size?: number; // default 36
  unreadCount?: number;
  showBadge?: boolean;
  interactive?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Interactive3DLogo({
  app = 'mail',
  size = 36,
  unreadCount = 0,
  showBadge = true,
  interactive = true,
  className = '',
  onClick,
}: Interactive3DLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  // Animation frame loop refs
  const animFrameRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);
  const targetTiltRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentTiltRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const glintPosRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.3 });

  // Handle Mouse Move for 3D Perspective Tilt & Specular Lighting
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
      const ny = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 to 0.5

      targetTiltRef.current = { x: ny * 24, y: -nx * 24 }; // degrees
      glintPosRef.current = { x: nx + 0.5, y: ny + 0.5 };
      setTilt(targetTiltRef.current);
    },
    [interactive],
  );

  const handleMouseLeave = useCallback(() => {
    targetTiltRef.current = { x: 0, y: 0 };
    glintPosRef.current = { x: 0.5, y: 0.3 };
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      setPulseKey((k) => k + 1);
      setIsSpinning(true);
      setTimeout(() => setIsSpinning(false), 700);
      if (onClick) onClick();
    },
    [onClick],
  );

  // High-Precision Hardware-Accelerated Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 3) : 2;
    const renderWidth = size * dpr;
    const renderHeight = size * dpr;

    canvas.width = renderWidth;
    canvas.height = renderHeight;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;
      timeRef.current += 0.035;
      const t = timeRef.current;

      // Smooth lerp tilt physics
      currentTiltRef.current.x += (targetTiltRef.current.x - currentTiltRef.current.x) * 0.12;
      currentTiltRef.current.y += (targetTiltRef.current.y - currentTiltRef.current.y) * 0.12;

      ctx.clearRect(0, 0, renderWidth, renderHeight);
      ctx.save();
      ctx.scale(dpr, dpr);

      const cx = size / 2;
      const cy = size / 2;
      const r = size * 0.44; // radius / bounds
      const cornerR = size * 0.22;

      // Subtle ambient hover float
      const floatY = isHovered ? Math.sin(t * 1.5) * 1.2 : Math.sin(t * 0.8) * 0.6;

      ctx.translate(cx, cy + floatY);

      // Apply 3D perspective skew / rotation transform
      const tiltXRad = (currentTiltRef.current.x * Math.PI) / 180;
      const tiltYRad = (currentTiltRef.current.y * Math.PI) / 180;
      ctx.transform(
        Math.cos(tiltYRad),
        Math.sin(tiltXRad) * 0.3,
        Math.sin(tiltYRad) * 0.3,
        Math.cos(tiltXRad),
        0,
        0,
      );

      // ----------------------------------------------------
      // LAYER 1: Deep Outer Quantum Glow
      // ----------------------------------------------------
      const glowGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.4);
      const glowAlpha = isHovered ? 0.35 : 0.18 + Math.sin(t * 2) * 0.05;
      glowGrad.addColorStop(0, `rgba(255, 140, 66, ${glowAlpha})`);
      glowGrad.addColorStop(0.6, `rgba(255, 85, 0, ${glowAlpha * 0.4})`);
      glowGrad.addColorStop(1, 'rgba(255, 85, 0, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // ----------------------------------------------------
      // LAYER 2: 3D Obsidian Glass / Titanium Tile Base
      // ----------------------------------------------------
      const tileHalf = size * 0.42;
      ctx.beginPath();
      ctx.roundRect(-tileHalf, -tileHalf, tileHalf * 2, tileHalf * 2, cornerR);

      // Titanium Gradient with Specular Light Glint
      const glintX = -tileHalf + glintPosRef.current.x * (tileHalf * 2);
      const glintY = -tileHalf + glintPosRef.current.y * (tileHalf * 2);
      const baseGrad = ctx.createRadialGradient(glintX, glintY, 2, 0, 0, tileHalf * 1.5);

      baseGrad.addColorStop(0, 'rgba(38, 41, 52, 0.95)');
      baseGrad.addColorStop(0.4, 'rgba(20, 22, 28, 0.96)');
      baseGrad.addColorStop(1, 'rgba(10, 11, 14, 0.98)');

      ctx.fillStyle = baseGrad;
      ctx.fill();

      // Chamfered 3D Bevel Border with Fresnel Glow
      const borderGrad = ctx.createLinearGradient(-tileHalf, -tileHalf, tileHalf, tileHalf);
      borderGrad.addColorStop(0, 'rgba(255, 170, 51, 0.7)');
      borderGrad.addColorStop(0.4, 'rgba(255, 140, 66, 0.35)');
      borderGrad.addColorStop(0.8, 'rgba(50, 55, 70, 0.5)');
      borderGrad.addColorStop(1, 'rgba(255, 140, 0, 0.6)');

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = borderGrad;
      ctx.stroke();

      // ----------------------------------------------------
      // LAYER 3: App-Specific 3D Geometry & Laser Light Seams
      // ----------------------------------------------------
      const iconScale = size / 36;
      ctx.save();
      ctx.scale(iconScale, iconScale);

      if (app === 'mail') {
        // QUANTMAIL 3D ENVELOPE WITH NEON LASER SEAMS
        const ew = 18;
        const eh = 14;
        const ex = -ew / 2;
        const ey = -eh / 2 + 0.5;

        // Envelope Base Body
        ctx.beginPath();
        ctx.roundRect(ex, ey, ew, eh, 2.5);
        ctx.fillStyle = 'rgba(15, 16, 20, 0.85)';
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(255, 140, 66, 0.85)';
        ctx.stroke();

        // 3D Laser Envelope Flap (V-Shape with Pulse)
        const flapPulse = Math.sin(t * 3) * 0.15 + 0.85;
        ctx.beginPath();
        ctx.moveTo(ex + 1.5, ey + 1);
        ctx.lineTo(0, ey + eh * 0.62);
        ctx.lineTo(ex + ew - 1.5, ey + 1);

        const flapGrad = ctx.createLinearGradient(ex, ey, ex + ew, ey + eh * 0.6);
        flapGrad.addColorStop(0, `rgba(255, 170, 51, ${flapPulse})`);
        flapGrad.addColorStop(0.5, `rgba(255, 100, 0, ${flapPulse})`);
        flapGrad.addColorStop(1, `rgba(255, 200, 80, ${flapPulse})`);

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = flapGrad;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Central Pulsating Quantum Core (Encrypted Message Heartbeat)
        const coreR = 1.8 + Math.sin(t * 4) * 0.5;
        const coreGrad = ctx.createRadialGradient(
          0,
          ey + eh * 0.62,
          0,
          0,
          ey + eh * 0.62,
          coreR * 2.5,
        );
        coreGrad.addColorStop(0, 'rgba(255, 240, 200, 1)');
        coreGrad.addColorStop(0.4, 'rgba(255, 140, 0, 0.8)');
        coreGrad.addColorStop(1, 'rgba(255, 80, 0, 0)');

        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, ey + eh * 0.62, coreR * 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (app === 'calendar') {
        // QUANTCALENDAR 3D DATE TILE
        const cw = 18;
        const ch = 16;
        const cx0 = -cw / 2;
        const cy0 = -ch / 2;

        // Calendar Shell
        ctx.beginPath();
        ctx.roundRect(cx0, cy0, cw, ch, 2.5);
        ctx.fillStyle = 'rgba(15, 16, 20, 0.85)';
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(255, 140, 66, 0.85)';
        ctx.stroke();

        // Calendar Header Strip
        ctx.beginPath();
        ctx.roundRect(cx0, cy0, cw, 4.5, [2.5, 2.5, 0, 0]);
        ctx.fillStyle = 'rgba(255, 140, 66, 0.35)';
        ctx.fill();

        // Binding Rings
        ctx.fillStyle = '#FF8C42';
        ctx.beginPath();
        ctx.arc(cx0 + 4.5, cy0 + 1, 1.2, 0, Math.PI * 2);
        ctx.arc(cx0 + cw - 4.5, cy0 + 1, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Live Date Grid Dot Indicator
        const dateDotPulse = Math.sin(t * 3) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(255, 170, 51, ${dateDotPulse})`;
        ctx.beginPath();
        ctx.arc(0, cy0 + 10, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (app === 'drive') {
        // QUANTDRIVE 3D STORAGE VAULT / FOLDER
        const dw = 19;
        const dh = 15;
        const dx0 = -dw / 2;
        const dy0 = -dh / 2;

        ctx.beginPath();
        ctx.moveTo(dx0, dy0 + 3.5);
        ctx.lineTo(dx0, dy0 + dh - 2);
        ctx.arcTo(dx0, dy0 + dh, dx0 + 2, dy0 + dh, 2);
        ctx.lineTo(dx0 + dw - 2, dy0 + dh);
        ctx.arcTo(dx0 + dw, dy0 + dh, dx0 + dw, dy0 + dh - 2, 2);
        ctx.lineTo(dx0 + dw, dy0 + 4);
        ctx.arcTo(dx0 + dw, dy0 + 2, dx0 + dw - 2, dy0 + 2, 2);
        ctx.lineTo(dx0 + 8.5, dy0 + 2);
        ctx.lineTo(dx0 + 6.5, dy0);
        ctx.lineTo(dx0 + 2, dy0);
        ctx.arcTo(dx0, dy0, dx0, dy0 + 2, 2);
        ctx.closePath();

        ctx.fillStyle = 'rgba(15, 16, 20, 0.85)';
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(255, 140, 66, 0.85)';
        ctx.stroke();

        // Glowing Vault Keyline
        ctx.beginPath();
        ctx.moveTo(dx0 + 4, dy0 + 8);
        ctx.lineTo(dx0 + dw - 4, dy0 + 8);
        ctx.strokeStyle = 'rgba(255, 170, 51, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (app === 'contacts') {
        // QUANTCONTACTS 3D IDENTITY ORB
        ctx.beginPath();
        ctx.arc(0, -2.5, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 140, 0, 0.25)';
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(255, 140, 0, 0.9)';
        ctx.stroke();

        // Body Arc
        ctx.beginPath();
        ctx.arc(0, 9, 8.5, Math.PI * 1.2, Math.PI * 1.8);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 140, 0, 0.9)';
        ctx.stroke();

        // Pulsating Orbit Ring
        ctx.beginPath();
        ctx.ellipse(0, -2.5, 7, 2.5, (t * 0.8) % (Math.PI * 2), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 170, 51, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else if (app === 'code') {
        // QUANTCODE 3D NEON TERMINAL BRACKETS
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FF8C42';
        ctx.shadowColor = 'rgba(255, 140, 66, 0.8)';
        ctx.shadowBlur = 6;
        ctx.fillText('< / >', 0, 0.5);
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      // ----------------------------------------------------
      // LAYER 4: Dynamic Specular Reflection Beam Glint
      // ----------------------------------------------------
      const sweepX = Math.sin(t * 1.2) * tileHalf * 1.6;
      const glintBeam = ctx.createLinearGradient(sweepX - 8, -tileHalf, sweepX + 8, tileHalf);
      glintBeam.addColorStop(0, 'rgba(255, 255, 255, 0)');
      glintBeam.addColorStop(0.5, 'rgba(255, 255, 255, 0.18)');
      glintBeam.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-tileHalf, -tileHalf, tileHalf * 2, tileHalf * 2, cornerR);
      ctx.clip();
      ctx.fillStyle = glintBeam;
      ctx.fillRect(-tileHalf, -tileHalf, tileHalf * 2, tileHalf * 2);
      ctx.restore();

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [app, size, isHovered]);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center select-none cursor-pointer group ${className}`}
      style={{
        width: size,
        height: size,
        perspective: 600,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onClick={handleClick}
      title={`Quant${app.charAt(0).toUpperCase() + app.slice(1)}`}
    >
      {/* 3D Hardware Accelerated Canvas */}
      <motion.div
        className="relative flex items-center justify-center w-full h-full"
        animate={{
          scale: isPressed ? 0.92 : isHovered ? 1.06 : 1,
          rotate: isSpinning ? 360 : 0,
        }}
        transition={{
          scale: { type: 'spring', stiffness: 450, damping: 25 },
          rotate: { duration: 0.65, ease: [0.34, 1.56, 0.64, 1] },
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="block pointer-events-none drop-shadow-[0_4px_16px_rgba(255,140,66,0.35)]"
        />

        {/* Pulse Ripple Burst on Tap / Click */}
        <AnimatePresence>
          {pulseKey > 0 && (
            <motion.span
              key={pulseKey}
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 1.8, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="absolute inset-0 rounded-2xl border-2 border-[#FF8C42] pointer-events-none"
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* 3D FLOATING HOLOGRAPHIC UNREAD COUNTER HUD */}
      {showBadge && (
        <div className="absolute -top-1.5 -right-2 z-10 pointer-events-none">
          {unreadCount > 0 ? (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              key={`badge-${unreadCount}`}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="relative flex items-center justify-center"
            >
              {/* Outer Energy Pulse Ring */}
              <span className="absolute size-[18px] rounded-full bg-[#FF8C42] opacity-40 animate-ping" />

              {/* Clean Badge */}
              <span className="relative inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 text-[9.5px] font-bold text-[#111111] bg-[#FF8C42] rounded-full border border-[#090A0C] shadow-sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </motion.div>
          ) : (
            /* Inbox Zero Calm Zen Indicator */
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              title="All caught up (0 unread)"
              className="flex items-center justify-center size-3.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            >
              <svg
                className="size-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
