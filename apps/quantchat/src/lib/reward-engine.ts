// ============================================================================
// Task 11.6: Variable-Ratio Reward Engine
// - Random threshold between 5 and 15 actions
// - After that many routine actions (likes, messages, scrolls), trigger a surprise reward
// - Rewards: bonus XP, rare badge unlock, avatar accessory
// ============================================================================

export type RewardType = 'bonus_xp' | 'rare_badge' | 'avatar_accessory';

export interface RewardResult {
  type: RewardType;
  value: number | string;
  description: string;
}

export interface RewardEngineState {
  actionsSinceLastReward: number;
  threshold: number;
  totalRewardsGiven: number;
  lastRewardAt: number | null;
}

/**
 * Generate a new random threshold between 5 and 15 (inclusive).
 * This implements the variable-ratio schedule — unpredictable reward timing.
 */
export function generateThreshold(): number {
  return Math.floor(Math.random() * 11) + 5; // 5 to 15
}

/**
 * Create initial reward engine state.
 */
export function createRewardEngineState(): RewardEngineState {
  return {
    actionsSinceLastReward: 0,
    threshold: generateThreshold(),
    totalRewardsGiven: 0,
    lastRewardAt: null,
  };
}

/**
 * Select a random reward from the reward pool.
 * Uses weighted randomness — rarer rewards have lower probability.
 */
export function selectReward(): RewardResult {
  const roll = Math.random();

  if (roll < 0.5) {
    // 50% chance: bonus XP (25-100 XP)
    const xpAmount = Math.floor(Math.random() * 76) + 25;
    return {
      type: 'bonus_xp',
      value: xpAmount,
      description: `Surprise! You earned ${xpAmount} bonus XP!`,
    };
  } else if (roll < 0.85) {
    // 35% chance: avatar accessory
    const accessories = [
      'Cosmic Crown',
      'Neon Halo',
      'Crystal Wings',
      'Plasma Shield',
      'Quantum Aura',
      'Void Mask',
    ];
    const accessory = accessories[Math.floor(Math.random() * accessories.length)];
    return {
      type: 'avatar_accessory',
      value: accessory,
      description: `You unlocked a rare avatar accessory: ${accessory}!`,
    };
  } else {
    // 15% chance: rare badge
    const badges = [
      'Lucky Star',
      'Golden Thumb',
      'Speed Demon',
      'Social Butterfly',
      'Night Owl',
    ];
    const badge = badges[Math.floor(Math.random() * badges.length)];
    return {
      type: 'rare_badge',
      value: badge,
      description: `Rare badge unlocked: ${badge}!`,
    };
  }
}

/**
 * Process a routine action and determine if a reward should be triggered.
 * Returns the reward if threshold is met, null otherwise.
 *
 * @param state Current reward engine state
 * @returns [updatedState, reward | null]
 */
export function processAction(
  state: RewardEngineState
): [RewardEngineState, RewardResult | null] {
  const newActionCount = state.actionsSinceLastReward + 1;

  if (newActionCount >= state.threshold) {
    // Threshold met — trigger reward!
    const reward = selectReward();
    const newState: RewardEngineState = {
      actionsSinceLastReward: 0,
      threshold: generateThreshold(), // new random threshold for next cycle
      totalRewardsGiven: state.totalRewardsGiven + 1,
      lastRewardAt: Date.now(),
    };
    return [newState, reward];
  }

  // Not yet — increment counter
  const newState: RewardEngineState = {
    ...state,
    actionsSinceLastReward: newActionCount,
  };
  return [newState, null];
}

/**
 * RewardEngine class for stateful usage in components/providers.
 */
export class RewardEngine {
  private state: RewardEngineState;

  constructor(initialState?: RewardEngineState) {
    this.state = initialState ?? createRewardEngineState();
  }

  /** Process a routine action. Returns reward if threshold met. */
  recordAction(): RewardResult | null {
    const [newState, reward] = processAction(this.state);
    this.state = newState;
    return reward;
  }

  /** Get current state (for persistence) */
  getState(): RewardEngineState {
    return { ...this.state };
  }

  /** Get actions remaining until next reward */
  getActionsUntilReward(): number {
    return this.state.threshold - this.state.actionsSinceLastReward;
  }

  /** Get total rewards given */
  getTotalRewards(): number {
    return this.state.totalRewardsGiven;
  }

  /** Reset the engine */
  reset(): void {
    this.state = createRewardEngineState();
  }
}

export default RewardEngine;
