'use client';

// ============================================================================
// Shared UI - Bottom Navigation Component
// ============================================================================

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  badge?: number;
  href?: string;
}

export interface BottomNavProps {
  items: NavItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  animated?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  items,
  activeId,
  onChange,
  className = '',
  animated = true,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && !prefersReducedMotion;

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom ${className}`}
    >
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`flex flex-col items-center justify-center w-full h-full relative transition-colors ${isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                {isActive && item.activeIcon ? item.activeIcon : item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 font-medium">{item.label}</span>
              {isActive &&
                (shouldAnimate ? (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-full"
                    transition={{ type: 'spring', ...spring.snappy }}
                  />
                ) : (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-600 rounded-full" />
                ))}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
