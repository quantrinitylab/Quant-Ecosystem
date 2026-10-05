'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  targetAlpha: number;
  pulseSpeed: number;
  driftX: number;
  driftY: number;
  isAmber: boolean;
}

interface TitaniumGridCanvasProps {
  className?: string;
  gridSize?: number;
  particleCount?: number;
}

/**
 * Ambient subtle obsidian titanium grid with microscopic starfield and subtle particle luminance.
 * Precision-engineered for Linear / Superhuman executive parity.
 */
export function TitaniumGridCanvas({
  className = 'pointer-events-none fixed inset-0 z-0 h-full w-full',
  gridSize = 48,
  particleCount = 50,
}: TitaniumGridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Detect prefers-reduced-motion
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Initialize particles
    const particles: Particle[] = [];
    const initParticles = (w: number, h: number) => {
      particles.length = 0;
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          size: 0.6 + Math.random() * 0.9,
          alpha: 0.1 + Math.random() * 0.35,
          targetAlpha: 0.1 + Math.random() * 0.45,
          pulseSpeed: 0.005 + Math.random() * 0.012,
          driftX: (Math.random() - 0.5) * 0.12,
          driftY: (Math.random() - 0.5) * 0.12,
          isAmber: Math.random() < 0.2, // ~20% subtle amber stars
        });
      }
    };

    const handleResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      initParticles(width, height);

      if (reducedMotion) {
        drawFrame();
      }
    };

    const drawFrame = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // 1. Deep Obsidian Titanium Base
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.35,
        50,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85,
      );
      bgGrad.addColorStop(0, '#0C0E14');
      bgGrad.addColorStop(0.5, '#08090C');
      bgGrad.addColorStop(1, '#050608');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle central amber glow nexus
      const amberGlow = ctx.createRadialGradient(
        width * 0.5,
        height * 0.38,
        0,
        width * 0.5,
        height * 0.38,
        Math.min(width, height) * 0.65,
      );
      amberGlow.addColorStop(0, 'rgba(255, 140, 66, 0.045)');
      amberGlow.addColorStop(0.5, 'rgba(255, 140, 66, 0.012)');
      amberGlow.addColorStop(1, 'rgba(255, 140, 66, 0)');
      ctx.fillStyle = amberGlow;
      ctx.fillRect(0, 0, width, height);

      // 3. Hairline Titanium Grid
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.022)';
      ctx.lineWidth = 1;

      // Vertical lines
      const offsetX = (width % gridSize) / 2;
      for (let x = offsetX; x <= width; x += gridSize) {
        ctx.moveTo(Math.floor(x) + 0.5, 0);
        ctx.lineTo(Math.floor(x) + 0.5, height);
      }

      // Horizontal lines
      const offsetY = (height % gridSize) / 2;
      for (let y = offsetY; y <= height; y += gridSize) {
        ctx.moveTo(0, Math.floor(y) + 0.5);
        ctx.lineTo(width, Math.floor(y) + 0.5);
      }
      ctx.stroke();

      // 4. Microscopic Intersection Crosshairs
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      for (let x = offsetX; x <= width; x += gridSize) {
        for (let y = offsetY; y <= height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(Math.floor(x) + 0.5, Math.floor(y) + 0.5, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. Microscopic Starfield & Particle Luminance
      for (const p of particles) {
        if (!reducedMotion) {
          p.x += p.driftX;
          p.y += p.driftY;

          // Wrap boundaries
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;

          // Alpha pulsing
          if (Math.abs(p.alpha - p.targetAlpha) < 0.02) {
            p.targetAlpha = 0.1 + Math.random() * 0.45;
          } else {
            p.alpha += (p.targetAlpha - p.alpha) * p.pulseSpeed;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.isAmber
          ? `rgba(255, 160, 90, ${p.alpha * 1.1})`
          : `rgba(230, 238, 250, ${p.alpha})`;
        ctx.fill();
      }

      ctx.restore();
    };

    const animate = () => {
      drawFrame();
      animationFrameId = requestAnimationFrame(animate);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    if (!reducedMotion) {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [gridSize, particleCount]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
    />
  );
}
