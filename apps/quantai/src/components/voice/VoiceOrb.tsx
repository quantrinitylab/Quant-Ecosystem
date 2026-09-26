'use client';

import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  type VoiceState,
  type VoicePersona,
  SOVEREIGN_PERSONAS,
  type VoicePersonaId,
} from './voice-personas';

export interface VoiceOrbProps {
  state: VoiceState;
  personaId?: VoicePersonaId;
  persona?: VoicePersona;
  audioLevel?: number; // 0.0 to 1.0 (mic input level or output amplitude)
  size?: 'sm' | 'md' | 'lg' | 'hero';
  isMuted?: boolean;
  onClick?: () => void;
  className?: string;
  showRipples?: boolean;
}

const SIZE_MAP = {
  sm: {
    container: 'w-24 h-24',
    core: 'w-16 h-16',
    blur: 'blur-xl',
  },
  md: {
    container: 'w-48 h-48',
    core: 'w-32 h-32',
    blur: 'blur-2xl',
  },
  lg: {
    container: 'w-64 h-64',
    core: 'w-44 h-44',
    blur: 'blur-3xl',
  },
  hero: {
    container: 'w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96',
    core: 'w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64',
    blur: 'blur-3xl',
  },
};

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  personaId = 'aura',
  persona: propPersona,
  audioLevel = 0.35,
  size = 'hero',
  isMuted = false,
  onClick,
  className = '',
  showRipples = true,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const currentPersona = propPersona || SOVEREIGN_PERSONAS[personaId] || SOVEREIGN_PERSONAS.aura;
  const sizeConfig = SIZE_MAP[size];

  // Dynamic scale influenced by real-time audio amplitude
  const amplitudeScale = useMemo(() => {
    if (state === 'listening' || state === 'speaking') {
      const clampedLevel = Math.max(0, Math.min(1, audioLevel));
      return 1 + clampedLevel * 0.25;
    }
    return 1;
  }, [state, audioLevel]);

  // Color gradients based on persona and state
  const colors = useMemo(() => {
    const palette = currentPersona.orbGradient[state] || currentPersona.orbGradient.idle;
    return {
      c1: palette[0],
      c2: palette[1],
      c3: palette[2],
    };
  }, [currentPersona, state]);

  // State-specific animation dynamics
  const animationVariants = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        idle: { scale: 1, opacity: 0.9 },
        listening: { scale: amplitudeScale, opacity: 1 },
        thinking: { scale: 1.05, opacity: 1 },
        speaking: { scale: amplitudeScale, opacity: 1 },
      };
    }

    switch (state) {
      case 'idle':
        return {
          scale: [1, 1.04, 0.98, 1],
          rotate: [0, 90, 180, 270, 360],
          transition: {
            scale: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: 24, repeat: Infinity, ease: 'linear' },
          },
        };
      case 'listening':
        return {
          scale: [amplitudeScale, amplitudeScale * 1.08, amplitudeScale * 0.96, amplitudeScale],
          rotate: [0, 45, 0, -45, 0],
          transition: {
            scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
          },
        };
      case 'thinking':
        return {
          scale: [1.02, 1.1, 0.98, 1.02],
          rotate: [0, 180, 360],
          transition: {
            scale: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: 3.5, repeat: Infinity, ease: 'linear' },
          },
        };
      case 'speaking':
        return {
          scale: [amplitudeScale * 0.95, amplitudeScale * 1.15, amplitudeScale],
          rotate: [0, -60, 60, 0],
          transition: {
            scale: { duration: 0.8 + (1 - audioLevel) * 0.6, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
          },
        };
    }
  }, [state, amplitudeScale, audioLevel, prefersReducedMotion]);

  const stateLabels: Record<VoiceState, string> = {
    idle: 'Idle - ready to listen',
    listening: isMuted ? 'Muted' : 'Listening to speech',
    thinking: 'Synthesizing response...',
    speaking: `${currentPersona.name} is speaking`,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`QuantAI Voice Orb - ${stateLabels[state]} - Persona: ${currentPersona.name}`}
      data-testid="voice-orb"
      data-state={state}
      data-persona={currentPersona.id}
      onClick={onClick}
      className={`relative flex items-center justify-center select-none cursor-pointer ${sizeConfig.container} ${className}`}
    >
      {/* Background Multi-layer Soundwave Ripples for Speaking & Listening */}
      {showRipples && !prefersReducedMotion && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Outer Ripple 1 */}
          <motion.div
            className="absolute rounded-full border border-current opacity-20"
            style={{
              color: colors.c1,
              width: '100%',
              height: '100%',
            }}
            animate={
              state === 'speaking' || state === 'listening'
                ? {
                    scale: [1, 1.45, 1.7],
                    opacity: [0.35, 0.15, 0],
                  }
                : state === 'thinking'
                  ? {
                      scale: [1, 1.15, 1],
                      opacity: [0.2, 0.35, 0.2],
                    }
                  : { scale: 1, opacity: 0.1 }
            }
            transition={{
              duration: state === 'thinking' ? 2 : 2.4,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />

          {/* Middle Ripple 2 */}
          <motion.div
            className="absolute rounded-full border border-current opacity-30"
            style={{
              color: colors.c2,
              width: '80%',
              height: '80%',
            }}
            animate={
              state === 'speaking' || state === 'listening'
                ? {
                    scale: [1, 1.35, 1.55],
                    opacity: [0.45, 0.2, 0],
                  }
                : state === 'thinking'
                  ? {
                      scale: [1.1, 1.25, 1.1],
                      rotate: 360,
                    }
                  : { scale: 1, opacity: 0.15 }
            }
            transition={{
              duration: state === 'thinking' ? 3.5 : 2.4,
              repeat: Infinity,
              delay: 0.5,
              ease: state === 'thinking' ? 'linear' : 'easeOut',
            }}
          />

          {/* Inner Frequency Ripple 3 */}
          <motion.div
            className="absolute rounded-full border-2 border-current opacity-40"
            style={{
              color: colors.c3,
              width: '65%',
              height: '65%',
            }}
            animate={
              state === 'speaking'
                ? {
                    scale: [1, 1.25, 1.4],
                    opacity: [0.6, 0.25, 0],
                  }
                : state === 'listening'
                  ? {
                      scale: [1, 1.18, 1],
                      opacity: [0.3, 0.6, 0.3],
                    }
                  : { scale: 1, opacity: 0.2 }
            }
            transition={{
              duration: 1.6,
              repeat: Infinity,
              delay: 0.9,
              ease: 'easeInOut',
            }}
          />
        </div>
      )}

      {/* Luminescent Aura Halo / Volumetric Lighting */}
      <motion.div
        className={`absolute rounded-full pointer-events-none ${sizeConfig.blur}`}
        style={{
          width: '75%',
          height: '75%',
          background: `radial-gradient(circle, ${colors.c1} 0%, ${colors.c2} 45%, ${colors.c3} 80%, transparent 100%)`,
        }}
        animate={{
          scale: state === 'speaking' || state === 'listening' ? [1, 1.2, 1] : [1, 1.08, 1],
          opacity: isMuted ? 0.3 : [0.55, 0.85, 0.55],
        }}
        transition={{
          duration: state === 'speaking' ? 1.4 : 3.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Rotating Orbital Particle Dust for Thinking Mode */}
      {state === 'thinking' && !prefersReducedMotion && (
        <motion.div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        >
          <div
            className="w-3 h-3 rounded-full absolute -top-1 shadow-lg shadow-cyan-400"
            style={{ backgroundColor: colors.c3 }}
          />
          <div
            className="w-2.5 h-2.5 rounded-full absolute -bottom-1 shadow-lg shadow-pink-400"
            style={{ backgroundColor: colors.c1 }}
          />
          <div
            className="w-2 h-2 rounded-full absolute -left-1 shadow-lg shadow-amber-300"
            style={{ backgroundColor: colors.c2 }}
          />
        </motion.div>
      )}

      {/* Central 3D Fluid Animated Audio Sphere Core */}
      <motion.div
        className={`relative rounded-full shadow-2xl flex items-center justify-center overflow-hidden ${sizeConfig.core}`}
        animate={animationVariants as any}
        style={{
          boxShadow: `0 0 50px -10px ${colors.c1}, 0 0 30px -5px ${colors.c2}`,
        }}
      >
        {/* Multi-gradient Fluid Sphere Surface (SVG Mesh Simulation) */}
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full transform scale-110"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id={`orbGrad-${currentPersona.id}`} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="25%" stopColor={colors.c2} stopOpacity="0.9" />
              <stop offset="65%" stopColor={colors.c1} stopOpacity="0.95" />
              <stop offset="100%" stopColor={colors.c3} stopOpacity="1" />
            </radialGradient>
            <linearGradient
              id={`sheenGrad-${currentPersona.id}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
              <stop offset="50%" stopColor="transparent" stopOpacity="0" />
              <stop offset="100%" stopColor={colors.c2} stopOpacity="0.3" />
            </linearGradient>
            <filter id="fluidTurbulence" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency={state === 'speaking' ? '0.04' : '0.02'}
                numOctaves="3"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="12"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>

          {/* Primary 3D Sphere Base */}
          <circle
            cx="100"
            cy="100"
            r="88"
            fill={`url(#orbGrad-${currentPersona.id})`}
            filter="url(#fluidTurbulence)"
          />

          {/* Iridescent Specular Highlighting */}
          <ellipse
            cx="75"
            cy="65"
            rx="50"
            ry="30"
            fill="url(#sheenGrad-aura)"
            transform="rotate(-25 75 65)"
            opacity="0.75"
          />

          {/* Speaking Internal Frequency Waves */}
          {state === 'speaking' && (
            <g opacity="0.6">
              <path
                d="M 40 100 Q 70 80, 100 100 T 160 100"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3.5"
                strokeLinecap="round"
              >
                <animate
                  attributeName="d"
                  dur="1.2s"
                  repeatCount="indefinite"
                  values="
                    M 40 100 Q 70 70, 100 100 T 160 100;
                    M 40 100 Q 70 130, 100 100 T 160 100;
                    M 40 100 Q 70 70, 100 100 T 160 100
                  "
                />
              </path>
              <path
                d="M 50 115 Q 80 135, 100 115 T 150 115"
                fill="none"
                stroke={colors.c3}
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <animate
                  attributeName="d"
                  dur="0.9s"
                  repeatCount="indefinite"
                  values="
                    M 50 115 Q 80 140, 100 115 T 150 115;
                    M 50 115 Q 80 90, 100 115 T 150 115;
                    M 50 115 Q 80 140, 100 115 T 150 115
                  "
                />
              </path>
            </g>
          )}

          {/* Listening Acoustic Frequency Bars Indicator inside Orb */}
          {state === 'listening' && (
            <g opacity="0.75" transform="translate(60, 85)">
              <rect x="0" y="5" width="4" height="20" rx="2" fill="#FFFFFF">
                <animate
                  attributeName="height"
                  values="8;24;8"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
                <animate attributeName="y" values="12;4;12" dur="0.8s" repeatCount="indefinite" />
              </rect>
              <rect x="12" y="0" width="4" height="30" rx="2" fill="#FFFFFF">
                <animate
                  attributeName="height"
                  values="14;34;14"
                  dur="0.6s"
                  repeatCount="indefinite"
                />
                <animate attributeName="y" values="9;-1;9" dur="0.6s" repeatCount="indefinite" />
              </rect>
              <rect x="24" y="2" width="4" height="26" rx="2" fill="#FFFFFF">
                <animate
                  attributeName="height"
                  values="10;28;10"
                  dur="0.75s"
                  repeatCount="indefinite"
                />
                <animate attributeName="y" values="11;3;11" dur="0.75s" repeatCount="indefinite" />
              </rect>
              <rect x="36" y="0" width="4" height="30" rx="2" fill="#FFFFFF">
                <animate
                  attributeName="height"
                  values="12;32;12"
                  dur="0.65s"
                  repeatCount="indefinite"
                />
                <animate attributeName="y" values="10;0;10" dur="0.65s" repeatCount="indefinite" />
              </rect>
              <rect x="48" y="5" width="4" height="20" rx="2" fill="#FFFFFF">
                <animate
                  attributeName="height"
                  values="6;22;6"
                  dur="0.85s"
                  repeatCount="indefinite"
                />
                <animate attributeName="y" values="13;5;13" dur="0.85s" repeatCount="indefinite" />
              </rect>
            </g>
          )}

          {/* Thinking Central Gyro Core */}
          {state === 'thinking' && (
            <g transform="translate(100, 100)">
              <circle r="14" fill="#FFFFFF" opacity="0.85">
                <animate attributeName="r" values="10;18;10" dur="1.5s" repeatCount="indefinite" />
                <animate
                  attributeName="opacity"
                  values="0.6;1;0.6"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          )}
        </svg>

        {/* Muted Visual Indicator Overlay */}
        {isMuted && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <span className="text-2xl text-red-400" aria-label="Microphone muted">
              🔇
            </span>
          </div>
        )}
      </motion.div>

      {/* Floating State Badge underneath Orb */}
      <div className="absolute -bottom-6 flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-700/60 backdrop-blur-md text-[11px] font-medium text-zinc-300 shadow-lg pointer-events-none">
        <span
          className={`w-2 h-2 rounded-full ${
            state === 'listening'
              ? isMuted
                ? 'bg-red-400'
                : 'bg-emerald-400 animate-ping'
              : state === 'thinking'
                ? 'bg-amber-400 animate-spin'
                : state === 'speaking'
                  ? 'bg-purple-400 animate-pulse'
                  : 'bg-zinc-500'
          }`}
        />
        <span>{stateLabels[state]}</span>
      </div>
    </div>
  );
};

export default VoiceOrb;
