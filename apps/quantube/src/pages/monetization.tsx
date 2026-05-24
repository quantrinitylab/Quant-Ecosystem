// ============================================================================
// QuantTube - Creator Monetization Dashboard
// Revenue charts, earnings breakdown, membership tiers, payout history
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface EarningsBreakdown {
  adsRevenue: number;
  memberships: number;
  superChats: number;
  merchShelf: number;
  total: number;
  percentChange: number;
}

interface MembershipTier {
  id: string;
  name: string;
  price: number;
  perks: string[];
  memberCount: number;
  isEditing: boolean;
}

interface PayoutRecord {
  id: string;
  date: string;
  amount: number;
  status: 'completed' | 'pending' | 'processing' | 'failed';
  method: string;
}

interface PayoutSettings {
  paymentMethod: string;
  threshold: number;
  schedule: 'monthly' | 'weekly' | 'biweekly';
  accountEmail: string;
  bankLast4: string;
}

interface RevenueDataPoint {
  date: string;
  revenue: number;
  views: number;
}

type TimeRange = 'daily' | 'weekly' | 'monthly';

interface MonetizationPageState {
  timeRange: TimeRange;
  earnings: EarningsBreakdown;
  tiers: MembershipTier[];
  payoutHistory: PayoutRecord[];
  settings: PayoutSettings;
  editingTier: string | null;
  loading: boolean;
  error: string | null;
  revenueData: RevenueDataPoint[];
  addingTier: boolean;
  newTierName: string;
  newTierPrice: string;
  newTierPerks: string;
  editingSettings: boolean;
}

const MOCK_EARNINGS: EarningsBreakdown = {
  adsRevenue: 4523.67,
  memberships: 1890.00,
  superChats: 756.42,
  merchShelf: 2341.18,
  total: 9511.27,
  percentChange: 12.4,
};

const MOCK_TIERS: MembershipTier[] = [
  { id: 't1', name: 'Supporter', price: 4.99, perks: ['Custom badge', 'Early access to videos', 'Members-only posts'], memberCount: 342, isEditing: false },
  { id: 't2', name: 'Super Fan', price: 9.99, perks: ['All Supporter perks', 'Monthly live Q&A', 'Behind-the-scenes content', 'Name in credits'], memberCount: 128, isEditing: false },
  { id: 't3', name: 'VIP', price: 24.99, perks: ['All Super Fan perks', '1-on-1 video call (monthly)', 'Exclusive merch discounts', 'Custom emoji', 'Direct message access'], memberCount: 45, isEditing: false },
];

const MOCK_PAYOUT_HISTORY: PayoutRecord[] = [
  { id: 'pay1', date: '2024-01-01', amount: 8245.33, status: 'completed', method: 'Bank Transfer' },
  { id: 'pay2', date: '2023-12-01', amount: 7892.11, status: 'completed', method: 'Bank Transfer' },
  { id: 'pay3', date: '2023-11-01', amount: 6543.89, status: 'completed', method: 'Bank Transfer' },
  { id: 'pay4', date: '2023-10-01', amount: 7123.45, status: 'completed', method: 'PayPal' },
  { id: 'pay5', date: '2024-02-01', amount: 9511.27, status: 'pending', method: 'Bank Transfer' },
  { id: 'pay6', date: '2023-09-01', amount: 5890.22, status: 'completed', method: 'Bank Transfer' },
];

const MOCK_REVENUE_DATA: RevenueDataPoint[] = [
  { date: '2024-01-01', revenue: 312.45, views: 45000 },
  { date: '2024-01-02', revenue: 287.12, views: 41200 },
  { date: '2024-01-03', revenue: 456.78, views: 62300 },
  { date: '2024-01-04', revenue: 523.11, views: 71000 },
  { date: '2024-01-05', revenue: 389.34, views: 53400 },
  { date: '2024-01-06', revenue: 612.89, views: 84500 },
  { date: '2024-01-07', revenue: 445.23, views: 59800 },
  { date: '2024-01-08', revenue: 534.67, views: 72100 },
  { date: '2024-01-09', revenue: 478.90, views: 65400 },
  { date: '2024-01-10', revenue: 601.22, views: 81200 },
  { date: '2024-01-11', revenue: 567.45, views: 76800 },
  { date: '2024-01-12', revenue: 489.33, views: 67300 },
  { date: '2024-01-13', revenue: 723.11, views: 98400 },
  { date: '2024-01-14', revenue: 645.78, views: 87600 },
];

const MOCK_SETTINGS: PayoutSettings = {
  paymentMethod: 'Bank Transfer',
  threshold: 100,
  schedule: 'monthly',
  accountEmail: 'creator@example.com',
  bankLast4: '4567',
};

