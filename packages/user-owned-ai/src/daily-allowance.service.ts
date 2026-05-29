import { z } from 'zod';
import type { DailyAllowanceConfig, DailyAllowanceState } from './types.js';

export const ConsumeAllowanceSchema = z.object({
  userId: z.string().min(1),
  credits: z.number().positive(),
});

const DEFAULT_CONFIG: DailyAllowanceConfig = {
  freeCreditsPerDay: 100,
  planAllowances: new Map([
    ['free', 100],
    ['pro', 500],
    ['enterprise', 2000],
  ]),
  resetHourUTC: 0,
};

export class DailyAllowanceService {
  private readonly config: DailyAllowanceConfig;
  private readonly states: Map<string, DailyAllowanceState> = new Map();

  constructor(config: Partial<DailyAllowanceConfig> = {}) {
    this.config = {
      freeCreditsPerDay: config.freeCreditsPerDay ?? DEFAULT_CONFIG.freeCreditsPerDay,
      planAllowances: config.planAllowances ?? DEFAULT_CONFIG.planAllowances,
      resetHourUTC: config.resetHourUTC ?? DEFAULT_CONFIG.resetHourUTC,
    };
  }

  getAllowance(userId: string, plan?: string): DailyAllowanceState {
    const userPlan = plan ?? 'free';
    let state = this.states.get(userId);

    if (!state) {
      const dailyCredits =
        this.config.planAllowances.get(userPlan) ?? this.config.freeCreditsPerDay;
      state = {
        userId,
        plan: userPlan,
        creditsRemaining: dailyCredits,
        lastResetAt: Date.now(),
        totalUsedToday: 0,
      };
      this.states.set(userId, state);
    } else {
      if (this.shouldReset(state)) {
        this.performReset(state, userPlan);
      }
      if (plan && state.plan !== plan) {
        state.plan = plan;
        const newAllowance = this.config.planAllowances.get(plan) ?? this.config.freeCreditsPerDay;
        state.creditsRemaining = newAllowance - state.totalUsedToday;
        if (state.creditsRemaining < 0) state.creditsRemaining = 0;
      }
    }

    return { ...state };
  }

  /**
   * Deducts credits from a user's daily allowance.
   *
   * NOTE: This in-memory implementation relies on synchronous, single-threaded
   * execution within a single Node.js event loop tick. The check-then-act
   * pattern (verify remaining >= requested, then decrement) is NOT safe under
   * concurrent access. Any database-backed or multi-process adaptation must
   * use an atomic decrement (e.g., compare-and-swap or database-level locking)
   * to prevent over-consumption.
   */
  consumeAllowance(userId: string, credits: number): DailyAllowanceState {
    ConsumeAllowanceSchema.parse({ userId, credits });

    let state = this.states.get(userId);
    if (!state) {
      state = this.getAllowance(userId);
      this.states.set(userId, state);
    }

    if (this.shouldReset(state)) {
      this.performReset(state, state.plan);
    }

    if (state.creditsRemaining < credits) {
      throw new Error(
        `Insufficient daily allowance: need ${credits}, have ${state.creditsRemaining}`,
      );
    }

    state.creditsRemaining -= credits;
    state.totalUsedToday += credits;

    return { ...state };
  }

  resetAllowance(userId: string): DailyAllowanceState {
    const state = this.states.get(userId);
    if (!state) throw new Error(`No allowance state found for user: ${userId}`);

    this.performReset(state, state.plan);
    return { ...state };
  }

  getRemainingCredits(userId: string): number {
    const state = this.states.get(userId);
    if (!state) {
      return this.config.freeCreditsPerDay;
    }
    if (this.shouldReset(state)) {
      this.performReset(state, state.plan);
    }
    return state.creditsRemaining;
  }

  isAllowanceExhausted(userId: string): boolean {
    return this.getRemainingCredits(userId) <= 0;
  }

  private shouldReset(state: DailyAllowanceState): boolean {
    const now = new Date();
    const lastReset = new Date(state.lastResetAt);

    const nowUTCHours = now.getUTCHours();
    const lastResetDay = lastReset.toISOString().slice(0, 10);
    const todayDay = now.toISOString().slice(0, 10);

    if (lastResetDay < todayDay && nowUTCHours >= this.config.resetHourUTC) {
      return true;
    }
    return false;
  }

  private performReset(state: DailyAllowanceState, plan: string): void {
    const dailyCredits = this.config.planAllowances.get(plan) ?? this.config.freeCreditsPerDay;
    state.creditsRemaining = dailyCredits;
    state.totalUsedToday = 0;
    state.lastResetAt = Date.now();
  }
}
