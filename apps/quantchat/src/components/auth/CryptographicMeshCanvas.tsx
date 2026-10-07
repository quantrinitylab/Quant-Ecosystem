'use client';

import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  pulsePhase: number;
  pulseSpeed: number;
  isCyan: boolean;
  isSpecialNode: boolean; // Geometric diamond glyph node
}

export interface CryptographicMeshCanvasProps {
  className?: string;
  nodeCount?: number;
}

export const CryptographicMeshCanvas: React.FC<CryptographicMeshCanvasProps> = ({
  className = '',
  nodeCount = 42,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number | null = null;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Respect user's motion preferences
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Mouse coordinates in canvas-space
    let mouseX = -1000;
    let mouseY = -1000;
    let mouseActive = false;
    let mouseFade = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      mouseActive = true;
    };

    const handleMouseLeave = () => {
      mouseActive = false;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true });

    let particles: Particle[] = [];

    const initParticles = (w: number, h: number) => {
      const count = Math.min(nodeCount, Math.floor((w * h) / 18000) + 20);
      const newParticles: Particle[] = [];

      for (let i = 0; i < count; i++) {
        newParticles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          radius: Math.random() * 1.5 + 1.2,
          baseAlpha: Math.random() * 0.4 + 0.35,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.01,
          isCyan: i % 2 === 0,
          isSpecialNode: i % 6 === 0,
        });
      }
      particles = newParticles;
    };

    const handleResize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      if (particles.length === 0) {
        initParticles(width, height);
      }
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
      if (prefersReducedMotion) {
        renderFrame(0);
      }
    });
    resizeObserver.observe(canvas);

    // Frame rendering function
    let lastTime = 0;
    const maxLinkDistance = 125;
    const mouseRadius = 140;

    const renderFrame = (timestamp: number) => {
      if (!ctx || width === 0 || height === 0) return;

      const elapsed = timestamp - lastTime;
      lastTime = timestamp;

      // Soft mouse active interpolation
      if (mouseActive && mouseFade < 1) {
        mouseFade = Math.min(1, mouseFade + 0.08);
      } else if (!mouseActive && mouseFade > 0) {
        mouseFade = Math.max(0, mouseFade - 0.04);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Dark obsidian background: #080B12
      ctx.fillStyle = '#080B12';
      ctx.fillRect(0, 0, width, height);

      // Ambient Luminance Pulses: Emerald (#10B981) & Cyan (#06B6D4)
      const emeraldPulse = Math.sin(timestamp * 0.0008) * 0.04 + 0.08;
      const cyanPulse = Math.cos(timestamp * 0.0007) * 0.03 + 0.07;

      // Emerald ambient pulse at top-left
      const emeraldGrad = ctx.createRadialGradient(
        width * 0.2,
        height * 0.25,
        0,
        width * 0.2,
        height * 0.25,
        Math.max(width * 0.5, 300),
      );
      emeraldGrad.addColorStop(0, `rgba(16, 185, 129, ${emeraldPulse})`);
      emeraldGrad.addColorStop(1, 'rgba(8, 11, 18, 0)');
      ctx.fillStyle = emeraldGrad;
      ctx.fillRect(0, 0, width, height);

      // Cyan ambient pulse at bottom-right
      const cyanGrad = ctx.createRadialGradient(
        width * 0.8,
        height * 0.75,
        0,
        width * 0.8,
        height * 0.75,
        Math.max(width * 0.5, 320),
      );
      cyanGrad.addColorStop(0, `rgba(6, 182, 212, ${cyanPulse})`);
      cyanGrad.addColorStop(1, 'rgba(8, 11, 18, 0)');
      ctx.fillStyle = cyanGrad;
      ctx.fillRect(0, 0, width, height);

      // Update and draw particles
      const pCount = particles.length;

      // 1. Position update (skip drift if reduced motion)
      if (!prefersReducedMotion) {
        for (let i = 0; i < pCount; i++) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;

          // Wrap edges smoothly
          if (p.x < -10) p.x = width + 10;
          else if (p.x > width + 10) p.x = -10;

          if (p.y < -10) p.y = height + 10;
          else if (p.y > height + 10) p.y = -10;

          // Soft cursor repulsion / reaction
          if (mouseFade > 0) {
            const dx = p.x - mouseX;
            const dy = p.y - mouseY;
            const dist = Math.hypot(dx, dy);
            if (dist < mouseRadius && dist > 0) {
              const force = (1 - dist / mouseRadius) * 0.6 * mouseFade;
              p.x += (dx / dist) * force;
              p.y += (dy / dist) * force;
            }
          }

          p.pulsePhase += p.pulseSpeed;
        }
      }

      // 2. Cryptographic Mesh Connections
      ctx.lineWidth = 0.8;
      for (let i = 0; i < pCount; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < pCount; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.hypot(dx, dy);

          if (dist < maxLinkDistance) {
            const ratio = 1 - dist / maxLinkDistance;
            const linkAlpha = ratio * 0.22;

            ctx.strokeStyle = p1.isCyan
              ? `rgba(6, 182, 212, ${linkAlpha})`
              : `rgba(16, 185, 129, ${linkAlpha})`;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }

        // Shimmering connection to cursor if close
        if (mouseFade > 0) {
          const cdx = p1.x - mouseX;
          const cdy = p1.y - mouseY;
          const cdist = Math.hypot(cdx, cdy);
          if (cdist < mouseRadius) {
            const cRatio = (1 - cdist / mouseRadius) * 0.3 * mouseFade;
            ctx.strokeStyle = `rgba(56, 189, 248, ${cRatio})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mouseX, mouseY);
            ctx.stroke();
          }
        }
      }

      // 3. Draw cryptographic nodes
      for (let i = 0; i < pCount; i++) {
        const p = particles[i];
        const pulse = Math.sin(p.pulsePhase) * 0.2 + 0.8;
        const currentAlpha = p.baseAlpha * pulse;

        if (p.isSpecialNode) {
          // Precision Diamond Cryptographic Glyph Node
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.strokeStyle = p.isCyan
            ? `rgba(6, 182, 212, ${currentAlpha * 0.9})`
            : `rgba(16, 185, 129, ${currentAlpha * 0.9})`;
          ctx.fillStyle = p.isCyan
            ? `rgba(6, 182, 212, ${currentAlpha * 0.4})`
            : `rgba(16, 185, 129, ${currentAlpha * 0.4})`;
          ctx.lineWidth = 1;

          const s = p.radius * 1.8;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else {
          // Subtle circular node with faint glow
          ctx.fillStyle = p.isCyan
            ? `rgba(6, 182, 212, ${currentAlpha})`
            : `rgba(16, 185, 129, ${currentAlpha})`;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(renderFrame);
      }
    };

    if (prefersReducedMotion) {
      renderFrame(0);
    } else {
      animationFrameId = requestAnimationFrame(renderFrame);
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [nodeCount]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="cryptographic-mesh-canvas"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
};

export default CryptographicMeshCanvas;
