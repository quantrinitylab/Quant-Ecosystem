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
}

/**
 * World-Class Living AI Mascot & Fluid Lava Squircle Logo
 * Features:
 * 1. 60FPS Hardware-Accelerated Liquid Lava Fluid Shader (Gold -> Amber -> Crimson -> Obsidian).
 * 2. Signature "M" Quanty Mascot with dynamic eye reactions based on unread inbox count.
 * 3. Smart Head HUD Badge: Emerald Zen '✓' on 0 unread, Glowing Amber pill with count on >0 unread.
 * 4. Interactive pointer tracking, natural blinking, spring bounce, and one-tap instant inbox navigation.
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
  const [isWinking, setIsWinking] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);

  // Physics & Animation State Refs
  const tiltRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const mouseVelocityRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number | null>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Natural Blinking Cycle (Every 3.5s - 6s)
  useEffect(() => {
    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 160);
      const nextDelay = 3500 + Math.random() * 2500;
      blinkTimerRef.current = setTimeout(triggerBlink, nextDelay);
    };

    blinkTimerRef.current = setTimeout(triggerBlink, 3000);
    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, []);

  // 60FPS Fluid Lava & Mascot Canvas Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 2, 3) : 2;
    const res = 160; // High-res internal rendering buffer for ultra-sharp Retina output
    canvas.width = res * dpr;
    canvas.height = res * dpr;

    let time = Math.random() * 100;

    const render = () => {
      time += 0.022;

      // Smooth damping for tilt
      const { targetX, targetY } = tiltRef.current;
      tiltRef.current.x += (targetX - tiltRef.current.x) * 0.12;
      tiltRef.current.y += (targetY - tiltRef.current.y) * 0.12;

      // Mouse velocity decay
      mouseVelocityRef.current.x *= 0.92;
      mouseVelocityRef.current.y *= 0.92;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, res, res);

      const cx = res / 2;
      const cy = res / 2;
      const squircleRadius = 38;
      const cornerRadius = 32;

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
      // Fluid Wave Centers calculated using harmonic trigonometric waves
      const tX = tiltRef.current.x * 12 + mouseVelocityRef.current.x * 20;
      const tY = tiltRef.current.y * 12 + mouseVelocityRef.current.y * 20;

      const p1x = cx - 18 + Math.cos(time * 0.9) * 14 + tX * 0.5;
      const p1y = cy + 22 + Math.sin(time * 0.8) * 12 + tY * 0.5; // Solar Gold center (Bottom-Left)

      const p2x = cx + 8 + Math.sin(time * 1.1) * 16 + tX * 0.7;
      const p2y = cy - 20 + Math.cos(time * 0.95) * 14 + tY * 0.7; // Fire Orange center (Top)

      const p3x = cx + 24 + Math.cos(time * 0.75) * 12 + tX * 0.4;
      const p3y = cy + 18 + Math.sin(time * 1.2) * 14 + tY * 0.4; // Crimson Red center (Bottom-Right)

      // Base Obsidian Background
      ctx.fillStyle = '#060709';
      ctx.fillRect(0, 0, res, res);

      // Layer 1: Crimson Scarlet Fluid Mass (Right / Deep)
      const gradCrimson = ctx.createRadialGradient(p3x, p3y, 4, p3x, p3y, 55);
      gradCrimson.addColorStop(0, '#E52E14');
      gradCrimson.addColorStop(0.4, '#C61E08');
      gradCrimson.addColorStop(0.75, '#7F0A00');
      gradCrimson.addColorStop(1, 'rgba(10, 5, 5, 0)');
      ctx.fillStyle = gradCrimson;
      ctx.fillRect(0, 0, res, res);

      // Layer 2: Electric Fire Orange Silk Swirl (Top-Center)
      const gradOrange = ctx.createRadialGradient(p2x, p2y, 4, p2x, p2y, 58);
      gradOrange.addColorStop(0, '#FF5500');
      gradOrange.addColorStop(0.35, '#FF3300');
      gradOrange.addColorStop(0.7, '#D62000');
      gradOrange.addColorStop(1, 'rgba(15, 6, 2, 0)');
      ctx.fillStyle = gradOrange;
      ctx.fillRect(0, 0, res, res);

      // Layer 3: Intense Solar Gold Flame (Bottom-Left)
      const gradGold = ctx.createRadialGradient(p1x, p1y, 2, p1x, p1y, 48);
      gradGold.addColorStop(0, '#FFC700');
      gradGold.addColorStop(0.28, '#FF8A00');
      gradGold.addColorStop(0.65, '#FF4500');
      gradGold.addColorStop(1, 'rgba(255, 69, 0, 0)');
      ctx.fillStyle = gradGold;
      ctx.fillRect(0, 0, res, res);

      // Layer 4: Deep Obsidian Contrast Vortex Crevices
      const voidX = cx + Math.sin(time * 0.85) * 10 - tX * 0.4;
      const voidY = cy + Math.cos(time * 0.7) * 8 - tY * 0.4;
      const gradVoid = ctx.createRadialGradient(voidX, voidY, 2, voidX, voidY, 40);
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
      const mx = cx + tiltRef.current.x * 3.5;
      const my = cy + tiltRef.current.y * 3.5 + 1;

      // Mascot Dimensions: W: 44, H: 44
      const mw = 44;
      const mh = 44;
      const x0 = mx - mw / 2;
      const y0 = my - mh / 2;

      // Draw Mascot Soft Drop Shadow for real 3D lift
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;

      ctx.beginPath();
      // Start Bottom-Left
      ctx.moveTo(x0 + 8, y0 + mh);
      // Bottom flat edge with rounded bottom-left corner
      ctx.arcTo(x0, y0 + mh, x0, y0 + mh - 8, 8);
      // Left vertical wall
      ctx.lineTo(x0, y0 + 12);
      // Left Ear Outer Curve to Left Peak
      ctx.bezierCurveTo(x0, y0 + 4, x0 + 4, y0, x0 + 8, y0);
      // Left Ear Peak to Center 'M' Valley
      ctx.bezierCurveTo(x0 + 13, y0 + 3, x0 + 17, y0 + 16, x0 + 22, y0 + 16);
      // Center 'M' Valley to Right Ear Peak
      ctx.bezierCurveTo(x0 + 27, y0 + 16, x0 + 31, y0 + 3, x0 + 36, y0);
      // Right Peak to Right Outer Wall
      ctx.bezierCurveTo(x0 + 40, y0, x0 + mw, y0 + 4, x0 + mw, y0 + 12);
      // Right vertical wall
      ctx.lineTo(x0 + mw, y0 + mh - 8);
      // Bottom-Right rounded corner
      ctx.arcTo(x0 + mw, y0 + mh, x0 + mw - 8, y0 + mh, 8);
      // Close back to bottom-left
      ctx.closePath();

      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore(); // restore shadow

      // -------------------------------------------------------------
      // 4. DYNAMIC MASCOT EYES (State Machine by Unread Count & Interaction)
      // -------------------------------------------------------------
      const eyeY = my + 7;
      const eyeSpacing = 8;
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

      const isHappyClosed = unreadCount === 0 || isWinking;

      if (isBlinking) {
        // Natural Blink: Flat closed line for a split millisecond
        ctx.beginPath();
        ctx.moveTo(leftEyeX - 3.5, eyeY);
        ctx.lineTo(leftEyeX + 3.5, eyeY);
        ctx.moveTo(rightEyeX - 3.5, eyeY);
        ctx.lineTo(rightEyeX + 3.5, eyeY);
        ctx.stroke();
      } else if (isHappyClosed) {
        // Joyful Closed Arch Smiling Eyes: "◠  ◠" (Matching user image reference)
        // Left Eye Arch
        ctx.beginPath();
        ctx.arc(leftEyeX, eyeY + 1.5, 4.2, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();

        // Right Eye Arch
        ctx.beginPath();
        ctx.arc(rightEyeX, eyeY + 1.5, 4.2, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();

        // Subtle cute warm blush spots on cheeks when 0 unread
        if (unreadCount === 0) {
          ctx.beginPath();
          ctx.arc(leftEyeX - 6.5, eyeY + 5, 2.5, 0, Math.PI * 2);
          ctx.arc(rightEyeX + 6.5, eyeY + 5, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 122, 0, 0.35)';
          ctx.fill();
        }
      } else if (unreadCount <= 5) {
        // Low Unread (1 - 5): Curious Round Pupils tracking the mouse
        ctx.beginPath();
        ctx.arc(leftEyeX + lookOffsetX, eyeY + lookOffsetY, 3.2, 0, Math.PI * 2);
        ctx.arc(rightEyeX + lookOffsetX, eyeY + lookOffsetY, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // White Specular Catchlight Sparkle in pupils
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(leftEyeX + lookOffsetX + 1, eyeY + lookOffsetY - 1, 1.1, 0, Math.PI * 2);
        ctx.arc(rightEyeX + lookOffsetX + 1, eyeY + lookOffsetY - 1, 1.1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // High Unread (6+): Alert Energetic Wide Pupils
        ctx.beginPath();
        ctx.arc(leftEyeX + lookOffsetX, eyeY + lookOffsetY, 3.8, 0, Math.PI * 2);
        ctx.arc(rightEyeX + lookOffsetX, eyeY + lookOffsetY, 3.8, 0, Math.PI * 2);
        ctx.fill();

        // Specular Catchlights
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(leftEyeX + lookOffsetX + 1.2, eyeY + lookOffsetY - 1.2, 1.3, 0, Math.PI * 2);
        ctx.arc(rightEyeX + lookOffsetX + 1.2, eyeY + lookOffsetY - 1.2, 1.3, 0, Math.PI * 2);
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
  }, [unreadCount, isWinking, isBlinking]);

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
    setIsWinking(true);
    setTimeout(() => {
      setIsSpinning(false);
      setIsWinking(false);
    }, 700);

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
      title={
        unreadCount > 0
          ? `QuantMail — ${unreadCount} unread`
          : 'QuantMail — You are all caught up! (Click to refresh)'
      }
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
      {/* 6. SMART HEAD HUD BADGE (Zen '✓' on 0, Amber Pill on >0)     */}
      {/* ------------------------------------------------------------- */}
      {showBadge && (
        <div className="absolute -top-1 -right-1.5 z-20 pointer-events-none transition-transform duration-200 group-hover:scale-110">
          {unreadCount > 0 ? (
            // Amber Glowing Pill Badge with unread count
            <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9.5px] font-black text-[#0B0C10] bg-gradient-to-r from-[#FFB700] via-[#FF8A00] to-[#FF5500] rounded-full shadow-[0_0_10px_rgba(255,138,0,0.9)] border border-white/70 animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : (
            // Emerald Zen Shield with Checkmark '✓'
            <span
              className="flex items-center justify-center size-4 rounded-full bg-[#052E16]/90 border border-emerald-400 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]"
              title="Inbox Zero (All caught up)"
            >
              <svg
                className="size-2.5 stroke-[3.5]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
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
