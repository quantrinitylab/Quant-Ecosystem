import React, { useEffect, useRef, memo } from 'react';

/**
 * AuroraMeshCanvas
 * 
 * High-performance 60fps ambient fluid aurora mesh canvas.
 * Renders undulating organic wave harmonics across four key stops:
 * - Sunset coral (#FF5E62)
 * - Electric magenta (#D946EF)
 * - Solar amber (#FF8C42)
 * - Deep violet (#7C3AED)
 * 
 * Deep obsidian slate backdrop: #090A10
 * Pure HTML5 Canvas 2D math: zero bundle bloat, hardware-accelerated.
 */
export const AuroraMeshCanvas: React.FC<{
  className?: string;
  intensity?: number;
}> = memo(({ className = '', intensity = 1.0 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let startTime = performance.now();

    // Harmonic wave node definitions
    const orbs = [
      {
        baseX: 0.25,
        baseY: 0.35,
        ampX: 0.18,
        ampY: 0.15,
        freqX: 0.00042,
        freqY: 0.00058,
        color: 'rgba(255, 94, 98, 0.45)', // Sunset coral #FF5E62
        colorEnd: 'rgba(255, 94, 98, 0)',
        radiusRatio: 0.55,
      },
      {
        baseX: 0.75,
        baseY: 0.28,
        ampX: 0.22,
        ampY: 0.18,
        freqX: 0.00035,
        freqY: 0.00048,
        color: 'rgba(217, 70, 239, 0.40)', // Electric magenta #D946EF
        colorEnd: 'rgba(217, 70, 239, 0)',
        radiusRatio: 0.62,
      },
      {
        baseX: 0.45,
        baseY: 0.72,
        ampX: 0.20,
        ampY: 0.16,
        freqX: 0.00052,
        freqY: 0.00038,
        color: 'rgba(255, 140, 66, 0.35)', // Solar amber #FF8C42
        colorEnd: 'rgba(255, 140, 66, 0)',
        radiusRatio: 0.50,
      },
      {
        baseX: 0.65,
        baseY: 0.65,
        ampX: 0.16,
        ampY: 0.20,
        freqX: 0.00028,
        freqY: 0.00044,
        color: 'rgba(124, 58, 237, 0.45)', // Deep violet #7C3AED
        colorEnd: 'rgba(124, 58, 237, 0)',
        radiusRatio: 0.68,
      },
      {
        baseX: 0.50,
        baseY: 0.45,
        ampX: 0.12,
        ampY: 0.14,
        freqX: 0.00062,
        freqY: 0.00052,
        color: 'rgba(236, 72, 153, 0.25)', // Shimmer rose
        colorEnd: 'rgba(236, 72, 153, 0)',
        radiusRatio: 0.42,
      },
    ];

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Undulating wave ribbon drawer
    const drawWaveRibbon = (
      time: number,
      baseYRatio: number,
      amplitude: number,
      freq: number,
      speed: number,
      colorGradStops: [string, string],
      thickness: number,
    ) => {
      const baseY = height * baseYRatio;
      const step = Math.max(16, Math.floor(width / 45));

      ctx.beginPath();
      let first = true;
      for (let x = -20; x <= width + 20; x += step) {
        const t = time * speed;
        // Multi-frequency sine superposition: primary wave + secondary overtone + tertiary modulation
        const yOffset =
          Math.sin(x * freq + t) * amplitude +
          Math.sin(x * (freq * 2.3) - t * 0.7) * (amplitude * 0.45) +
          Math.cos(x * (freq * 0.7) + t * 1.3) * (amplitude * 0.3);

        const y = baseY + yOffset;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.lineWidth = thickness;
      const grad = ctx.createLinearGradient(0, baseY - amplitude, width, baseY + amplitude);
      grad.addColorStop(0, colorGradStops[0]);
      grad.addColorStop(1, colorGradStops[1]);
      ctx.strokeStyle = grad;
      ctx.stroke();
    };

    const render = (now: number) => {
      const elapsed = (now - startTime) * (prefersReducedMotion ? 0.05 : 1.0);

      // Rich obsidian slate background: #090A10
      ctx.fillStyle = '#090A10';
      ctx.fillRect(0, 0, width, height);

      // Layer 1: Ambient undulating radial harmonic orbs with screen blending
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const minDimension = Math.min(width, height);

      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i]!;
        const cx =
          (orb.baseX +
            Math.sin(elapsed * orb.freqX + i * 1.7) * orb.ampX +
            Math.cos(elapsed * (orb.freqX * 0.5) + i) * (orb.ampX * 0.4)) *
          width;
        const cy =
          (orb.baseY +
            Math.cos(elapsed * orb.freqY + i * 2.1) * orb.ampY +
            Math.sin(elapsed * (orb.freqY * 0.6) + i * 0.5) * (orb.ampY * 0.35)) *
          height;

        const radius = orb.radiusRatio * minDimension * (1 + Math.sin(elapsed * 0.0004 + i) * 0.08) * intensity;
        if (radius <= 0) continue;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, orb.color);
        grad.addColorStop(0.65, orb.color.replace(/[\d\.]+\)$/, '0.12)'));
        grad.addColorStop(1, orb.colorEnd);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Layer 2: Iridescent fluid undulating ribbon waves (harmonic interference)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(12px)';

      // Wave Ribbon 1: Sunset coral -> Solar amber crest
      drawWaveRibbon(
        elapsed,
        0.38,
        minDimension * 0.08,
        0.0022,
        0.00075,
        ['rgba(255, 94, 98, 0.35)', 'rgba(255, 140, 66, 0.28)'],
        minDimension * 0.06,
      );

      // Wave Ribbon 2: Electric magenta -> Deep violet flow
      drawWaveRibbon(
        elapsed,
        0.58,
        minDimension * 0.10,
        0.0018,
        -0.00065,
        ['rgba(217, 70, 239, 0.30)', 'rgba(124, 58, 237, 0.38)'],
        minDimension * 0.08,
      );

      // Wave Ribbon 3: High-frequency solar amber shimmer
      drawWaveRibbon(
        elapsed,
        0.72,
        minDimension * 0.06,
        0.0031,
        0.0009,
        ['rgba(255, 140, 66, 0.22)', 'rgba(255, 94, 98, 0.25)'],
        minDimension * 0.04,
      );

      ctx.restore();

      // Layer 3: Subtle atmospheric vignette overlay to lock in cinematic contrast
      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        minDimension * 0.35,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75,
      );
      vignette.addColorStop(0, 'rgba(9, 10, 16, 0)');
      vignette.addColorStop(0.7, 'rgba(9, 10, 16, 0.35)');
      vignette.addColorStop(1, 'rgba(9, 10, 16, 0.82)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [intensity]);

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden select-none -z-10 ${className}`}
      aria-hidden="true"
    >
      {/* High-speed CSS fallback gradient before JS canvas mounts */}
      <div
        className="absolute inset-0 bg-[#090A10]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(255, 94, 98, 0.18) 0%, transparent 50%), radial-gradient(circle at 80% 25%, rgba(217, 70, 239, 0.18) 0%, transparent 55%), radial-gradient(circle at 50% 75%, rgba(124, 58, 237, 0.2) 0%, transparent 60%), radial-gradient(circle at 70% 65%, rgba(255, 140, 66, 0.15) 0%, transparent 50%)',
        }}
      />
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
});

AuroraMeshCanvas.displayName = 'AuroraMeshCanvas';
