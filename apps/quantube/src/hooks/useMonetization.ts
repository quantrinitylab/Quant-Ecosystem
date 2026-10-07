// ============================================================================
// QuantTube - useMonetization Hook
// Revenue tracking, membership tiers, payout state
// ============================================================================

import { useState, useCallback } from 'react';

interface RevenueData {
  total: number;
  ads: number;
  memberships: number;
  superChats: number;
  merchShelf: number;
}

interface MembershipTier {
  id: string;
  name: string;
  price: number;
  perks: string[];
  memberCount: number;
}

interface PayoutRecord {
  id: string;
  amount: number;
  date: string;
  status: 'completed' | 'pending' | 'processing';
  method: string;
}

type TimeRange = 'daily' | 'weekly' | 'monthly';

interface MonetizationState {
  revenue: RevenueData;
  tiers: MembershipTier[];
  payoutHistory: PayoutRecord[];
  timeRange: TimeRange;
  loading: boolean;
  error: string | null;
}

interface MonetizationActions {
  setTimeRange: (range: TimeRange) => void;
  addTier: (tier: Omit<MembershipTier, 'id' | 'memberCount'>) => void;
  updateTier: (id: string, updates: Partial<MembershipTier>) => void;
  deleteTier: (id: string) => void;
  requestPayout: (amount: number) => Promise<void>;
  refreshRevenue: () => Promise<void>;
}

export function useMonetization(): [MonetizationState, MonetizationActions] {
  const [state, setState] = useState<MonetizationState>({
    revenue: { total: 0, ads: 0, memberships: 0, superChats: 0, merchShelf: 0 },
    tiers: [],
    payoutHistory: [],
    timeRange: 'monthly',
    loading: false,
    error: null,
  });

  const setTimeRange = useCallback((range: TimeRange) => {
    setState(prev => ({ ...prev, timeRange: range }));
  }, []);

  const addTier = useCallback((tier: Omit<MembershipTier, 'id' | 'memberCount'>) => {
    const newTier: MembershipTier = { ...tier, id: `tier_${Date.now()}`, memberCount: 0 };
    setState(prev => ({ ...prev, tiers: [...prev.tiers, newTier] }));
  }, []);

  const updateTier = useCallback((id: string, updates: Partial<MembershipTier>) => {
    setState(prev => ({ ...prev, tiers: prev.tiers.map(t => t.id === id ? { ...t, ...updates } : t) }));
  }, []);

  const deleteTier = useCallback((id: string) => {
    setState(prev => ({ ...prev, tiers: prev.tiers.filter(t => t.id !== id) }));
  }, []);

  const requestPayout = useCallback(async (amount: number) => {
    setState(prev => ({ ...prev, loading: true }));
    await new Promise(resolve => setTimeout(resolve, 1000));
    const record: PayoutRecord = { id: `pay_${Date.now()}`, amount, date: new Date().toISOString(), status: 'pending', method: 'Bank Transfer' };
    setState(prev => ({ ...prev, payoutHistory: [record, ...prev.payoutHistory], loading: false }));
  }, []);

  const refreshRevenue = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    setState(prev => ({
      ...prev,
      revenue: { total: 9511.27, ads: 4523.67, memberships: 1890.00, superChats: 756.42, merchShelf: 2341.18 },
      loading: false,
    }));
  }, []);

  return [state, { setTimeRange, addTier, updateTier, deleteTier, requestPayout, refreshRevenue }];
}

export default useMonetization;
