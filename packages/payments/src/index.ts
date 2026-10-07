// ============================================================================
// Payments Package - Barrel Export
// ============================================================================

export * from './types';
export { StripeGateway, StripeGateway as PaymentGateway } from './services/gateway-service';
export {
  CreatePaymentIntentSchema,
  CreateCustomerSchema,
  RefundSchema,
  CreateSubscriptionSchema,
} from './services/gateway-service';
export { SubscriptionService } from './services/subscription-service';
export { WalletService } from './services/wallet-service';
export { InvoiceService } from './services/invoice-service';
export { RevenueSharing } from './services/revenue-sharing-service';
export { TaxService } from './services/tax-service';

// Creator Economy Services
export {
  StripeConnectService,
  CreateCreatorAccountSchema,
  TransferToCreatorSchema,
  CreatePayoutSchema,
} from './services/stripe-connect.service';
export {
  RevShareService,
  RecordAdRevenueSchema,
  RecordTipSchema,
} from './services/revshare.service';
export {
  CreatorWalletService,
  CreditEarningsSchema,
  DebitForCashoutSchema,
} from './services/creator-wallet.service';
export {
  CreatorSubscriptionService,
  CreateTierSchema,
  UpdateTierSchema,
  SubscribeSchema,
} from './services/creator-subscription.service';
export { TipService, SendTipSchema, PRESET_TIP_AMOUNTS } from './services/tip.service';
export { CashoutService, RequestCashoutSchema } from './services/cashout.service';
export { LedgerService, RecordEntrySchema } from './services/ledger.service';

// Phase 12 Services
export { FraudDetectionService, CheckTransactionSchema } from './services/fraud-detection.service';
export {
  AdBillingService,
  CreateCampaignSchema,
  RecordImpressionSchema,
} from './services/ad-billing.service';
export {
  AgentSpendingLimitService,
  CreateAgentBudgetSchema,
  RecordAgentSpendSchema,
} from './services/agent-spending-limit.service';
export {
  DisputeService,
  OpenDisputeSchema,
  SubmitEvidenceSchema,
} from './services/dispute.service';

// Phase 24 - Unified Wallet, Quant Pro, Payment Gateways
export {
  RazorpayGateway,
  CreateRazorpayOrderSchema,
  VerifyRazorpayPaymentSchema,
} from './services/razorpay-gateway.service';
export {
  UPIPaymentService,
  GenerateUPIPaymentLinkSchema,
  VerifyUPIPaymentSchema,
} from './services/upi-payment.service';
export {
  UnifiedWalletService,
  AddMoneySchema,
  SpendSchema,
  GetWalletSummarySchema,
} from './services/unified-wallet.service';
export {
  QuantProService,
  SubscribeSchema as QuantProSubscribeSchema,
  ValidateIAPReceiptSchema,
} from './services/quant-pro.service';
export type { ProFeature, QuantProServiceOptions } from './services/quant-pro.service';
export {
  AppleReceiptValidator,
  GooglePlayReceiptValidator,
} from './services/iap-validation';
export type { IAPValidator, FetchLike } from './services/iap-validation';

// Phase 29 - Creator Economy Extensions
export {
  PayPerViewService,
  CreatePaywallSchema,
  PurchaseAccessSchema,
} from './services/pay-per-view.service';
export {
  StorefrontService,
  CreateProductSchema,
  PurchaseProductSchema,
} from './services/storefront.service';
export {
  ComputeCreditsService,
  PurchaseCreditsSchema,
  DeductCreditsSchema,
  AI_ACTION_COSTS,
} from './services/compute-credits.service';
export { TaxDocumentService, GenerateTaxDocSchema } from './services/tax-document.service';
