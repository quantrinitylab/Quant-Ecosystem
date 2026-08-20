'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface QuantMailLogoProps {
  size?: number;
  unreadCount?: number;
  showBadge?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * World-Class Luxury Origami Prism Mail Icon (Zero Muddy Canvas, Pure Crisp Vector)
 */
export function QuantMailLogo({
  size = 32,
  unreadCount = 0,
  showBadge = true,
  className = '',
  onClick,
}: QuantMailLogoProps) {
  const [isSpinning, setIsSpinning] = useState(false);

  const handleClick = () => {
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 700);
    if (onClick) onClick();
  };

  return (
    <div
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center cursor-pointer select-none group ${className}`}
      style={{ width: size, height: size }}
      title="QuantMail — Click to refresh"
    >
      <motion.div
        className="relative flex items-center justify-center w-full h-full"
        animate={{
          rotate: isSpinning ? 360 : 0,
          scale: isSpinning ? [1, 0.9, 1.05, 1] : 1,
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        transition={{
          rotate: { duration: 0.65, ease: [0.34, 1.56, 0.64, 1] },
          scale: { duration: 0.2 },
        }}
      >
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_2px_12px_rgba(255,122,0,0.45)]"
        >
          <defs>
            {/* Primary Saffron/Amber Gradient */}
            <linearGradient
              id="qm_grad_top"
              x1="6"
              y1="8"
              x2="42"
              y2="28"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFA726" />
              <stop offset="50%" stopColor="#FF7A00" />
              <stop offset="100%" stopColor="#E65100" />
            </linearGradient>

            {/* Bottom Fold Shadow Gradient */}
            <linearGradient
              id="qm_grad_bottom"
              x1="8"
              y1="20"
              x2="40"
              y2="42"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FF8F00" />
              <stop offset="100%" stopColor="#BF360C" />
            </linearGradient>

            {/* Flap Highlight Specular */}
            <linearGradient
              id="qm_grad_flap"
              x1="12"
              y1="10"
              x2="36"
              y2="30"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFE082" />
              <stop offset="60%" stopColor="#FF9800" />
              <stop offset="100%" stopColor="#F57C00" />
            </linearGradient>

            {/* Inner Core Glow */}
            <radialGradient id="qm_core_glow" cx="24" cy="24" r="16" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFF8E1" stopOpacity="0.9" />
              <stop offset="40%" stopColor="#FFA726" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#FF6D00" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Ambient Glow */}
          <circle cx="24" cy="24" r="18" fill="url(#qm_core_glow)" />

          {/* Envelope Body Base (Sleek Isometric Chamfered) */}
          <rect
            x="6"
            y="10"
            width="36"
            height="28"
            rx="7"
            fill="#121318"
            stroke="url(#qm_grad_top)"
            strokeWidth="2.2"
          />

          {/* Bottom Fold Wing */}
          <path
            d="M6 32L19.5 22L24 25.5L28.5 22L42 32V31C42 34.866 38.866 38 35 38H13C9.134 38 6 34.866 6 31V32Z"
            fill="url(#qm_grad_bottom)"
            opacity="0.35"
          />

          {/* Diagonal Seam Lines */}
          <path
            d="M7 36L19 23"
            stroke="#FF8F00"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M41 36L29 23"
            stroke="#FF8F00"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.6"
          />

          {/* Top Envelope Flap with Specular Crest */}
          <path
            d="M7 12C7 9.79 8.79 8 11 8H37C39.21 8 41 9.79 41 12V13L24 26L7 13V12Z"
            fill="url(#qm_grad_flap)"
          />

          {/* Sharp Laser Flap Edge Highlight */}
          <path
            d="M7.5 12.5L24 25.5L40.5 12.5"
            stroke="#FFF9C4"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Quantum Light Spark Core */}
          <circle cx="24" cy="25.5" r="2.2" fill="#FFFFFF" />
          <circle cx="24" cy="25.5" r="3.8" stroke="#FFE082" strokeWidth="1" opacity="0.8" />
        </svg>
      </motion.div>

      {/* Floating Unread Pill / Zen Shield */}
      {showBadge && (
        <div className="absolute -top-1 -right-1.5 z-10 pointer-events-none">
          {unreadCount > 0 ? (
            <span className="relative inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 text-[9.5px] font-black text-[#0B0C10] bg-gradient-to-r from-[#FF9800] to-[#FFC107] rounded-full shadow-[0_0_10px_rgba(255,152,0,0.8)] border border-white/40">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : (
            <span className="flex items-center justify-center size-3.5 rounded-full bg-emerald-500/20 border border-emerald-400/80 text-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]">
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
