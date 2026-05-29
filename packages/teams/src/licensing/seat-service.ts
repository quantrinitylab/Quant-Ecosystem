import type { SeatLicense, SeatTier } from '../types.js';

const TIER_PRICING: Record<SeatTier, number> = {
  basic: 10,
  standard: 25,
  enterprise: 75,
};

export class SeatService {
  private licenses = new Map<string, SeatLicense>();

  async allocate(orgId: string, tier: SeatTier, seats: number): Promise<SeatLicense> {
    const license: SeatLicense = {
      orgId,
      tier,
      pricePerSeat: TIER_PRICING[tier],
      totalSeats: seats,
      usedSeats: 0,
    };
    this.licenses.set(orgId, license);
    return license;
  }

  async getUsage(orgId: string): Promise<SeatLicense | undefined> {
    return this.licenses.get(orgId);
  }

  async addSeats(orgId: string, count: number): Promise<SeatLicense | undefined> {
    const license = this.licenses.get(orgId);
    if (!license) return undefined;
    license.totalSeats += count;
    return license;
  }

  async removeSeats(orgId: string, count: number): Promise<SeatLicense | undefined> {
    const license = this.licenses.get(orgId);
    if (!license) return undefined;
    const newTotal = license.totalSeats - count;
    if (newTotal < license.usedSeats) return undefined;
    license.totalSeats = newTotal;
    return license;
  }

  async calculatePrice(orgId: string): Promise<{ monthly: number; annual: number } | undefined> {
    const license = this.licenses.get(orgId);
    if (!license) return undefined;
    const monthly = license.totalSeats * license.pricePerSeat;
    const annual = monthly * 12 * 0.8; // 20% annual discount
    return { monthly, annual };
  }

  async getBilling(
    orgId: string,
  ): Promise<{ license: SeatLicense; monthlyTotal: number; utilization: number } | undefined> {
    const license = this.licenses.get(orgId);
    if (!license) return undefined;
    const monthlyTotal = license.totalSeats * license.pricePerSeat;
    const utilization = license.totalSeats > 0 ? license.usedSeats / license.totalSeats : 0;
    return { license, monthlyTotal, utilization };
  }

  async useSeat(orgId: string): Promise<boolean> {
    const license = this.licenses.get(orgId);
    if (!license) return false;
    if (license.usedSeats >= license.totalSeats) return false;
    license.usedSeats += 1;
    return true;
  }

  async releaseSeat(orgId: string): Promise<boolean> {
    const license = this.licenses.get(orgId);
    if (!license) return false;
    if (license.usedSeats <= 0) return false;
    license.usedSeats -= 1;
    return true;
  }
}
