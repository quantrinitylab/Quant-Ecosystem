'use client';
// ============================================================================
// Shared UI - Toast Notification Component
// ============================================================================

import React, { useEffect, useState } from 'react';

export interface ToastProps {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onDismiss: (id: string) => void;
  action?: { label: string; onClick: () => void };
}

export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type = 'info',
  duration = 5000,
  onDismiss,
  action,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onDismiss(id), 300);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onDismiss]);

  const typeStyles: Record<
    'success' | 'error' | 'warning' | 'info',
    { container: string; iconColor: string }
  > = {
    success: {
      container: 'bg-[#16181D] border-[#1B4D2E] text-[#F5F5F5] shadow-xl',
      iconColor: 'text-[#4ADE80]',
    },
    error: {
      container: 'bg-[#16181D] border-[#4E1F24] text-[#F5F5F5] shadow-xl',
      iconColor: 'text-[#F87171]',
    },
    warning: {
      container: 'bg-[#16181D] border-[#543D15] text-[#F5F5F5] shadow-xl',
      iconColor: 'text-[#FCD34D]',
    },
    info: {
      container: 'bg-[#16181D] border-[#1E3A66] text-[#F5F5F5] shadow-xl',
      iconColor: 'text-[#60A5FA]',
    },
  };

  const icons: Record<'success' | 'error' | 'warning' | 'info', string> = {
    success: 'M5 13l4 4L19 7',
    error: 'M6 18L18 6M6 6l12 12',
    warning: 'M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z',
    info: 'M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z',
  };

  const currentType = typeStyles[type] ?? typeStyles.info;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200 ${currentType.container} ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'}`}
      role="alert"
    >
      <svg
        className={`w-4 h-4 shrink-0 ${currentType.iconColor}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[type]} />
      </svg>
      <p className="flex-1 text-sm font-medium text-[#F5F5F5]">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-xs font-semibold text-[#FF8C42] hover:text-[#FF9B5A] px-2 py-1 rounded bg-[#2B1A11] border border-[#5C3016] transition-colors"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(id)}
        className="text-[#6B6E76] hover:text-[#F5F5F5] p-1 rounded hover:bg-white/5 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
};
