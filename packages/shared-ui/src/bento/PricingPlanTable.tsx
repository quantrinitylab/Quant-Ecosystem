'use client';

import React, { useState } from 'react';

export interface PricingTier {
  id: string;
  name: string; // e.g. "Free / Starter", "Pro / Creator", "Enterprise / Sovereign"
  description: string;
  monthlyPrice: number | string;
  annualPrice?: number | string; // Optional custom annual price
  features: string[];
  isPopular?: boolean;
  ctaText?: string;
  onCtaClick?: () => void;
}

export interface PricingPlanTableProps {
  tiers: PricingTier[];
  defaultBilling?: 'monthly' | 'annual';
  annualDiscountPercent?: number; // default 20
  className?: string;
}

export const PricingPlanTable: React.FC<PricingPlanTableProps> = ({
  tiers,
  defaultBilling = 'monthly',
  annualDiscountPercent = 20,
  className = '',
}) => {
  const [billing, setBilling] = useState<'monthly' | 'annual'>(defaultBilling);

  return (
    <div
      className={`bg-[#0D1117] p-6 rounded-2xl text-white ${className}`}
      data-testid="pricing-plan-table"
    >
      {/* Billing Toggle Switch */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex items-center p-1 rounded-full bg-[#161B22] border border-white/10">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2 text-sm font-medium rounded-full transition-all ${
              billing === 'monthly'
                ? 'bg-[#58A6FF] text-[#0D1117] shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
            data-testid="billing-monthly-btn"
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling('annual')}
            className={`px-5 py-2 text-sm font-medium rounded-full transition-all flex items-center gap-1.5 ${
              billing === 'annual'
                ? 'bg-[#58A6FF] text-[#0D1117] shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
            data-testid="billing-annual-btn"
          >
            Annual
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold ${
                billing === 'annual'
                  ? 'bg-[#0D1117] text-[#58A6FF]'
                  : 'bg-[#58A6FF]/20 text-[#58A6FF]'
              }`}
            >
              Save {annualDiscountPercent}%
            </span>
          </button>
        </div>
      </div>

      {/* Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          let displayPrice: string | number = tier.monthlyPrice;
          if (billing === 'annual') {
            if (tier.annualPrice !== undefined) {
              displayPrice = tier.annualPrice;
            } else if (typeof tier.monthlyPrice === 'number') {
              const discounted = (tier.monthlyPrice * 12 * (1 - annualDiscountPercent / 100)) / 12;
              displayPrice = Math.round(discounted);
            } else if (typeof tier.monthlyPrice === 'string' && !isNaN(Number(tier.monthlyPrice))) {
              const num = Number(tier.monthlyPrice);
              displayPrice = Math.round((num * 12 * (1 - annualDiscountPercent / 100)) / 12);
            }
          }

          return (
            <div
              key={tier.id}
              className={`relative flex flex-col justify-between rounded-2xl bg-[#161B22] p-8 border transition-all duration-300 ${
                tier.isPopular
                  ? 'border-[#58A6FF] shadow-[0_0_40px_rgba(88,166,255,0.2)] md:-translate-y-2'
                  : 'border-white/10 hover:border-white/20'
              }`}
              data-testid={`pricing-tier-${tier.id}`}
            >
              {tier.isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#58A6FF] to-blue-600 text-[#0D1117] text-xs font-bold uppercase tracking-wider shadow-lg">
                  Most Popular
                </div>
              )}

              <div>
                <h3 className="text-xl font-bold text-white mb-2">{tier.name}</h3>
                <p className="text-sm text-gray-400 mb-6">{tier.description}</p>

                <div className="flex items-baseline gap-2 mb-6">
                  <span
                    className="text-4xl font-extrabold text-white"
                    data-testid={`tier-price-${tier.id}`}
                  >
                    {typeof displayPrice === 'number' ? `$${displayPrice}` : displayPrice}
                  </span>
                  <span className="text-sm text-gray-400">
                    / {billing === 'annual' ? 'month (billed annually)' : 'month'}
                  </span>
                </div>

                <div className="space-y-3 mb-8">
                  <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Features included:
                  </p>
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm text-gray-300">
                      <svg
                        className="w-4 h-4 text-[#58A6FF] shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={tier.onCtaClick}
                className={`w-full py-3 px-4 rounded-xl font-semibold transition-all shadow-md ${
                  tier.isPopular
                    ? 'bg-[#58A6FF] text-[#0D1117] hover:bg-[#4493f8]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                data-testid={`tier-cta-${tier.id}`}
              >
                {tier.ctaText || 'Get Started'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
