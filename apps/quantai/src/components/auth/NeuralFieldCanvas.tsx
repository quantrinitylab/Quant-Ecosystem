'use client';

import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number; // -1 to 1 for 3D depth simulation
  vx: number;
  vy: number;
  vz: number;
  baseRadius: number;
  phase: number;
  speed: number;
  colorType: 'violet' | 'sapphire' | 'cyan';
}

interface NeuralFieldCanvasProps {
  className?: string;
  particleCount?: number;
  interactive?: boolean;
}

export function NeuralFieldCanvas({
  className = '',
  particleCount = 54,
  interactive = true,
}: NeuralFieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    // High-DPI screen support capped at 2 to minimize GPU / memory overhead
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Mouse tracker with gentle lerp
    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = width / 2;
    let targetMouseY = height / 2;
    let isHovering = false;

    // Color palettes: Luxury violet (#8B5CF6), sapphire (#3B82F6), and celestial cyan (#38BDF8)
    const colorMap = {
      violet: { r: 139, g: 92, b: 246 },
      sapphire: { r: 59, g: 130, b: 246 },
      cyan: { r: 56, g: 189, b: 248 },
    };

    // Initialize particles in an orbital neural cloud
    const particles: Particle[] = [];
    const colorKeys: Array<'violet' | 'sapphire' | 'cyan'> = ['violet', 'sapphire', 'cyan'];

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
      const radius = Math.min(width, height) * (0.15 + Math.random() * 0.45);
      const cx = width / 2 + Math.cos(angle) * radius;
      const cy = height / 2 + Math.sin(angle) * (radius * 0.65); // Elliptical 3D orbital tilt

      particles.push({
        x: cx,
        y: cy,
        z: (Math.random() - 0.5) * 2, // -1 to 1 depth
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        vz: (Math.random() - 0.5) * 0.005,
        baseRadius: 1.4 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
        speed: 0.008 + Math.random() * 0.012,
        colorType: colorKeys[i % colorKeys.length],
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    const handlePointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      targetMouseX = e.clientX - rect.left;
      targetMouseY = e.clientY - rect.top;
      isHovering = true;
    };

    const handlePointerLeave = () => {
      isHovering = false;
      targetMouseX = width / 2;
      targetMouseY = height / 2;
    };

    window.addEventListener('resize', handleResize, { passive: true });
    if (interactive) {
      window.addEventListener('mousemove', handlePointerMove, { passive: true });
      window.addEventListener('mouseleave', handlePointerLeave, { passive: true });
    }

    let lastTime = performance.now();
    let orbitalAngle = 0;

    const render = (time: number) => {
      const dt = Math.min(time - lastTime, 40); // Cap frame delta to avoid sudden leaps
      lastTime = time;

      // Clear frame with zero trace
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse lerp
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      orbitalAngle += 0.0015;

      // Max distance for synaptic filaments
      const maxDistance = Math.min(width, height) * 0.22;
      const connectionDistSq = maxDistance * maxDistance;

      // 1. Update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!prefersReducedMotion) {
          p.phase += p.speed;
          // Harmonic wave drift
          p.x += p.vx + Math.cos(p.phase) * 0.2;
          p.y += p.vy + Math.sin(p.phase * 0.8) * 0.2;
          p.z += p.vz;

          // Wrap z-depth smoothly
          if (p.z > 1) {
            p.z = 1;
            p.vz = -Math.abs(p.vz);
          } else if (p.z < -1) {
            p.z = -1;
            p.vz = Math.abs(p.vz);
          }

          // Gentle mouse deflection field
          if (isHovering && interactive) {
            const dx = p.x - mouseX;
            const dy = p.y - mouseY;
            const distSq = dx * dx + dy * dy;
            const mouseRadius = 140;
            if (distSq < mouseRadius * mouseRadius && distSq > 0) {
              const dist = Math.sqrt(distSq);
              const force = (1 - dist / mouseRadius) * 0.6;
              p.x += (dx / dist) * force;
              p.y += (dy / dist) * force;
            }
          }

          // Boundary bounce / gentle wrap
          const margin = 40;
          if (p.x < -margin) p.x = width + margin;
          if (p.x > width + margin) p.x = -margin;
          if (p.y < -margin) p.y = height + margin;
          if (p.y > height + margin) p.y = -margin;
        }
      }

      // 2. Draw Synaptic Connections (filament threads between nearby nodes)
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < connectionDistSq) {
            const dist = Math.sqrt(distSq);
            // Alpha falls off with distance and average depth
            const depthFactor = (p1.z + p2.z + 2) / 4; // 0 to 1
            const baseAlpha = (1 - dist / maxDistance) * 0.32 * (0.4 + 0.6 * depthFactor);

            if (baseAlpha > 0.015) {
              const c1 = colorMap[p1.colorType];
              const c2 = colorMap[p2.colorType];

              const gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
              gradient.addColorStop(0, `rgba(${c1.r}, ${c1.g}, ${c1.b}, ${baseAlpha.toFixed(3)})`);
              gradient.addColorStop(1, `rgba(${c2.r}, ${c2.g}, ${c2.b}, ${baseAlpha.toFixed(3)})`);

              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = gradient;
              ctx.lineWidth = 0.85 * (0.6 + 0.4 * depthFactor);
              ctx.stroke();
            }
          }
        }
      }

      // 3. Draw Synaptic Core Nodes & Ambient Halos
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const depth = (p.z + 1) / 2; // 0 to 1
        const scale = 0.6 + depth * 0.7; // 3D perspective scale
        const radius = p.baseRadius * scale;
        const col = colorMap[p.colorType];
        const pulse = 0.85 + Math.sin(p.phase * 2) * 0.15;
        const alpha = (0.35 + depth * 0.55) * pulse;

        // Outer ambient glow halo
        const glowRadius = radius * 4.2;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        glow.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, ${(alpha * 0.4).toFixed(3)})`);
        glow.addColorStop(0.5, `rgba(${col.r}, ${col.g}, ${col.b}, ${(alpha * 0.12).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${col.r}, ${col.g}, ${col.b}, 0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Inner synaptic core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${alpha.toFixed(3)})`;
        ctx.fill();

        // Ultra-bright central highlight for front particles
        if (depth > 0.65) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.6 * depth).toFixed(3)})`;
          ctx.fill();
        }
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    // Initial render
    if (prefersReducedMotion) {
      render(performance.now());
    } else {
      animationFrameId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (interactive) {
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('mouseleave', handlePointerLeave);
      }
    };
  }, [particleCount, interactive]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
export default NeuralFieldCanvas;
