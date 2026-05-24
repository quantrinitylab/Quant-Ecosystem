// ============================================================================
// QuantTube - Premium Subscription Page
// Ad-free experience, offline, exclusive content, pricing tiers
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  savings?: string;
  features: string[];
  isPopular: boolean;
}

interface PaymentInfo {
  cardNumber: string;
  expiry: string;
  cvc: string;
  nameOnCard: string;
}

interface SubscriptionStatus {
  isActive: boolean;
  plan: string | null;
  nextBilling: string | null;
  startDate: string | null;
}

interface ExclusiveContent {
  id: string;
  title: string;
  thumbnailUrl: string;
  creator: string;
  duration: string;
  type: 'series' | 'movie' | 'documentary';
}

interface FeatureComparison {
  feature: string;
  free: boolean | string;
  premium: boolean | string;
}

interface PremiumPageState {
  selectedPlan: string | null;
  isSubscribed: boolean;
  paymentInfo: PaymentInfo;
  showPaymentForm: boolean;
  loading: boolean;
  error: string | null;
  processing: boolean;
  subscription: SubscriptionStatus;
  showCancelConfirm: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: 11.99,
    period: '/month',
    description: 'Flexible monthly billing',
    features: ['Ad-free videos', 'Background play', 'Offline downloads', 'Premium music access'],
    isPopular: false,
  },
  {
    id: 'annual',
    name: 'Annual',
    price: 119.99,
    period: '/year',
    description: 'Save 17% with annual billing',
    savings: 'Save $23.89/year',
    features: ['All Monthly features', '2 months free', 'Early access to features', 'Exclusive member badge'],
    isPopular: true,
  },
  {
    id: 'family',
    name: 'Family',
    price: 22.99,
    period: '/month',
    description: 'Up to 5 family members',
    features: ['All Annual features', '5 accounts included', 'Parental controls', 'Family Mix playlists', 'Shared downloads'],
    isPopular: false,
  },
];

const FEATURE_COMPARISON: FeatureComparison[] = [
  { feature: 'Watch videos', free: true, premium: true },
  { feature: 'Ad-free experience', free: false, premium: true },
  { feature: 'Background playback', free: false, premium: true },
  { feature: 'Offline downloads', free: false, premium: true },
  { feature: 'Premium music streaming', free: false, premium: true },
  { feature: 'Exclusive originals', free: false, premium: true },
  { feature: '4K video quality', free: '720p max', premium: '4K HDR' },
  { feature: 'Audio quality', free: 'Standard', premium: 'Hi-Fi / Spatial' },
  { feature: 'Simultaneous streams', free: '1', premium: '4' },
  { feature: 'Creator support bonus', free: false, premium: true },
];

const EXCLUSIVE_CONTENT: ExclusiveContent[] = [
  { id: 'ec1', title: 'Behind the Algorithm', thumbnailUrl: '/thumbs/exclusive1.jpg', creator: 'QuantTube Originals', duration: '8 episodes', type: 'series' },
  { id: 'ec2', title: 'The Creator Economy', thumbnailUrl: '/thumbs/exclusive2.jpg', creator: 'Business Insider', duration: '2h 14m', type: 'documentary' },
  { id: 'ec3', title: 'Code Warriors', thumbnailUrl: '/thumbs/exclusive3.jpg', creator: 'Tech Studios', duration: '12 episodes', type: 'series' },
  { id: 'ec4', title: 'Into the Deep', thumbnailUrl: '/thumbs/exclusive4.jpg', creator: 'Nature Films', duration: '1h 52m', type: 'movie' },
  { id: 'ec5', title: 'Sound Design Masterclass', thumbnailUrl: '/thumbs/exclusive5.jpg', creator: 'Audio Academy', duration: '6 episodes', type: 'series' },
  { id: 'ec6', title: 'Startup or Bust', thumbnailUrl: '/thumbs/exclusive6.jpg', creator: 'QuantTube Originals', duration: '10 episodes', type: 'series' },
];

const BENEFITS = [
  { icon: '🚫', title: 'No Ads', description: 'Watch without interruptions across all devices' },
  { icon: '📱', title: 'Background Play', description: 'Listen with your screen off or while using other apps' },
  { icon: '⬇️', title: 'Downloads', description: 'Save videos and music for offline viewing' },
  { icon: '🎵', title: 'Premium Music', description: 'Unlimited music streaming with playlists and radio' },
  { icon: '🎬', title: 'Exclusive Content', description: 'Access Premium originals and member-only videos' },
  { icon: '🎧', title: 'Hi-Fi Audio', description: 'Enhanced audio quality with spatial sound support' },
];

