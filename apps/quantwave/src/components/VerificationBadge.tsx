// ============================================================================
// QuantSync - VerificationBadge Component
// Badge display (blue/gold/gray) with SVG icon and tooltip
// ============================================================================

import React, { useState, useCallback } from 'react';

type BadgeType = 'blue' | 'gold' | 'gray';

interface VerificationBadgeProps {
  type: BadgeType;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  verifiedAt?: string;
  className?: string;
}

const BADGE_CONFIG: Record<
  BadgeType,
  { color: string; fill: string; label: string; description: string }
> = {
  blue: {
    color: '#1d9bf0',
    fill: '#1d9bf0',
    label: 'Verified Individual',
    description: 'This account is verified as a notable individual, creator, or public figure.',
  },
  gold: {
    color: '#e6a817',
    fill: '#e6a817',
    label: 'Verified Organization',
    description: 'This account is verified as an official business, brand, or organization.',
  },
  gray: {
    color: '#6b7280',
    fill: '#6b7280',
    label: 'Government Official',
    description: 'This account is verified as a government official or institution.',
  },
};

const SIZE_CONFIG: Record<string, { width: number; height: number; fontSize: string }> = {
  sm: { width: 16, height: 16, fontSize: 'text-xs' },
  md: { width: 20, height: 20, fontSize: 'text-sm' },
  lg: { width: 24, height: 24, fontSize: 'text-base' },
};

const VerificationBadge: React.FC<VerificationBadgeProps> = ({
  type,
  size = 'md',
  showTooltip = true,
  verifiedAt,
  className = '',
}) => {
  const [tooltipVisible, setTooltipVisible] = useState<boolean>(false);
  const config = BADGE_CONFIG[type];
  const sizeConfig = SIZE_CONFIG[size] ?? { width: 20, height: 20, fontSize: 'text-sm' };

  const handleMouseEnter = useCallback(() => {
    if (showTooltip) setTooltipVisible(true);
  }, [showTooltip]);

  const handleMouseLeave = useCallback(() => {
    setTooltipVisible(false);
  }, []);

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="img"
      aria-label={config.label}
    >
      <svg
        width={sizeConfig.width}
        height={sizeConfig.height}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="inline-block"
      >
        <path
          d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
          fill={config.fill}
        />
        <path
          d="M9.5 12.5l2 2 3.5-4.5"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {tooltipVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white rounded-xl p-3 shadow-xl z-50 pointer-events-none">
          <div className="flex items-center gap-2 mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
                fill={config.fill}
              />
              <path
                d="M9.5 12.5l2 2 3.5-4.5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-bold text-sm">{config.label}</span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">{config.description}</p>
          {verifiedAt && (
            <p className="text-xs text-gray-400 mt-2 border-t border-gray-700 pt-2">
              Verified since {formatDate(verifiedAt)}
            </p>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        </div>
      )}
    </span>
  );
};

export default VerificationBadge;
