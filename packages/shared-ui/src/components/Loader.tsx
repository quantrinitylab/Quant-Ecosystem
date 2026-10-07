'use client';

// ============================================================================
// Shared UI - Loader Component
// ============================================================================

import React from 'react';
import { useReducedMotion } from 'framer-motion';

export interface LoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'spinner' | 'dots' | 'pulse' | 'skeleton';
  color?: 'primary' | 'white' | 'gray';
  fullScreen?: boolean;
  text?: string;
  className?: string;
}

export const Loader: React.FC<LoaderProps> = ({
  size = 'md',
  variant = 'spinner',
  color = 'primary',
  fullScreen = false,
  text,
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();

  const sizeValues: Record<string, string> = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const colorValues: Record<string, string> = {
    primary: 'border-blue-600',
    white: 'border-white',
    gray: 'border-gray-600',
  };

  const renderLoader = () => {
    switch (variant) {
      case 'spinner':
        return (
          <div
            className={`${sizeValues[size]} border-4 border-gray-200 ${colorValues[color]} border-t-current rounded-full${prefersReducedMotion ? '' : ' animate-spin'}`}
          />
        );
      case 'dots':
        return (
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'} bg-current rounded-full${prefersReducedMotion ? '' : ' animate-bounce'}`}
                style={prefersReducedMotion ? undefined : { animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        );
      case 'pulse':
        return (
          <div
            className={`${sizeValues[size]} bg-current rounded-full${prefersReducedMotion ? '' : ' animate-pulse'} opacity-75`}
          />
        );
      case 'skeleton':
        return (
          <div className="space-y-3 w-full">
            <div
              className={`h-4 bg-gray-200 rounded${prefersReducedMotion ? '' : ' animate-pulse'} w-3/4`}
            />
            <div
              className={`h-4 bg-gray-200 rounded${prefersReducedMotion ? '' : ' animate-pulse'} w-full`}
            />
            <div
              className={`h-4 bg-gray-200 rounded${prefersReducedMotion ? '' : ' animate-pulse'} w-1/2`}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const content = (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-label="Loading"
    >
      {renderLoader()}
      {text && <p className="text-sm text-gray-600">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white bg-opacity-80 z-50">
        {content}
      </div>
    );
  }

  return content;
};
