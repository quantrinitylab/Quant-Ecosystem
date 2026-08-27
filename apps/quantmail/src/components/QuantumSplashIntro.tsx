'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandWordmark } from './BrandWordmark';

export function QuantumSplashIntro({ onComplete }: { onComplete?: () => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [phase, setPhase] = useState<'particles' | 'assemble' | 'glow' | 'exit'>('particles');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    // Only show once per session for instant snappiness on navigation
    try {
      const shown = sessionStorage.getItem('quant_splash_shown');
      if (shown) {
        if (onComplete) onComplete();
        return;
      }
      sessionStorage.setItem('quant_splash_shown', 'true');
    } catch {
      // ignore storage errors
    }

    setIsVisible(true);

    const t1 = setTimeout(() => setPhase('assemble'), 250);
    const t2 = setTimeout(() => setPhase('glow'), 600);
    const t3 = setTimeout(() => {
      setPhase('exit');
      setTimeout(() => {
        setIsVisible(false);
        if (onComplete) onComplete();
      }, 350);
    }, 1100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  // Particle vortex canvas animation
  useEffect(() => {
    if (!isVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      color: string;
    }> = [];

    const colors = ['#FF5500', '#FF8C42', '#FFAA00', '#FFD200', '#FFFFFF'];
    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * Math.min(width, height) * 0.45;
      particles.push({
        x: width / 2 + Math.cos(angle) * dist,
        y: height / 2 + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 2.5 + 1,
        alpha: Math.random() * 0.8 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let running = true;
    const render = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      for (const p of particles) {
        // Gravitate toward center
        const dx = cx - p.x;
        const dy = cy - p.y;
        p.vx += dx * 0.003;
        p.vy += dy * 0.003;
        p.x += p.vx;
        p.y += p.vy;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      window.removeEventListener('resize', onResize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === 'exit' ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: 'easeInOut' }}
        onClick={() => {
          setIsVisible(false);
          if (onComplete) onComplete();
        }}
        className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#07080A] select-none cursor-pointer overflow-hidden"
      >
        {/* Background Particle Canvas */}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

        {/* Central Radial Light Glow */}
        <motion.div
          animate={{
            scale: phase === 'glow' ? 1.4 : 1,
            opacity: phase === 'glow' ? 0.75 : 0.4,
          }}
          transition={{ duration: 0.5 }}
          className="absolute size-96 rounded-full bg-gradient-to-r from-[#FF5500]/40 via-[#FF8C42]/50 to-[#FFAA00]/30 blur-3xl pointer-events-none"
        />

        {/* Central Hero Assembly Box */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 10 }}
          animate={{
            scale: phase === 'exit' ? 0.85 : 1,
            opacity: phase === 'exit' ? 0 : 1,
            y: phase === 'exit' ? -20 : 0,
          }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="relative z-10 flex flex-col items-center gap-5 text-center"
        >
          {/* 3D Laser Envelope Tile */}
          <div className="relative size-24 flex items-center justify-center">
            {/* Outer Pulsating Ring */}
            <motion.div
              animate={{ rotate: 360, scale: [1, 1.08, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-3xl border border-[#FF8C42]/40 shadow-[0_0_30px_rgba(255,140,66,0.5)]"
            />

            {/* Inner Obsidian Tile */}
            <div className="size-20 rounded-2xl bg-gradient-to-b from-[#20232E] to-[#0A0B0E] border border-[#FF8C42]/60 flex items-center justify-center shadow-2xl relative overflow-hidden">
              {/* Laser Seam Envelope SVG */}
              <svg className="size-11 text-[#FF8C42]" viewBox="0 0 24 24" fill="none">
                <rect
                  x="2"
                  y="4"
                  width="20"
                  height="16"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M2.5 4.5L12 13.5L21.5 4.5"
                  stroke="#FF8C42"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Quantum Core Light Glint */}
              <motion.span
                animate={{ scale: [1, 1.6, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="absolute size-3 rounded-full bg-white shadow-[0_0_15px_#FF8C42]"
                style={{ top: '56%', left: '44%' }}
              />
            </div>
          </div>

          {/* Flowing Cursive Signature Wordmark */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="flex flex-col items-center"
          >
            <BrandWordmark app="mail" size="text-4xl" />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-xs tracking-widest text-[#A1A4AC] uppercase font-mono mt-1"
            >
              Zero-Noise Intelligence
            </motion.p>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
