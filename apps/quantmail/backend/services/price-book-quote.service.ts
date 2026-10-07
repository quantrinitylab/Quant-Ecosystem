import { randomUUID } from 'crypto';

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface PriceBookItem {
  sku: string;
  name: string;
  description: string;
  basePriceUsd: number;
  category: string;
}

export interface QuoteLineItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPercentage: number; // 0 to 100
  taxRatePercentage: number; // e.g. 18 for 18% GST
  lineSubtotal: number;
  lineTotal: number;
}

export interface SalesQuote {
  id: string;
  workspaceId: string;
  dealId?: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  items: QuoteLineItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  status: QuoteStatus;
  expiresAt: string;
  createdAt: string;
}

const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.5,
  AED: 3.67,
  JPY: 155.0,
};

let priceBook: Map<string, PriceBookItem> = new Map();
let quotes: Map<string, SalesQuote> = new Map();

export function registerProduct(item: PriceBookItem): PriceBookItem {
  priceBook.set(item.sku, item);
  return item;
}

export function convertPrice(priceUsd: number, targetCurrency: string): number {
  const rate = EXCHANGE_RATES[targetCurrency.toUpperCase()];
  if (rate === undefined) {
    throw new Error(`Unsupported currency: ${targetCurrency}`);
  }
  return Number((priceUsd * rate).toFixed(2));
}

function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}

export function createSalesQuote(
  workspaceId: string,
  data: {
    clientName: string;
    clientEmail: string;
    currency: string;
    items: Array<{
      sku: string;
      quantity: number;
      discountPercentage?: number;
      taxRatePercentage?: number;
    }>;
    expiresDays?: number;
  },
): SalesQuote {
  const quoteItems: QuoteLineItem[] = [];
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  for (const item of data.items) {
    const product = priceBook.get(item.sku);
    if (!product) {
      throw new Error(`Product not found for SKU: ${item.sku}`);
    }

    const unitPrice = convertPrice(product.basePriceUsd, data.currency);
    const lineSubtotal = unitPrice * item.quantity;

    const discountPerc = item.discountPercentage || 0;
    const discountAmount = lineSubtotal * (discountPerc / 100);

    const taxPerc = item.taxRatePercentage || 0;
    const taxableAmount = lineSubtotal - discountAmount;
    const taxAmount = taxableAmount * (taxPerc / 100);

    const lineTotal = taxableAmount + taxAmount;

    quoteItems.push({
      sku: product.sku,
      name: product.name,
      quantity: item.quantity,
      unitPrice,
      discountPercentage: discountPerc,
      taxRatePercentage: taxPerc,
      lineSubtotal: roundToTwo(lineSubtotal),
      lineTotal: roundToTwo(lineTotal),
    });

    subtotal += lineSubtotal;
    totalDiscount += discountAmount;
    totalTax += taxAmount;
  }

  const grandTotal = subtotal - totalDiscount + totalTax;

  const createdAt = new Date();
  const expiresDays = data.expiresDays || 30;
  const expiresAt = new Date(createdAt.getTime() + expiresDays * 24 * 60 * 60 * 1000);

  const quote: SalesQuote = {
    id: randomUUID(),
    workspaceId,
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    currency: data.currency,
    items: quoteItems,
    subtotal: roundToTwo(subtotal),
    totalDiscount: roundToTwo(totalDiscount),
    totalTax: roundToTwo(totalTax),
    grandTotal: roundToTwo(grandTotal),
    status: 'DRAFT',
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  quotes.set(quote.id, quote);
  return quote;
}

export function updateQuoteStatus(quoteId: string, status: QuoteStatus): SalesQuote {
  const quote = quotes.get(quoteId);
  if (!quote) {
    throw new Error(`Quote not found: ${quoteId}`);
  }
  quote.status = status;
  quotes.set(quoteId, quote);
  return quote;
}

export function getQuote(quoteId: string): SalesQuote | null {
  return quotes.get(quoteId) || null;
}

export function clearQuotesForTesting(): void {
  priceBook.clear();
  quotes.clear();
}