const formatCurrency = (amount: number): string => `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

const MonetizationPage: React.FC = () => {
  const [state, setState] = useState<MonetizationPageState>({
    timeRange: 'daily',
    earnings: MOCK_EARNINGS,
    tiers: MOCK_TIERS,
    payoutHistory: MOCK_PAYOUT_HISTORY,
    settings: MOCK_SETTINGS,
    editingTier: null,
    loading: true,
    error: null,
    revenueData: [],
    addingTier: false,
    newTierName: '',
    newTierPrice: '',
    newTierPerks: '',
    editingSettings: false,
  });

  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        await new Promise(resolve => setTimeout(resolve, 700));
        setState(prev => ({
          ...prev,
          loading: false,
          revenueData: MOCK_REVENUE_DATA,
        }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load monetization data', loading: false }));
      }
    };
    loadData();
  }, []);

  const setTimeRange = useCallback((range: TimeRange) => {
    setState(prev => ({ ...prev, timeRange: range }));
  }, []);

  const startEditingTier = useCallback((tierId: string) => {
    setState(prev => ({ ...prev, editingTier: tierId }));
  }, []);

  const saveTierEdit = useCallback((tierId: string, updates: Partial<MembershipTier>) => {
    setState(prev => ({
      ...prev,
      tiers: prev.tiers.map(t => t.id === tierId ? { ...t, ...updates } : t),
      editingTier: null,
    }));
  }, []);

  const deleteTier = useCallback((tierId: string) => {
    setState(prev => ({
      ...prev,
      tiers: prev.tiers.filter(t => t.id !== tierId),
    }));
  }, []);

  const addNewTier = useCallback(() => {
    if (!state.newTierName || !state.newTierPrice) return;
    const newTier: MembershipTier = {
      id: `t${Date.now()}`,
      name: state.newTierName,
      price: parseFloat(state.newTierPrice),
      perks: state.newTierPerks.split(',').map(p => p.trim()).filter(Boolean),
      memberCount: 0,
      isEditing: false,
    };
    setState(prev => ({
      ...prev,
      tiers: [...prev.tiers, newTier],
      addingTier: false,
      newTierName: '',
      newTierPrice: '',
      newTierPerks: '',
    }));
  }, [state.newTierName, state.newTierPrice, state.newTierPerks]);

  const toggleSettingsEdit = useCallback(() => {
    setState(prev => ({ ...prev, editingSettings: !prev.editingSettings }));
  }, []);

  const updateSettings = useCallback((field: keyof PayoutSettings, value: string | number) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, [field]: value },
    }));
  }, []);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-400/10';
      case 'pending': return 'text-yellow-400 bg-yellow-400/10';
      case 'processing': return 'text-blue-400 bg-blue-400/10';
      case 'failed': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading monetization data...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center space-y-4">
          <div className="text-red-500 text-4xl">⚠</div>
          <p className="text-white text-lg">{state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const maxRevenue = Math.max(...state.revenueData.map(d => d.revenue));

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Monetization</h1>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">Total Earnings:</span>
            <span className="text-lg font-bold text-green-400">{formatCurrency(state.earnings.total)}</span>
          </div>
        </div>
      </header>

      {/* Revenue Chart */}
      <section className="px-6 py-6">
        <div className="bg-gray-900 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Revenue Overview</h2>
            <div className="flex bg-gray-800 rounded-lg p-1">
              {(['daily', 'weekly', 'monthly'] as TimeRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                    state.timeRange === range
                      ? 'bg-green-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          {/* Chart Placeholder */}
          <div ref={chartRef} className="h-48 flex items-end space-x-1">
            {state.revenueData.map((point, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center group relative">
                <div className="absolute -top-8 bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {formatCurrency(point.revenue)}
                </div>
                <div
                  className="w-full bg-green-500/80 rounded-t hover:bg-green-400 transition-colors cursor-pointer"
                  style={{ height: `${(point.revenue / maxRevenue) * 100}%` }}
                />
                <span className="text-[9px] text-gray-500 mt-1 hidden md:block">{point.date.split('-')[2]}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-gray-400">Last 14 days</span>
            <span className={`font-medium ${state.earnings.percentChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {state.earnings.percentChange >= 0 ? '↑' : '↓'} {Math.abs(state.earnings.percentChange)}% vs previous period
            </span>
          </div>
        </div>
      </section>

      {/* Earnings Breakdown */}
      <section className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4">Earnings Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-xl p-4">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-blue-400 text-lg">📺</span>
              <span className="text-sm text-gray-400">Ads Revenue</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(state.earnings.adsRevenue)}</p>
            <p className="text-xs text-green-400 mt-1">+8.2% this month</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-purple-400 text-lg">👥</span>
              <span className="text-sm text-gray-400">Memberships</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(state.earnings.memberships)}</p>
            <p className="text-xs text-green-400 mt-1">+15.6% this month</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-yellow-400 text-lg">💬</span>
              <span className="text-sm text-gray-400">Super Chats</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(state.earnings.superChats)}</p>
            <p className="text-xs text-red-400 mt-1">-3.1% this month</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-orange-400 text-lg">🛍</span>
              <span className="text-sm text-gray-400">Merch Shelf</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(state.earnings.merchShelf)}</p>
            <p className="text-xs text-green-400 mt-1">+22.4% this month</p>
          </div>
        </div>
      </section>

      {/* Membership Tiers */}
      <section className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Membership Tiers</h2>
          <button
            onClick={() => setState(prev => ({ ...prev, addingTier: true }))}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
          >
            + Add Tier
          </button>
        </div>
        <div className="space-y-4">
          {state.tiers.map(tier => (
            <div key={tier.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              {state.editingTier === tier.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    defaultValue={tier.name}
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    id={`tier-name-${tier.id}`}
                  />
                  <input
                    type="number"
                    defaultValue={tier.price}
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    id={`tier-price-${tier.id}`}
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={() => saveTierEdit(tier.id, {})}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setState(prev => ({ ...prev, editingTier: null }))}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{tier.name}</h3>
                      <p className="text-green-400 font-bold">${tier.price}/month</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-400">{tier.memberCount} members</span>
                      <button
                        onClick={() => startEditingTier(tier.id)}
                        className="text-gray-400 hover:text-white text-sm px-3 py-1 bg-gray-800 rounded-lg"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTier(tier.id)}
                        className="text-red-400 hover:text-red-300 text-sm px-3 py-1 bg-red-900/20 rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tier.perks.map((perk, idx) => (
                      <span key={idx} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-full">
                        {perk}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add Tier Form */}
        {state.addingTier && (
          <div className="mt-4 bg-gray-900 rounded-xl p-5 border border-green-600/30">
            <h3 className="font-semibold mb-3">New Membership Tier</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={state.newTierName}
                onChange={(e) => setState(prev => ({ ...prev, newTierName: e.target.value }))}
                placeholder="Tier name (e.g., Gold Member)"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                value={state.newTierPrice}
                onChange={(e) => setState(prev => ({ ...prev, newTierPrice: e.target.value }))}
                placeholder="Price per month (e.g., 14.99)"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                value={state.newTierPerks}
                onChange={(e) => setState(prev => ({ ...prev, newTierPerks: e.target.value }))}
                placeholder="Perks (comma separated)"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="flex space-x-3">
                <button
                  onClick={addNewTier}
                  className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  Create Tier
                </button>
                <button
                  onClick={() => setState(prev => ({ ...prev, addingTier: false }))}
                  className="px-5 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Payout History */}
      <section className="px-6 py-4">
        <h2 className="text-lg font-semibold mb-4">Payout History</h2>
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="grid grid-cols-4 bg-gray-800 px-4 py-3">
            <span className="text-xs font-medium text-gray-400">Date</span>
            <span className="text-xs font-medium text-gray-400">Amount</span>
            <span className="text-xs font-medium text-gray-400">Status</span>
            <span className="text-xs font-medium text-gray-400">Method</span>
          </div>
          {state.payoutHistory.map(payout => (
            <div key={payout.id} className="grid grid-cols-4 px-4 py-3 border-t border-gray-800 hover:bg-gray-800/50">
              <span className="text-sm text-gray-300">{new Date(payout.date).toLocaleDateString()}</span>
              <span className="text-sm font-medium">{formatCurrency(payout.amount)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center w-fit ${getStatusColor(payout.status)}`}>
                {payout.status}
              </span>
              <span className="text-sm text-gray-400">{payout.method}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Payout Settings */}
      <section className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Payout Settings</h2>
          <button
            onClick={toggleSettingsEdit}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors"
          >
            {state.editingSettings ? 'Done' : 'Edit'}
          </button>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Payment Method</label>
              {state.editingSettings ? (
                <select
                  value={state.settings.paymentMethod}
                  onChange={(e) => updateSettings('paymentMethod', e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="PayPal">PayPal</option>
                  <option value="Wire Transfer">Wire Transfer</option>
                </select>
              ) : (
                <p className="text-white text-sm">{state.settings.paymentMethod} (****{state.settings.bankLast4})</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Minimum Payout Threshold</label>
              {state.editingSettings ? (
                <input
                  type="number"
                  value={state.settings.threshold}
                  onChange={(e) => updateSettings('threshold', parseInt(e.target.value))}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              ) : (
                <p className="text-white text-sm">${state.settings.threshold}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Payout Schedule</label>
              {state.editingSettings ? (
                <select
                  value={state.settings.schedule}
                  onChange={(e) => updateSettings('schedule', e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              ) : (
                <p className="text-white text-sm capitalize">{state.settings.schedule}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Account Email</label>
              {state.editingSettings ? (
                <input
                  type="email"
                  value={state.settings.accountEmail}
                  onChange={(e) => updateSettings('accountEmail', e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              ) : (
                <p className="text-white text-sm">{state.settings.accountEmail}</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default MonetizationPage;