const PremiumPage: React.FC = () => {
  const [state, setState] = useState<PremiumPageState>({
    selectedPlan: null,
    isSubscribed: false,
    paymentInfo: { cardNumber: '', expiry: '', cvc: '', nameOnCard: '' },
    showPaymentForm: false,
    loading: true,
    error: null,
    processing: false,
    subscription: { isActive: false, plan: null, nextBilling: null, startDate: null },
    showCancelConfirm: false,
  });

  const paymentFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        await new Promise(resolve => setTimeout(resolve, 500));
        setState(prev => ({ ...prev, loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load subscription info', loading: false }));
      }
    };
    loadSubscription();
  }, []);

  const selectPlan = useCallback((planId: string) => {
    setState(prev => ({ ...prev, selectedPlan: planId, showPaymentForm: true }));
    setTimeout(() => {
      paymentFormRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const updatePaymentInfo = useCallback((field: keyof PaymentInfo, value: string) => {
    setState(prev => ({
      ...prev,
      paymentInfo: { ...prev.paymentInfo, [field]: value },
    }));
  }, []);

  const handleSubscribe = useCallback(async () => {
    setState(prev => ({ ...prev, processing: true }));
    await new Promise(resolve => setTimeout(resolve, 2000));
    const plan = PRICING_PLANS.find(p => p.id === state.selectedPlan);
    setState(prev => ({
      ...prev,
      processing: false,
      isSubscribed: true,
      showPaymentForm: false,
      subscription: {
        isActive: true,
        plan: plan?.name || null,
        nextBilling: '2024-02-15',
        startDate: new Date().toISOString().split('T')[0],
      },
    }));
  }, [state.selectedPlan]);

  const handleCancel = useCallback(async () => {
    setState(prev => ({ ...prev, processing: true }));
    await new Promise(resolve => setTimeout(resolve, 1000));
    setState(prev => ({
      ...prev,
      processing: false,
      isSubscribed: false,
      showCancelConfirm: false,
      subscription: { isActive: false, plan: null, nextBilling: null, startDate: null },
    }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading premium...</p>
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
            className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-red-900/40 to-gray-950 py-16 px-6 text-center">
        <h1 className="text-4xl font-bold mb-3">QuantTube Premium</h1>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto mb-8">
          The ultimate viewing experience. Ad-free, offline, exclusive content, and so much more.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {BENEFITS.map((benefit, idx) => (
            <div key={idx} className="bg-gray-900/60 backdrop-blur rounded-xl p-4 text-center">
              <div className="text-3xl mb-2">{benefit.icon}</div>
              <h3 className="text-sm font-semibold">{benefit.title}</h3>
              <p className="text-xs text-gray-400 mt-1">{benefit.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Current Subscription Status */}
      {state.isSubscribed && (
        <section className="px-6 py-6">
          <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-600/30 rounded-2xl p-6">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <h2 className="text-lg font-semibold text-green-400">Active Subscription</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400">Plan</p>
                <p className="text-sm font-medium">{state.subscription.plan}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Since</p>
                <p className="text-sm font-medium">{state.subscription.startDate}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Next Billing</p>
                <p className="text-sm font-medium">{state.subscription.nextBilling}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Feature Comparison Table */}
      <section className="px-6 py-8">
        <h2 className="text-2xl font-bold text-center mb-6">Free vs Premium</h2>
        <div className="max-w-2xl mx-auto bg-gray-900 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-3 bg-gray-800 p-4">
            <div className="text-sm font-medium text-gray-400">Feature</div>
            <div className="text-sm font-medium text-center">Free</div>
            <div className="text-sm font-medium text-center text-red-400">Premium</div>
          </div>
          {FEATURE_COMPARISON.map((row, idx) => (
            <div key={idx} className={`grid grid-cols-3 p-4 ${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'}`}>
              <div className="text-sm text-gray-300">{row.feature}</div>
              <div className="text-center">
                {typeof row.free === 'boolean' ? (
                  <span className={row.free ? 'text-green-400' : 'text-gray-600'}>{row.free ? '✓' : '✕'}</span>
                ) : (
                  <span className="text-xs text-gray-400">{row.free}</span>
                )}
              </div>
              <div className="text-center">
                {typeof row.premium === 'boolean' ? (
                  <span className={row.premium ? 'text-green-400' : 'text-gray-600'}>{row.premium ? '✓' : '✕'}</span>
                ) : (
                  <span className="text-xs text-red-300">{row.premium}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="px-6 py-8">
        <h2 className="text-2xl font-bold text-center mb-6">Choose Your Plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {PRICING_PLANS.map(plan => (
            <div
              key={plan.id}
              className={`relative bg-gray-900 rounded-2xl p-6 border-2 transition-all cursor-pointer hover:scale-105 ${
                state.selectedPlan === plan.id
                  ? 'border-red-500 shadow-lg shadow-red-500/20'
                  : plan.isPopular
                  ? 'border-red-500/50'
                  : 'border-gray-700'
              }`}
              onClick={() => selectPlan(plan.id)}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </div>
              )}
              <h3 className="text-lg font-bold mt-2">{plan.name}</h3>
              <div className="flex items-baseline mt-2">
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-gray-400 text-sm ml-1">{plan.period}</span>
              </div>
              {plan.savings && (
                <p className="text-green-400 text-sm mt-1">{plan.savings}</p>
              )}
              <p className="text-gray-400 text-sm mt-2">{plan.description}</p>
              <ul className="mt-4 space-y-2">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center space-x-2 text-sm">
                    <span className="text-green-400">✓</span>
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={(e) => { e.stopPropagation(); selectPlan(plan.id); }}
                className={`w-full mt-6 py-3 rounded-xl font-semibold transition-colors ${
                  state.selectedPlan === plan.id
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                {state.isSubscribed ? 'Switch Plan' : 'Select Plan'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Payment Form */}
      {state.showPaymentForm && (
        <section ref={paymentFormRef} className="px-6 py-8">
          <div className="max-w-md mx-auto bg-gray-900 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-4">Payment Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name on Card</label>
                <input
                  type="text"
                  value={state.paymentInfo.nameOnCard}
                  onChange={(e) => updatePaymentInfo('nameOnCard', e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Card Number</label>
                <input
                  type="text"
                  value={state.paymentInfo.cardNumber}
                  onChange={(e) => updatePaymentInfo('cardNumber', e.target.value)}
                  placeholder="4242 4242 4242 4242"
                  maxLength={19}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Expiry</label>
                  <input
                    type="text"
                    value={state.paymentInfo.expiry}
                    onChange={(e) => updatePaymentInfo('expiry', e.target.value)}
                    placeholder="MM/YY"
                    maxLength={5}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">CVC</label>
                  <input
                    type="text"
                    value={state.paymentInfo.cvc}
                    onChange={(e) => updatePaymentInfo('cvc', e.target.value)}
                    placeholder="123"
                    maxLength={4}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>
              <button
                onClick={handleSubscribe}
                disabled={state.processing}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
              >
                {state.processing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Subscribe Now</span>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Manage Subscription */}
      {state.isSubscribed && (
        <section className="px-6 py-6">
          <h2 className="text-xl font-bold mb-4">Manage Subscription</h2>
          <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
            <button className="w-full text-left px-4 py-3 bg-gray-800 rounded-xl text-sm text-gray-300 hover:bg-gray-700 transition-colors">
              Change Plan
            </button>
            <button className="w-full text-left px-4 py-3 bg-gray-800 rounded-xl text-sm text-gray-300 hover:bg-gray-700 transition-colors">
              Update Payment Method
            </button>
            <button className="w-full text-left px-4 py-3 bg-gray-800 rounded-xl text-sm text-gray-300 hover:bg-gray-700 transition-colors">
              Billing History
            </button>
            <button
              onClick={() => setState(prev => ({ ...prev, showCancelConfirm: true }))}
              className="w-full text-left px-4 py-3 bg-red-900/20 border border-red-600/30 rounded-xl text-sm text-red-400 hover:bg-red-900/30 transition-colors"
            >
              Cancel Subscription
            </button>
          </div>
          {state.showCancelConfirm && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full space-y-4">
                <h3 className="text-lg font-bold">Cancel Subscription?</h3>
                <p className="text-gray-400 text-sm">You will lose access to Premium features at the end of your billing period.</p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setState(prev => ({ ...prev, showCancelConfirm: false }))}
                    className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Keep Premium
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Exclusive Content Preview */}
      <section className="px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">Exclusive Content</h2>
        <p className="text-gray-400 text-sm mb-6">Only available with Premium</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {EXCLUSIVE_CONTENT.map(content => (
            <div key={content.id} className="group cursor-pointer">
              <div className="relative aspect-video rounded-xl bg-gray-800 overflow-hidden mb-2">
                <img src={content.thumbnailUrl} alt={content.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                  PREMIUM
                </div>
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                  {content.duration}
                </div>
                {!state.isSubscribed && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm font-medium">🔒 Premium Only</span>
                  </div>
                )}
              </div>
              <p className="text-sm font-medium truncate">{content.title}</p>
              <p className="text-xs text-gray-400">{content.creator}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default PremiumPage;
