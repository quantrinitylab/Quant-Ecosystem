'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface QuantMailLogoProps {
  size?: number;
  unreadCount?: number;
  showBadge?: boolean;
  className?: string;
  onClick?: () => void;
  variant?: string;
  interactive?: boolean;
  title?: string;
}

/**
 * World-Class Living AI Mascot & Fluid Lava Squircle Logo for QuantMail
 * Features:
 * 1. 60FPS Continuous Uninterrupted Liquid Lava Fluid Shader (Solar Gold -> Fire Orange -> Crimson -> Obsidian).
 * 2. Signature "M" Quanty Mascot with lively open eyes (●  ●), real-time pointer tracking, and natural organic blinking.
 * 3. Smart Unread HUD Badge: Only appears when unreadCount > 0 with glowing amber pill and exact count (Zero clutter when 0 unread).
 * 4. Interactive pointer tracking, spring bounce, and one-tap instant inbox refresh & navigation.
 */
export function QuantMailLogo({
  size = 40,
  unreadCount = 0,
  showBadge = true,
  className = '',
  onClick,
}: QuantMailLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  // Persistent Physics & Animation State Refs (Never restart the animation loop!)
  const timeRef = useRef(Math.random() * 100);
  const unreadRef = useRef(unreadCount);
  const blinkRef = useRef(false);
  const winkRef = useRef(false);
  const tiltRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const mouseVelocityRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Keep unread count ref in sync without remounting canvas
  useEffect(() => {
    unreadRef.current = unreadCount;
  }, [unreadCount]);

  // Natural Organic Blinking Cycle (Every 3.5s - 5.5s)
  useEffect(() => {
    let blinkTimer: NodeJS.Timeout | null = null;

    const triggerBlink = () => {
      blinkRef.current = true;
      setTimeout(() => {
        blinkRef.current = false;
      }, 150);
      const nextDelay = 3500 + Math.random() * 2000;
      blinkTimer = setTimeout(triggerBlink, nextDelay);
    };

    blinkTimer = setTimeout(triggerBlink, 3000);
    return () => {
      if (blinkTimer) clearTimeout(blinkTimer);
    };
  }, []);

  // 60FPS Continuous Fluid Lava & Mascot Canvas Renderer (Mounted once, runs forever seamlessly)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 3) : 2;
    const res = 100; // Optimal 1:1 internal rendering buffer
    canvas.width = res * dpr;
    canvas.height = res * dpr;

    const render = () => {
      // Continuous smooth time increment (never resets or jumps)
      timeRef.current += 0.024;
      const time = timeRef.current;

      // Smooth damping for tilt
      const { targetX, targetY } = tiltRef.current;
      tiltRef.current.x += (targetX - tiltRef.current.x) * 0.12;
      tiltRef.current.y += (targetY - tiltRef.current.y) * 0.12;

      // Mouse velocity decay
      mouseVelocityRef.current.x *= 0.92;
      mouseVelocityRef.current.y *= 0.92;

      // Reset transform and scale idempotently for high-DPI displays
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, res, res);

      const cx = res / 2;
      const cy = res / 2;
      const squircleRadius = 45; // 90px out of 100px with 5px margin
      const cornerRadius = 22;

      // -------------------------------------------------------------
      // 1. APPLE SQUIRCLE CLIPPING PATH
      // -------------------------------------------------------------
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(
        cx - squircleRadius,
        cy - squircleRadius,
        squircleRadius * 2,
        squircleRadius * 2,
        cornerRadius,
      );
      ctx.clip();

      // -------------------------------------------------------------
      // 2. PROCEDURAL 60FPS LIQUID LAVA / SMOKE FLUID GRADIENT
      // -------------------------------------------------------------
      const tX = tiltRef.current.x * 8 + mouseVelocityRef.current.x * 12;
      const tY = tiltRef.current.y * 8 + mouseVelocityRef.current.y * 12;

      const p1x = cx - 14 + Math.cos(time * 0.9) * 12 + tX * 0.5;
      const p1y = cy + 14 + Math.sin(time * 0.8) * 10 + tY * 0.5; // Solar Gold (Bottom-Left)

      const p2x = cx + 6 + Math.sin(time * 1.1) * 14 + tX * 0.7;
      const p2y = cy - 14 + Math.cos(time * 0.95) * 12 + tY * 0.7; // Fire Orange (Top)

      const p3x = cx + 18 + Math.cos(time * 0.75) * 10 + tX * 0.4;
      const p3y = cy + 12 + Math.sin(time * 1.2) * 12 + tY * 0.4; // Crimson (Bottom-Right)

      // Base Obsidian Background
      ctx.fillStyle = '#060709';
      ctx.fillRect(0, 0, res, res);

      // Layer 1: Crimson Scarlet Fluid Mass (Right / Deep)
      const gradCrimson = ctx.createRadialGradient(p3x, p3y, 2, p3x, p3y, 50);
      gradCrimson.addColorStop(0, '#E52E14');
      gradCrimson.addColorStop(0.4, '#C61E08');
      gradCrimson.addColorStop(0.75, '#7F0A00');
      gradCrimson.addColorStop(1, 'rgba(10, 5, 5, 0)');
      ctx.fillStyle = gradCrimson;
      ctx.fillRect(0, 0, res, res);

      // Layer 2: Electric Fire Orange Silk Swirl (Top-Center)
      const gradOrange = ctx.createRadialGradient(p2x, p2y, 2, p2x, p2y, 52);
      gradOrange.addColorStop(0, '#FF5500');
      gradOrange.addColorStop(0.35, '#FF3300');
      gradOrange.addColorStop(0.7, '#D62000');
      gradOrange.addColorStop(1, 'rgba(15, 6, 2, 0)');
      ctx.fillStyle = gradOrange;
      ctx.fillRect(0, 0, res, res);

      // Layer 3: Intense Solar Gold Flame (Bottom-Left)
      const gradGold = ctx.createRadialGradient(p1x, p1y, 1, p1x, p1y, 44);
      gradGold.addColorStop(0, '#FFC700');
      gradGold.addColorStop(0.28, '#FF8A00');
      gradGold.addColorStop(0.65, '#FF4500');
      gradGold.addColorStop(1, 'rgba(255, 69, 0, 0)');
      ctx.fillStyle = gradGold;
      ctx.fillRect(0, 0, res, res);

      // Layer 4: Deep Obsidian Contrast Crevices
      const voidX = cx + Math.sin(time * 0.85) * 8 - tX * 0.4;
      const voidY = cy + Math.cos(time * 0.7) * 6 - tY * 0.4;
      const gradVoid = ctx.createRadialGradient(voidX, voidY, 1, voidX, voidY, 36);
      gradVoid.addColorStop(0, 'rgba(6, 7, 10, 0.92)');
      gradVoid.addColorStop(0.5, 'rgba(12, 14, 20, 0.6)');
      gradVoid.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradVoid;
      ctx.fillRect(0, 0, res, res);

      // -------------------------------------------------------------
      // 3. CENTER SOLID WHITE "M" QUANTY MASCOT GLYPH
      // -------------------------------------------------------------
      ctx.save();
      // Apply slight 3D perspective parallax to mascot relative to background
      const mx = cx + tiltRef.current.x * 2.5;
      const my = cy + tiltRef.current.y * 2.5 + 2;

      // Mascot Dimensions: W: 54, H: 44
      const mw = 54;
      const mh = 44;
      const x0 = mx - mw / 2;
      const y0 = my - mh / 2;

      // Draw Mascot Soft Drop Shadow for real 3D lift
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;

      ctx.beginPath();
      // Start Bottom-Left
      ctx.moveTo(x0 + 7, y0 + mh);
      // Bottom flat edge with rounded bottom-left corner
      ctx.arcTo(x0, y0 + mh, x0, y0 + mh - 7, 7);
      // Left vertical wall
      ctx.lineTo(x0, y0 + 12);
      // Left Ear Outer Curve to Left Peak
      ctx.bezierCurveTo(x0, y0 + 4, x0 + 4, y0, x0 + 9, y0);
      // Left Ear Peak to Center 'M' Valley
      ctx.bezierCurveTo(x0 + 15, y0 + 2, x0 + 21, y0 + 17, x0 + 27, y0 + 17);
      // Center 'M' Valley to Right Ear Peak
      ctx.bezierCurveTo(x0 + 33, y0 + 17, x0 + 39, y0 + 2, x0 + 45, y0);
      // Right Peak to Right Outer Wall
      ctx.bezierCurveTo(x0 + 50, y0, x0 + mw, y0 + 4, x0 + mw, y0 + 12);
      // Right vertical wall
      ctx.lineTo(x0 + mw, y0 + mh - 7);
      // Bottom-Right rounded corner
      ctx.arcTo(x0 + mw, y0 + mh, x0 + mw - 7, y0 + mh, 7);
      // Close back to bottom-left
      ctx.closePath();

      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore(); // restore shadow

      // -------------------------------------------------------------
      // 4. DYNAMIC MASCOT EYES (Always Lively Open, Eye Tracking & Blinking)
      // -------------------------------------------------------------
      const eyeY = my + 8;
      const eyeSpacing = 9.5;
      const leftEyeX = mx - eyeSpacing;
      const rightEyeX = mx + eyeSpacing;
      const eyeColor = '#060709'; // Deep obsidian pupil

      // Dynamic Eye Tracking Offset (Eyes look towards cursor)
      const lookOffsetX = tiltRef.current.x * 2.2;
      const lookOffsetY = tiltRef.current.y * 1.6;

      ctx.save();
      ctx.fillStyle = eyeColor;
      ctx.strokeStyle = eyeColor;
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const isBlinkingNow = blinkRef.current;
      const isWinkingNow = winkRef.current;

      if (isBlinkingNow) {
        // Natural Smooth Blink: Horizontal closed line
        ctx.beginPath();
        ctx.moveTo(leftEyeX - 4, eyeY);
        ctx.lineTo(leftEyeX + 4, eyeY);
        ctx.moveTo(rightEyeX - 4, eyeY);
        ctx.lineTo(rightEyeX + 4, eyeY);
        ctx.stroke();
      } else if (isWinkingNow) {
        // Playful Wink on click: Left eye winks `^`, right eye looks open
        ctx.beginPath();
        ctx.arc(leftEyeX, eyeY + 1.5, 4.4, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rightEyeX + lookOffsetX, eyeY + lookOffsetY, 3.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(rightEyeX + lookOffsetX + 1.1, eyeY + lookOffsetY - 1.1, 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Open Lively Eyes: Round curious pupils tracking the cursor with specular catchlights
        const currentUnread = unreadRef.current;
        const pupilRadius = currentUnread > 5 ? 4.2 : 3.5;

        // Draw Left and Right Pupils
        ctx.beginPath();
        ctx.arc(leftEyeX + lookOffsetX, eyeY + lookOffsetY, pupilRadius, 0, Math.PI * 2);
        ctx.arc(rightEyeX + lookOffsetX, eyeY + lookOffsetY, pupilRadius, 0, Math.PI * 2);
        ctx.fill();

        // White Specular Catchlight Sparkle in pupils (gives life and depth)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(leftEyeX + lookOffsetX + 1.1, eyeY + lookOffsetY - 1.1, 1.2, 0, Math.PI * 2);
        ctx.arc(rightEyeX + lookOffsetX + 1.1, eyeY + lookOffsetY - 1.1, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Subtle cute warm blush spots on cheeks
        ctx.beginPath();
        ctx.arc(leftEyeX - 7.5, eyeY + 5.5, 2.6, 0, Math.PI * 2);
        ctx.arc(rightEyeX + 7.5, eyeY + 5.5, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 122, 0, 0.35)';
        ctx.fill();
      }

      ctx.restore();

      // -------------------------------------------------------------
      // 5. OBSIDIAN BEZEL & INNER SPECULAR RIM (Glossy Glass Polish)
      // -------------------------------------------------------------
      ctx.restore(); // Restore squircle clip

      // Outer Bezel Rim Line
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(
        cx - squircleRadius,
        cy - squircleRadius,
        squircleRadius * 2,
        squircleRadius * 2,
        cornerRadius,
      );
      ctx.lineWidth = 1.4;
      const rimGrad = ctx.createLinearGradient(
        cx - squircleRadius,
        cy - squircleRadius,
        cx + squircleRadius,
        cy + squircleRadius,
      );
      rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)'); // Top-left light catch
      rimGrad.addColorStop(0.4, 'rgba(255, 122, 0, 0.3)');
      rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
      ctx.strokeStyle = rimGrad;
      ctx.stroke();
      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []); // Run once on mount!

  // Pointer Interaction
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.targetX = nx * 1.6;
    tiltRef.current.targetY = ny * 1.6;

    // Calculate mouse velocity for fluid ripple
    const dx = e.clientX - (lastMousePosRef.current.x || e.clientX);
    const dy = e.clientY - (lastMousePosRef.current.y || e.clientY);
    mouseVelocityRef.current.x = Math.max(Math.min(dx * 0.05, 1.5), -1.5);
    mouseVelocityRef.current.y = Math.max(Math.min(dy * 0.05, 1.5), -1.5);
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseLeave = useCallback(() => {
    tiltRef.current.targetX = 0;
    tiltRef.current.targetY = 0;
    setIsHovered(false);
  }, []);

  // One-Tap Instant Refresh & Inbox Navigation
  const handleClick = useCallback(() => {
    setIsSpinning(true);
    winkRef.current = true;
    setTimeout(() => {
      setIsSpinning(false);
      winkRef.current = false;
    }, 650);

    // Dispatch global refresh event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quant:refresh'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (onClick) {
      onClick();
    } else {
      router.push('/');
    }
  }, [onClick, router]);

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center cursor-pointer select-none group ${className}`}
      style={{ width: size, height: size }}
      title={unreadCount > 0 ? `QuantMail — ${unreadCount} unread` : 'QuantMail — Click to refresh'}
    >
      <motion.div
        className="relative flex items-center justify-center w-full h-full"
        animate={{
          rotate: isSpinning ? 360 : 0,
          scale: isSpinning ? [1, 0.88, 1.12, 1] : isHovered ? 1.08 : 1,
        }}
        transition={{
          rotate: { duration: 0.65, ease: [0.34, 1.56, 0.64, 1] },
          scale: { duration: 0.22, ease: 'easeOut' },
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="w-full h-full drop-shadow-[0_4px_16px_rgba(255,85,0,0.45)]"
        />
      </motion.div>

      {/* ------------------------------------------------------------- */}
      {/* 6. SMART HEAD HUD BADGE (ONLY rendered when unreadCount > 0)  */}
      {/* ------------------------------------------------------------- */}
      {showBadge && unreadCount > 0 && (
        <div className="absolute -top-1 -right-1.5 z-20 pointer-events-none transition-transform duration-200 group-hover:scale-110">
          <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9.5px] font-black text-[#0B0C10] bg-gradient-to-r from-[#FFB700] via-[#FF8A00] to-[#FF5500] rounded-full shadow-[0_0_10px_rgba(255,138,0,0.9)] border border-white/70 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        </div>
      )}
    </div>
  );
}

export default QuantMailLogo;
