// ============================================================================
// Shared UI - Profile Card Component
// ============================================================================

import React from 'react';

export interface ProfileCardUser {
  name: string;
  email: string;
  avatar?: string;
  role?: string;
  status?: string;
}

export interface ProfileCardProps {
  user: ProfileCardUser;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ user, position = 'bottom' }) => {
  const positionStyles: Record<string, string> = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  return (
    <div
      className={`absolute ${positionStyles[position]} z-50 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-4`}
      role="tooltip"
      aria-label={`Profile card for ${user.name}`}
    >
      <div className="flex items-center gap-3">
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-500 text-white text-lg font-medium">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
          {user.role && <p className="text-xs text-gray-500">{user.role}</p>}
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
        </div>
      </div>
      {user.status && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" aria-hidden="true" />
            <span className="text-xs text-gray-600">{user.status}</span>
          </div>
        </div>
      )}
    </div>
  );
};
