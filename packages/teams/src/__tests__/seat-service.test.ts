import { describe, it, expect, beforeEach } from 'vitest';
import { SeatService } from '../licensing/seat-service.js';

describe('SeatService', () => {
  let service: SeatService;

  beforeEach(() => {
    service = new SeatService();
  });

  it('allocates seats for an org', async () => {
    const license = await service.allocate('org-1', 'standard', 50);
    expect(license.orgId).toBe('org-1');
    expect(license.tier).toBe('standard');
    expect(license.totalSeats).toBe(50);
    expect(license.usedSeats).toBe(0);
    expect(license.pricePerSeat).toBe(25);
  });

  it('adds seats to existing license', async () => {
    await service.allocate('org-1', 'basic', 10);
    const updated = await service.addSeats('org-1', 5);
    expect(updated?.totalSeats).toBe(15);
  });

  it('removes seats from license', async () => {
    await service.allocate('org-1', 'enterprise', 100);
    const updated = await service.removeSeats('org-1', 20);
    expect(updated?.totalSeats).toBe(80);
  });

  it('prevents removing seats below used count', async () => {
    await service.allocate('org-1', 'basic', 10);
    await service.useSeat('org-1');
    await service.useSeat('org-1');
    await service.useSeat('org-1');
    const result = await service.removeSeats('org-1', 9);
    expect(result).toBeUndefined();
  });

  it('calculates price correctly for basic tier', async () => {
    await service.allocate('org-1', 'basic', 20);
    const price = await service.calculatePrice('org-1');
    expect(price?.monthly).toBe(200); // 20 * $10
    expect(price?.annual).toBe(1920); // 200 * 12 * 0.8
  });

  it('calculates price correctly for enterprise tier', async () => {
    await service.allocate('org-1', 'enterprise', 100);
    const price = await service.calculatePrice('org-1');
    expect(price?.monthly).toBe(7500); // 100 * $75
    expect(price?.annual).toBe(72000); // 7500 * 12 * 0.8
  });

  it('gets usage for org', async () => {
    await service.allocate('org-1', 'standard', 30);
    await service.useSeat('org-1');
    await service.useSeat('org-1');
    const usage = await service.getUsage('org-1');
    expect(usage?.usedSeats).toBe(2);
    expect(usage?.totalSeats).toBe(30);
  });

  it('prevents using more seats than allocated', async () => {
    await service.allocate('org-1', 'basic', 2);
    await service.useSeat('org-1');
    await service.useSeat('org-1');
    const result = await service.useSeat('org-1');
    expect(result).toBe(false);
  });

  it('releases a seat', async () => {
    await service.allocate('org-1', 'basic', 10);
    await service.useSeat('org-1');
    const released = await service.releaseSeat('org-1');
    expect(released).toBe(true);
    const usage = await service.getUsage('org-1');
    expect(usage?.usedSeats).toBe(0);
  });

  it('gets billing information', async () => {
    await service.allocate('org-1', 'standard', 20);
    await service.useSeat('org-1');
    await service.useSeat('org-1');
    const billing = await service.getBilling('org-1');
    expect(billing?.monthlyTotal).toBe(500); // 20 * $25
    expect(billing?.utilization).toBe(0.1); // 2/20
  });

  it('returns undefined for non-existent org', async () => {
    const usage = await service.getUsage('no-org');
    expect(usage).toBeUndefined();
    const price = await service.calculatePrice('no-org');
    expect(price).toBeUndefined();
  });
});
