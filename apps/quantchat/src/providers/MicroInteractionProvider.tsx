'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { XP_MAP, xpForAction, isStreakUrgent, type XPAction } from '../lib/gamification';

// ============================================================================
// Task 11.1: MicroInteractionProvider — Global Gamification State
// Task 11.4: Streak counter logic
// Task 11.11: XP system with per-action mapping
// Task 11.13: CSS haptic feedback on all interactive elements
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: Date;
}

export interface StreakData {
  friendId: string;
  count: number;
  lastActivityAt: Date;
  expiresAt: Date;
  hoursRemaining: number;
  isUrgent: boolean;
  userASentToday: boolean;
  userBSentToday: boolean;
}

export type RewardType = 'bonus_xp' | 'rare_badge' | 'avatar_accessory';

export interface RewardSchedule {
  actionsSinceLastReward: number;
  threshold: number; // random between 5 and 15
  lastRewardAt: Date | null;
}

export type { XPAction };
export { XP_MAP };

export interface GamificationState {
  xp: number;
  level: number;
  badges: Badge[];
  streaks: Map<string, StreakData>;
  rewardSchedule: RewardSchedule;
}

// ─── Actions ────────────────────────────────────────────────────────────────

type GamificationAction =
  | { type: 'AWARD_XP'; action: XPAction; amount?: number }
  | { type: 'ADD_BADGE'; badge: Badge }
  | { type: 'UPDATE_STREAK'; friendId: string; streakData: Partial<StreakData> }
  | { type: 'RESET_STREAK'; friendId: string }
  | { type: 'INCREMENT_REWARD_ACTIONS' }
  | { type: 'TRIGGER_REWARD' }
  | { type: 'SET_STATE'; state: Partial<GamificationState> };

// ─── Reducer ────────────────────────────────────────────────────────────────

function generateThreshold(): number {
  return Math.floor(Math.random() * 11) + 5; // 5-15
}

function calculateLevel(xp: number): number {
  return Math.floor(xp / 1000) + 1;
}

