import type { LaunchMetricsData } from '../types.js';

export class LaunchMetrics {
  private downloads: number[] = [];
  private retention: number[] = [];
  private revenue: number[] = [];
  private crashes = 0;
  private totalSessions = 0;
  private storeRanking: number | null = null;
  private acquisitionCost = 0;

  recordDownloads(count: number): void {
    this.downloads.push(count);
  }

  recordRetention(dayRate: number): void {
    this.retention.push(dayRate);
  }

  recordRevenue(amount: number): void {
    this.revenue.push(amount);
  }

  recordSession(crashed: boolean): void {
    this.totalSessions++;
    if (crashed) this.crashes++;
  }

  setStoreRanking(rank: number): void {
    this.storeRanking = rank;
  }

  setAcquisitionCost(cost: number): void {
    this.acquisitionCost = cost;
  }

  getDownloadVelocity(): number {
    if (this.downloads.length < 2) return 0;
    const last = this.downloads[this.downloads.length - 1] ?? 0;
    const prev = this.downloads[this.downloads.length - 2] ?? 0;
    return last - prev;
  }

  getTotalDownloads(): number {
    return this.downloads.reduce((a, b) => a + b, 0);
  }

  getTotalRevenue(): number {
    return this.revenue.reduce((a, b) => a + b, 0);
  }

  getCrashFreeRate(): number {
    if (this.totalSessions === 0) return 100;
    return ((this.totalSessions - this.crashes) / this.totalSessions) * 100;
  }

  getReport(): LaunchMetricsData {
    return {
      downloads: [...this.downloads],
      retention: [...this.retention],
      revenue: [...this.revenue],
      crashFreeRate: this.getCrashFreeRate(),
      storeRanking: this.storeRanking,
      acquisitionCost: this.acquisitionCost,
    };
  }

  meetsHealthTargets(): { crashFreeOk: boolean; rankOk: boolean } {
    return {
      crashFreeOk: this.getCrashFreeRate() >= 99.5,
      rankOk: this.storeRanking !== null && this.storeRanking <= 100,
    };
  }
}
