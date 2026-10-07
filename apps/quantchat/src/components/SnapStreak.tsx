// ============================================================================
// QuantChat - SnapStreak Component
// Snap streak display with expiry warnings and streak count
// ============================================================================

import React from 'react';
import type { SnapStreak as SnapStreakType } from '../types';

interface SnapStreakProps {
  streak: SnapStreakType;
  friendName: string;
  friendAvatar?: string;
  onSendSnap: (friendId: string) => void;
}

export const SnapStreak: React.FC<SnapStreakProps> = ({ streak, friendName, friendAvatar, onSendSnap }) => {
  const hoursLeft = Math.max(0, Math.floor((new Date(streak.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)));
  const friendId = streak.userIds[0]; // Simplified

  const getStreakEmoji = (count: number): string => {
    if (count >= 365) return '💎';
    if (count >= 100) return '💯';
    if (count >= 50) return '🔥';
    if (count >= 30) return '⚡';
    if (count >= 7) return '✨';
    return '🔥';
  };

  const getStreakColor = (): string => {
    if (streak.isAboutToExpire) return 'expiring';
    if (streak.count >= 100) return 'legendary';
    if (streak.count >= 50) return 'hot';
    return 'normal';
  };

  return (
    <div className={`snap-streak-component ${getStreakColor()}`}>
      <div className="streak-avatar">
        {friendAvatar ? (
          <img src={friendAvatar} alt={friendName} />
        ) : (
          <div className="avatar-placeholder">{friendName.charAt(0).toUpperCase()}</div>
        )}
      </div>

      <div className="streak-info">
        <span className="friend-name">{friendName}</span>
        <div className="streak-stats">
          <span className="streak-emoji">{streak.emoji || getStreakEmoji(streak.count)}</span>
          <span className="streak-count">{streak.count}</span>
          {streak.count === streak.longestStreak && streak.count > 10 && (
            <span className="personal-best">PB!</span>
          )}
        </div>
      </div>

      <div className="streak-timer">
        {streak.isAboutToExpire ? (
          <div className="expiry-warning">
            <span className="warning-icon">⚠️</span>
            <span className="hours-left">{hoursLeft}h left!</span>
            <button className="send-snap-btn urgent" onClick={() => onSendSnap(friendId)}>
              Send Snap
            </button>
          </div>
        ) : (
          <span className="hours-remaining">{hoursLeft}h</span>
        )}
      </div>
    </div>
  );
};

export default SnapStreak;