function gamificationReducer(
  state: GamificationState,
  action: GamificationAction,
): GamificationState {
  switch (action.type) {
    case 'AWARD_XP': {
      const amount = action.amount ?? xpForAction(action.action);
      const newXp = state.xp + amount;
      return {
        ...state,
        xp: newXp,
        level: calculateLevel(newXp),
      };
    }
    case 'ADD_BADGE': {
      return {
        ...state,
        badges: [...state.badges, action.badge],
      };
    }
    case 'UPDATE_STREAK': {
      const newStreaks = new Map(state.streaks);
      const existing = newStreaks.get(action.friendId);
      const updated: StreakData = {
        friendId: action.friendId,
        count: 0,
        lastActivityAt: new Date(),
        expiresAt: new Date(),
        hoursRemaining: 24,
        isUrgent: false,
        userASentToday: false,
        userBSentToday: false,
        ...existing,
        ...action.streakData,
      };
      // Recalculate hoursRemaining and isUrgent
      updated.hoursRemaining = Math.max(0, (updated.expiresAt.getTime() - Date.now()) / 3600000);
      updated.isUrgent = isStreakUrgent(updated.hoursRemaining);
      newStreaks.set(action.friendId, updated);
      return { ...state, streaks: newStreaks };
    }
    case 'RESET_STREAK': {
      const newStreaks = new Map(state.streaks);
      const existing = newStreaks.get(action.friendId);
      if (existing) {
        newStreaks.set(action.friendId, {
          ...existing,
          count: 0,
          userASentToday: false,
          userBSentToday: false,
        });
      }
      return { ...state, streaks: newStreaks };
    }
    case 'INCREMENT_REWARD_ACTIONS': {
      return {
        ...state,
        rewardSchedule: {
          ...state.rewardSchedule,
          actionsSinceLastReward: state.rewardSchedule.actionsSinceLastReward + 1,
        },
      };
    }
    case 'TRIGGER_REWARD': {
      return {
        ...state,
        rewardSchedule: {
          actionsSinceLastReward: 0,
          threshold: generateThreshold(),
          lastRewardAt: new Date(),
        },
      };
    }
    case 'SET_STATE': {
      return { ...state, ...action.state };
    }
    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────────────────

export interface MicroInteractionContextValue {
  state: GamificationState;
  awardXP: (action: XPAction, amount?: number) => void;
  checkStreak: (friendId: string) => StreakData | undefined;
  triggerReward: () => RewardType | null;
  addBadge: (badge: Badge) => void;
  updateStreak: (friendId: string, data: Partial<StreakData>) => void;
  resetStreak: (friendId: string) => void;
  incrementRewardActions: () => RewardType | null;
}

const MicroInteractionContext = createContext<MicroInteractionContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

const initialState: GamificationState = {
  xp: 0,
  level: 1,
  badges: [],
  streaks: new Map(),
  rewardSchedule: {
    actionsSinceLastReward: 0,
    threshold: generateThreshold(),
    lastRewardAt: null,
  },
};

interface MicroInteractionProviderProps {
  children: ReactNode;
  initialXP?: number;
}

export function MicroInteractionProvider({
  children,
  initialXP = 0,
}: MicroInteractionProviderProps) {
  const [state, dispatch] = useReducer(gamificationReducer, {
    ...initialState,
    xp: initialXP,
    level: calculateLevel(initialXP),
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const awardXP = useCallback((action: XPAction, amount?: number) => {
    dispatch({ type: 'AWARD_XP', action, amount });
  }, []);

  const checkStreak = useCallback((friendId: string): StreakData | undefined => {
    const streak = stateRef.current.streaks.get(friendId);
    if (!streak) return undefined;

    // Check if streak expired
    if (streak.expiresAt.getTime() < Date.now()) {
      dispatch({ type: 'RESET_STREAK', friendId });
      return { ...streak, count: 0, hoursRemaining: 0, isUrgent: false };
    }

    return streak;
  }, []);

  const triggerReward = useCallback((): RewardType | null => {
    const rewards: RewardType[] = ['bonus_xp', 'rare_badge', 'avatar_accessory'];
    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    dispatch({ type: 'TRIGGER_REWARD' });
    return reward;
  }, []);

  const addBadge = useCallback((badge: Badge) => {
    dispatch({ type: 'ADD_BADGE', badge });
  }, []);

  const updateStreak = useCallback((friendId: string, data: Partial<StreakData>) => {
    dispatch({ type: 'UPDATE_STREAK', friendId, streakData: data });
  }, []);

  const resetStreak = useCallback((friendId: string) => {
    dispatch({ type: 'RESET_STREAK', friendId });
  }, []);

  const incrementRewardActions = useCallback((): RewardType | null => {
    dispatch({ type: 'INCREMENT_REWARD_ACTIONS' });
    const schedule = stateRef.current.rewardSchedule;
    if (schedule.actionsSinceLastReward + 1 >= schedule.threshold) {
      return triggerReward();
    }
    return null;
  }, [triggerReward]);

  const value: MicroInteractionContextValue = {
    state,
    awardXP,
    checkStreak,
    triggerReward,
    addBadge,
    updateStreak,
    resetStreak,
    incrementRewardActions,
  };

  return (
    <MicroInteractionContext.Provider value={value}>{children}</MicroInteractionContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useMicroInteractions(): MicroInteractionContextValue {
  const ctx = useContext(MicroInteractionContext);
  if (!ctx) {
    throw new Error('useMicroInteractions must be used within MicroInteractionProvider');
  }
  return ctx;
}

// ─── Streak Calculation Utilities (Task 11.4) ───────────────────────────────

/**
 * Calculate streak expiration: midnight UTC + 24h from last activity
 */
export function calculateStreakExpiry(lastActivityAt: Date): Date {
  const nextMidnight = new Date(lastActivityAt);
  nextMidnight.setUTCHours(24, 0, 0, 0); // next midnight UTC
  return new Date(nextMidnight.getTime() + 24 * 60 * 60 * 1000); // + 24h
}

/**
 * Determine if streak should increment.
 * Increments only when BOTH users have sent ≥1 message today.
 */
export function shouldIncrementStreak(streak: StreakData): boolean {
  return streak.userASentToday && streak.userBSentToday;
}

/**
 * Calculate hours remaining on a streak
 */
export function calculateHoursRemaining(expiresAt: Date): number {
  return Math.max(0, (expiresAt.getTime() - Date.now()) / 3600000);
}

// ─── CSS Haptic Feedback Class (Task 11.13) ─────────────────────────────────

/**
 * CSS class name that applies 50ms scale transform on :active.
 * Add to any interactive element for haptic-like feedback.
 *
 * Include this in your global CSS:
 *
 * .haptic-feedback {
 *   transition: transform 50ms ease;
 * }
 * .haptic-feedback:active {
 *   transform: scale(0.95);
 * }
 */
export const HAPTIC_FEEDBACK_CLASS = 'haptic-feedback';

export default MicroInteractionProvider;
