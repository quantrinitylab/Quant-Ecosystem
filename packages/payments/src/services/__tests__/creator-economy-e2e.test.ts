// ============================================================================
// Payments - Creator Economy E2E Integration Test
// Full flow: creator earns via tips + pay-per-view + storefront,
// requests cashout, and gets tax document generated
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { TipService } from '../tip.service';
import { PayPerViewService } from '../pay-per-view.service';
import { StorefrontService } from '../storefront.service';
import { CashoutService } from '../cashout.service';
import { TaxDocumentService } from '../tax-document.service';

describe('Creator Economy E2E', () => {
  let tipService: TipService;
  let ppvService: PayPerViewService;
  let storefrontService: StorefrontService;
  let cashoutService: CashoutService;
  let taxDocService: TaxDocumentService;

  const CREATOR_ID = 'creator_star';
  const FAN_1 = 'fan_alice';
  const FAN_2 = 'fan_bob';
  const FAN_3 = 'fan_charlie';

  beforeEach(() => {
    tipService = new TipService();
    ppvService = new PayPerViewService();
    storefrontService = new StorefrontService();
    taxDocService = new TaxDocumentService();
  });

  it('should complete full creator earn -> cashout -> tax doc flow', () => {
    // Step 1: Creator earns via tips
    const tip1 = tipService.sendTip({
      fromUserId: FAN_1,
      toCreatorId: CREATOR_ID,
      amount: 50,
      message: 'Love your content!',
    });
    const tip2 = tipService.sendTip({
      fromUserId: FAN_2,
      toCreatorId: CREATOR_ID,
      amount: 100,
    });

    // Tips use 95/5 split
    expect(tip1.creatorShare).toBe(47.5);
    expect(tip2.creatorShare).toBe(95);
    const tipEarnings = tip1.creatorShare + tip2.creatorShare; // 142.5

    // Step 2: Creator earns via pay-per-view
    ppvService.createPaywall({
      creatorId: CREATOR_ID,
      contentId: 'exclusive_video_1',
      price: 10,
      title: 'Behind the Scenes',
    });

    ppvService.purchaseAccess({ userId: FAN_1, contentId: 'exclusive_video_1' });
    ppvService.purchaseAccess({ userId: FAN_2, contentId: 'exclusive_video_1' });
    ppvService.purchaseAccess({ userId: FAN_3, contentId: 'exclusive_video_1' });

    // Verify access
    expect(ppvService.checkAccess(FAN_1, 'exclusive_video_1')).toBe(true);
    expect(ppvService.checkAccess('random_user', 'exclusive_video_1')).toBe(false);

    // PPV uses 85/15 split: 10 * 0.85 = 8.5 per purchase, 3 purchases = 25.5
    const ppvRevenue = ppvService.getRevenue(CREATOR_ID);
    expect(ppvRevenue.total).toBe(25.5);

    // Step 3: Creator earns via storefront
    const course = storefrontService.createProduct({
      creatorId: CREATOR_ID,
      name: 'Advanced Video Editing',
      description: 'Master pro editing techniques',
      type: 'course',
      price: 199,
    });

    storefrontService.purchaseProduct({ userId: FAN_1, productId: course.id });
    storefrontService.purchaseProduct({ userId: FAN_2, productId: course.id });
    storefrontService.purchaseProduct({ userId: FAN_3, productId: course.id });

    // Storefront uses 85/15 split: 199 * 0.85 = 169.15 per sale, 3 sales = 507.45
    const sales = storefrontService.getCreatorSales(CREATOR_ID);
    expect(sales.totalSales).toBe(3);
    expect(sales.totalRevenue).toBeCloseTo(507.45, 2);
    const storefrontEarnings = sales.totalRevenue;

    // Step 4: Calculate total earnings
    const totalEarnings = tipEarnings + ppvRevenue.total + storefrontEarnings;
    // 142.5 + 25.5 + 507.45 = 675.45
    expect(totalEarnings).toBeCloseTo(675.45, 2);

    // Step 5: Request cashout
    let availableBalance = totalEarnings;
    cashoutService = new CashoutService({
      getAvailableBalance: () => availableBalance,
      debitBalance: (_creatorId: string, amount: number) => {
        availableBalance -= amount;
      },
    });

    const cashout = cashoutService.requestCashout({
      creatorId: CREATOR_ID,
      amount: 500,
      method: 'bank_transfer',
    });

    expect(cashout.status).toBe('pending');
    expect(cashout.amount).toBe(500);

    // Process cashout
    cashoutService.markProcessing(cashout.id);
    cashoutService.markCompleted(cashout.id);

    const completedCashout = cashoutService.getCashoutStatus(cashout.id);
    expect(completedCashout.status).toBe('completed');

    // Step 6: Generate tax document (earnings > $600)
    taxDocService.recordEarnings(CREATOR_ID, 2024, 'tips', tipEarnings);
    taxDocService.recordEarnings(CREATOR_ID, 2024, 'paywalls', ppvRevenue.total);
    taxDocService.recordEarnings(CREATOR_ID, 2024, 'storefront', storefrontEarnings);

    expect(taxDocService.isThresholdMet(totalEarnings)).toBe(true);

    const taxDoc = taxDocService.generateTaxDoc({
      creatorId: CREATOR_ID,
      year: 2024,
      totalEarnings,
    });

    expect(taxDoc.type).toBe('1099-NEC');
    expect(taxDoc.totalEarnings).toBeCloseTo(675.45, 2);
    expect(taxDoc.downloadUrl).toBeDefined();

    // Verify earnings summary
    const summary = taxDocService.getEarningsSummary(CREATOR_ID, 2024);
    expect(summary.totalEarnings).toBeCloseTo(675.45, 2);
    expect(summary.tips).toBe(142.5);
    expect(summary.paywalls).toBe(25.5);
    expect(summary.storefront).toBeCloseTo(507.45, 2);
  });
});
