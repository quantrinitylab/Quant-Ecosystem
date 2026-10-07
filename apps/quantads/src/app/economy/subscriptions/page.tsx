'use client';

import { motion } from 'framer-motion';
import { Card, Button } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import type { SubscriptionTier } from '@quant/quant-economy';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
};

const currentPlan: SubscriptionTier = 'Pro';

interface TierInfo {
  tier: SubscriptionTier;
  price: string;
  features: { name: string; included: boolean }[];
}

const tiers: TierInfo[] = [
  {
    tier: 'Free',
    price: '$0/mo',
    features: [
      { name: 'Basic feed access', included: true },
      { name: 'Send messages', included: true },
      { name: 'Standard quality', included: true },
      { name: 'Boost posts', included: false },
      { name: 'Premium themes', included: false },
      { name: 'Ad-free experience', included: false },
      { name: 'Priority support', included: false },
      { name: 'Exclusive items', included: false },
      { name: 'Family sharing', included: false },
    ],
  },
  {
    tier: 'Pro',
    price: '$9.99/mo',
    features: [
      { name: 'Basic feed access', included: true },
      { name: 'Send messages', included: true },
      { name: 'HD quality', included: true },
      { name: 'Boost posts', included: true },
      { name: 'Premium themes', included: true },
      { name: 'Ad-free experience', included: true },
      { name: 'Priority support', included: false },
      { name: 'Exclusive items', included: false },
      { name: 'Family sharing', included: false },
    ],
  },
  {
    tier: 'ProPlus',
    price: '$19.99/mo',
    features: [
      { name: 'Basic feed access', included: true },
      { name: 'Send messages', included: true },
      { name: '4K quality', included: true },
      { name: 'Boost posts', included: true },
      { name: 'Premium themes', included: true },
      { name: 'Ad-free experience', included: true },
      { name: 'Priority support', included: true },
      { name: 'Exclusive items', included: true },
      { name: 'Family sharing', included: false },
    ],
  },
  {
    tier: 'Family',
    price: '$29.99/mo',
    features: [
      { name: 'Basic feed access', included: true },
      { name: 'Send messages', included: true },
      { name: '4K quality', included: true },
      { name: 'Boost posts', included: true },
      { name: 'Premium themes', included: true },
      { name: 'Ad-free experience', included: true },
      { name: 'Priority support', included: true },
      { name: 'Exclusive items', included: true },
      { name: 'Family sharing (up to 6)', included: true },
    ],
  },
];

const familyMembers = [
  { name: 'Alex Johnson', email: 'alex@example.com' },
  { name: 'Sam Wilson', email: 'sam@example.com' },
];

export default function SubscriptionsPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Subscription Plans</h1>

      {/* Current Plan */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', ...spring.gentle }}
        className="mb-8"
      >
        <Card className="p-5 border-2 border-[var(--quant-primary)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--quant-muted-foreground)] uppercase tracking-wide">
                Current Plan
              </p>
              <p className="text-2xl font-bold mt-1">{currentPlan}</p>
            </div>
            <span className="px-3 py-1 bg-[var(--quant-primary)] text-white rounded-full text-xs font-medium">
              Active
            </span>
          </div>
        </Card>
      </motion.div>

      {/* Tier Comparison */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Compare Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((tierInfo) => {
            const isCurrent = tierInfo.tier === currentPlan;
            return (
              <motion.div key={tierInfo.tier} variants={staggerItem}>
                <Card
                  className={`p-5 h-full flex flex-col ${
                    isCurrent ? 'ring-2 ring-[var(--quant-primary)]' : ''
                  }`}
                >
                  <div className="text-center mb-4">
                    <h3 className="font-bold text-lg">{tierInfo.tier}</h3>
                    <p className="text-xl font-bold mt-1">{tierInfo.price}</p>
                    {isCurrent && (
                      <span className="text-xs text-[var(--quant-primary)] font-medium">
                        Current Plan
                      </span>
                    )}
                  </div>
                  <ul className="flex-1 space-y-2 mb-4">
                    {tierInfo.features.map((feature) => (
                      <li key={feature.name} className="flex items-center gap-2 text-xs">
                        <span className={feature.included ? 'text-green-500' : 'text-red-400'}>
                          {feature.included ? '\u2713' : '\u2717'}
                        </span>
                        <span
                          className={feature.included ? '' : 'text-[var(--quant-muted-foreground)]'}
                        >
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="secondary" size="sm" className="w-full">
                      Current
                    </Button>
                  ) : tierInfo.tier === 'Free' ? (
                    <Button variant="secondary" size="sm" className="w-full">
                      Downgrade
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" className="w-full">
                      Upgrade
                    </Button>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Family Plan Section */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        <h2 className="text-lg font-semibold mb-3">Family Plan Members</h2>
        <Card className="p-5">
          <p className="text-xs text-[var(--quant-muted-foreground)] mb-4">
            Add up to 6 members to your Family plan. Each member gets full Pro+ benefits.
          </p>
          <div className="space-y-3 mb-4">
            {familyMembers.map((member) => (
              <div
                key={member.email}
                className="flex items-center justify-between p-3 bg-[var(--quant-muted)] rounded-md"
              >
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">{member.email}</p>
                </div>
                <Button variant="secondary" size="sm">
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--quant-muted-foreground)]">
              {familyMembers.length}/6 members
            </span>
            <Button variant="primary" size="sm">
              Add Member
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
