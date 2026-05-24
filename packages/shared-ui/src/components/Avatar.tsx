// ============================================================================
// Shared UI - Avatar Component
// ============================================================================

import React from 'react';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'rounded';
  status?: 'online' | 'away' | 'busy' | 'offline';
  showStatus?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = 'Avatar',
  name,
  size = 'md',
  shape = 'circle',
  status,
  showStatus = false,
  className = '',
  onClick,
}) => {
  const sizeStyles: Record<string, string> = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };

  const statusColors: Record<string, string> = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    busy: 'bg-red-500',
    offline: 'bg-gray-400',
  };

  const statusSizes: Record<string, string> = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-4 h-4',
  };

  const shapeStyles = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

  const getInitials = (displayName: string): string => {
    return displayName
      .split(' ')
      .map((word) => word[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const bgColors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
    'bg-indigo-500', 'bg-red-500', 'bg-yellow-500', 'bg-teal-500',
  ];

  const getColorIndex = (displayName: string): number => {
    let hash = 0;
    for (let i = 0; i < displayName.length; i++) {
      hash = ((hash << 5) - hash + displayName.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % bgColors.length;
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={`relative inline-flex items-center justify-center ${sizeStyles[size]} ${shapeStyles} overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      aria-label={alt}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover ${shapeStyles}`}
        />
      ) : (
        <div className={`w-full h-full flex items-center justify-center text-white font-semibold ${bgColors[getColorIndex(name || 'User')]}`}>
          {name ? getInitials(name) : '?'}
        </div>
      )}
      {showStatus && status && (
        <span
          className={`absolute bottom-0 right-0 ${statusSizes[size]} ${statusColors[status]} border-2 border-white rounded-full`}
          aria-label={`Status: ${status}`}
        />
      )}
    </Component>
  );
};
