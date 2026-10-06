// ============================================================================
// QuantAds - Create Campaign Page
// Multi-step wizard: Objective->Audience->Placement->Budget->Creative->Review
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface ObjectiveOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  recommended?: boolean;
}

interface AudienceData {
  ageMin: number;
  ageMax: number;
  genders: string[];
  locations: string[];
  interests: string[];
  behaviors: string[];
  customAudiences: string[];
  excludedAudiences: string[];
  estimatedReach: number;
}

interface PlacementData {
  automatic: boolean;
  platforms: string[];
  positions: string[];
  devices: string[];
}

interface BudgetData {
  type: 'daily' | 'lifetime';
  amount: number;
  bidStrategy: 'lowest_cost' | 'cost_cap' | 'bid_cap' | 'target_cost';
  bidAmount?: number;
  schedule: { startDate: string; endDate: string };
  pacing: 'standard' | 'accelerated';
}

interface CreativeData {
  format: 'image' | 'video' | 'carousel' | 'collection';
  headline: string;
  description: string;
  callToAction: string;
  mediaUrls: string[];
  destinationUrl: string;
  displayUrl?: string;
}

interface CampaignFormData {
  name: string;
  objective: string;
  audience: AudienceData;
  placement: PlacementData;
  budget: BudgetData;
  creative: CreativeData;
}

interface ValidationError {
  field: string;
  message: string;
}

const STEPS = ['Objective', 'Audience', 'Placement', 'Budget', 'Creative', 'Review'] as const;

// Maps wizard (lowercase) objective ids -> backend zod enum (uppercase).
const OBJECTIVE_TO_API: Record<string, string> = {
  awareness: 'AWARENESS',
  traffic: 'TRAFFIC',
  conversions: 'CONVERSIONS',
  app_installs: 'APP_INSTALLS',
  video_views: 'ENGAGEMENT',
  lead_gen: 'LEADS',
};

const API_TO_OBJECTIVE: Record<string, string> = Object.fromEntries(
  Object.entries(OBJECTIVE_TO_API).map(([k, v]) => [v, k]),
);

const OBJECTIVES: ObjectiveOption[] = [
  {
    id: 'awareness',
    name: 'Brand Awareness',
    description: 'Increase awareness for your brand',
    icon: '📢',
    recommended: true,
  },
  {
    id: 'traffic',
    name: 'Traffic',
    description: 'Drive traffic to your website or app',
    icon: '🔗',
  },
  {
    id: 'conversions',
    name: 'Conversions',
    description: 'Drive valuable actions on your site',
    icon: '🎯',
  },
  {
    id: 'app_installs',
    name: 'App Installs',
    description: 'Get more people to install your app',
    icon: '📱',
  },
  {
    id: 'video_views',
    name: 'Video Views',
    description: 'Get more people to watch your video',
    icon: '🎬',
  },
  {
    id: 'lead_gen',
    name: 'Lead Generation',
    description: 'Collect leads for your business',
    icon: '📋',
  },
];

const CreateCampaignPage: React.FC = () => {
  const router = useRouter();
  const editId = typeof router.query.edit === 'string' ? router.query.edit : null;
  const isEditMode = editId !== null;

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [formData, setFormData] = useState<CampaignFormData>({
    name: '',
    objective: '',
    audience: {
      ageMin: 18,
      ageMax: 65,
      genders: ['all'],
      locations: [],
      interests: [],
      behaviors: [],
      customAudiences: [],
      excludedAudiences: [],
      estimatedReach: 0,
    },
    placement: {
      automatic: true,
      platforms: ['feed', 'stories', 'reels', 'explore'],
      positions: [],
      devices: ['mobile', 'desktop'],
    },
    budget: {
      type: 'daily',
      amount: 50,
      bidStrategy: 'lowest_cost',
      schedule: { startDate: '', endDate: '' },
      pacing: 'standard',
    },
    creative: {
      format: 'image',
      headline: '',
      description: '',
      callToAction: 'Learn More',
      mediaUrls: [],
      destinationUrl: '',
      displayUrl: '',
    },
  });

  const estimateReach = useCallback((audience: AudienceData): number => {
    let base = 1000000;
    const ageRange = audience.ageMax - audience.ageMin;
    base = Math.floor(base * (ageRange / 50));
    if (audience.locations.length > 0) base = Math.floor(base * (audience.locations.length * 0.3));
    if (audience.interests.length > 0) base = Math.floor(base * 0.6);
    if (audience.behaviors.length > 0) base = Math.floor(base * 0.7);
    return Math.max(10000, Math.min(base, 50000000));
  }, []);

  useEffect(() => {
    const reach = estimateReach(formData.audience);
    if (reach !== formData.audience.estimatedReach) {
      setFormData((prev) => ({ ...prev, audience: { ...prev.audience, estimatedReach: reach } }));
    }
  }, [
    formData.audience.ageMin,
    formData.audience.ageMax,
    formData.audience.locations,
    formData.audience.interests,
    formData.audience.behaviors,
    estimateReach,
  ]);

  const validateStep = useCallback(
    (step: number): ValidationError[] => {
      const stepErrors: ValidationError[] = [];
      switch (step) {
        case 0:
          if (!formData.objective)
            stepErrors.push({ field: 'objective', message: 'Please select a campaign objective' });
          break;
        case 1:
          if (formData.audience.locations.length === 0)
            stepErrors.push({ field: 'locations', message: 'Select at least one location' });
          if (formData.audience.ageMin >= formData.audience.ageMax)
            stepErrors.push({ field: 'age', message: 'Invalid age range' });
          break;
        case 2:
          if (!formData.placement.automatic && formData.placement.platforms.length === 0)
            stepErrors.push({ field: 'platforms', message: 'Select at least one placement' });
          break;
        case 3:
          if (formData.budget.amount <= 0)
            stepErrors.push({ field: 'amount', message: 'Budget must be greater than 0' });
          if (!formData.budget.schedule.startDate)
            stepErrors.push({ field: 'startDate', message: 'Start date is required' });
          break;
        case 4:
          if (!formData.creative.headline)
            stepErrors.push({ field: 'headline', message: 'Headline is required' });
          if (!formData.creative.destinationUrl)
            stepErrors.push({ field: 'destinationUrl', message: 'Destination URL is required' });
          break;
        case 5:
          if (!formData.name)
            stepErrors.push({ field: 'name', message: 'Campaign name is required' });
          break;
      }
      return stepErrors;
    },
    [formData],
  );

  const handleNext = useCallback(() => {
    const stepErrors = validateStep(currentStep);
    if (stepErrors.length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors([]);
    if (currentStep < STEPS.length - 1) setCurrentStep((prev) => prev + 1);
  }, [currentStep, validateStep]);

  const handlePrev = useCallback(() => {
    setErrors([]);
    if (currentStep > 0) setCurrentStep((prev) => prev - 1);
  }, [currentStep]);

  const handleSubmit = useCallback(async () => {
    const stepErrors = validateStep(currentStep);
    if (stepErrors.length > 0) {
      setErrors(stepErrors);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Backend zod schema expects the uppercase objective enum.
      const payload = {
        ...formData,
        objective: OBJECTIVE_TO_API[formData.objective] ?? formData.objective,
      };
      const url = isEditMode
        ? `/api/campaigns/${encodeURIComponent(editId as string)}`
        : '/api/campaigns';
      const response = await fetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error?.message || 'Failed to save campaign');
      }
      window.location.href = '/campaigns';
    } catch (err: any) {
      setError(err.message || 'Failed to save campaign');
    } finally {
      setSubmitting(false);
    }
  }, [formData, currentStep, validateStep, isEditMode, editId]);

  const updateAudience = useCallback((field: keyof AudienceData, value: any) => {
    setFormData((prev) => ({ ...prev, audience: { ...prev.audience, [field]: value } }));
  }, []);

  const updateBudget = useCallback((field: keyof BudgetData, value: any) => {
    setFormData((prev) => ({ ...prev, budget: { ...prev.budget, [field]: value } }));
  }, []);

  const updateCreative = useCallback((field: keyof CreativeData, value: any) => {
    setFormData((prev) => ({ ...prev, creative: { ...prev.creative, [field]: value } }));
  }, []);

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  };

  // Edit mode: load the existing campaign and pre-fill the wizard.
  useEffect(() => {
    if (!router.isReady || !editId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/campaigns/${encodeURIComponent(editId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load campaign');
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const c = json?.data ?? json;
        if (!c || typeof c !== 'object') throw new Error('Campaign not found');
        setFormData((prev) => ({
          ...prev,
          name: typeof c.name === 'string' ? c.name : prev.name,
          objective:
            typeof c.objective === 'string'
              ? (API_TO_OBJECTIVE[c.objective.toUpperCase()] ??
                API_TO_OBJECTIVE[c.objective] ??
                prev.objective)
              : prev.objective,
          budget: {
            ...prev.budget,
            amount:
              typeof c?.budget?.amount === 'number' ? c.budget.amount : prev.budget.amount,
            type: c?.budget?.type === 'lifetime' ? 'lifetime' : 'daily',
          },
        }));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load campaign');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, editId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        <span className="ml-3 text-gray-500">Loading campaign wizard...</span>
      </div>
    );
  }

  return (
    <motion.div
      className="max-w-5xl mx-auto p-6 min-h-screen"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--quant-foreground)]">
          {isEditMode ? 'Edit Campaign' : 'Create Campaign'}
        </h1>
        <div className="flex items-center mt-6 gap-2">
          {STEPS.map((step, idx) => (
            <div key={step} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  idx < currentStep
                    ? 'bg-green-500 text-white'
                    : idx === currentStep
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {idx < currentStep ? '✓' : idx + 1}
              </div>
              <span
                className={`ml-2 text-sm hidden md:inline ${idx === currentStep ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
              >
                {step}
              </span>
              {idx < STEPS.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-2 ${idx < currentStep ? 'bg-green-500' : 'bg-gray-200'}`}
                />
              )}
            </div>
          ))}
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}
      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          {errors.map((e, i) => (
            <p key={i} className="text-yellow-700 text-sm">
              {e.message}
            </p>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border p-6 min-h-[400px]">
        {currentStep === 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Choose Your Objective</h2>
            <p className="text-gray-600 mb-6">What do you want to achieve with this campaign?</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {OBJECTIVES.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setFormData((prev) => ({ ...prev, objective: obj.id }))}
                  className={`p-6 rounded-xl border-2 text-left transition-all ${
                    formData.objective === obj.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="text-3xl mb-3">{obj.icon}</div>
                  <h3 className="font-semibold text-gray-900">{obj.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{obj.description}</p>
                  {obj.recommended && (
                    <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Define Your Audience</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Min Age</label>
                    <input
                      type="number"
                      value={formData.audience.ageMin}
                      onChange={(e) => updateAudience('ageMin', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg"
                      min={13}
                      max={65}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Age</label>
                    <input
                      type="number"
                      value={formData.audience.ageMax}
                      onChange={(e) => updateAudience('ageMax', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg"
                      min={13}
                      max={65}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Locations</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'United States',
                      'United Kingdom',
                      'Canada',
                      'Australia',
                      'Germany',
                      'France',
                      'India',
                      'Japan',
                    ].map((loc) => (
                      <button
                        key={loc}
                        onClick={() => {
                          const locs = formData.audience.locations.includes(loc)
                            ? formData.audience.locations.filter((l) => l !== loc)
                            : [...formData.audience.locations, loc];
                          updateAudience('locations', locs);
                        }}
                        className={`px-3 py-1 rounded-full text-sm ${formData.audience.locations.includes(loc) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interests</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Technology',
                      'Fashion',
                      'Sports',
                      'Food',
                      'Travel',
                      'Gaming',
                      'Music',
                      'Fitness',
                    ].map((interest) => (
                      <button
                        key={interest}
                        onClick={() => {
                          const ints = formData.audience.interests.includes(interest)
                            ? formData.audience.interests.filter((i) => i !== interest)
                            : [...formData.audience.interests, interest];
                          updateAudience('interests', ints);
                        }}
                        className={`px-3 py-1 rounded-full text-sm ${formData.audience.interests.includes(interest) ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-700 mb-2">Estimated Reach</h3>
                <div className="text-3xl font-bold text-blue-600">
                  {formatNumber(formData.audience.estimatedReach)}
                </div>
                <p className="text-sm text-gray-500 mt-1">people per day</p>
                <div className="mt-4 h-2 bg-gray-200 rounded-full">
                  <div
                    className="h-2 bg-blue-500 rounded-full"
                    style={{
                      width: `${Math.min(100, (formData.audience.estimatedReach / 50000000) * 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Specific</span>
                  <span>Broad</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Choose Placements</h2>
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={formData.placement.automatic}
                  onChange={() =>
                    setFormData((prev) => ({
                      ...prev,
                      placement: { ...prev.placement, automatic: true },
                    }))
                  }
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">Automatic Placements (Recommended)</div>
                  <p className="text-sm text-gray-500">
                    Let our system optimize delivery across all placements
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={!formData.placement.automatic}
                  onChange={() =>
                    setFormData((prev) => ({
                      ...prev,
                      placement: { ...prev.placement, automatic: false },
                    }))
                  }
                  className="w-4 h-4"
                />
                <div>
                  <div className="font-medium">Manual Placements</div>
                  <p className="text-sm text-gray-500">Choose where your ads appear</p>
                </div>
              </label>
              {!formData.placement.automatic && (
                <div className="pl-6 space-y-3">
                  {[
                    'Feed',
                    'Stories',
                    'Reels',
                    'Explore',
                    'Search',
                    'Messenger',
                    'Audience Network',
                    'In-Stream Video',
                  ].map((platform) => (
                    <label key={platform} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.placement.platforms.includes(platform.toLowerCase())}
                        onChange={() => {
                          const p = platform.toLowerCase();
                          const platforms = formData.placement.platforms.includes(p)
                            ? formData.placement.platforms.filter((x) => x !== p)
                            : [...formData.placement.platforms, p];
                          setFormData((prev) => ({
                            ...prev,
                            placement: { ...prev.placement, platforms },
                          }));
                        }}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm">{platform}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Set Budget & Schedule</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <button
                  onClick={() => updateBudget('type', 'daily')}
                  className={`flex-1 p-4 rounded-xl border-2 ${formData.budget.type === 'daily' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                >
                  <div className="font-medium">Daily Budget</div>
                  <p className="text-sm text-gray-500">Spend up to this amount per day</p>
                </button>
                <button
                  onClick={() => updateBudget('type', 'lifetime')}
                  className={`flex-1 p-4 rounded-xl border-2 ${formData.budget.type === 'lifetime' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                >
                  <div className="font-medium">Lifetime Budget</div>
                  <p className="text-sm text-gray-500">
                    Spend this total over the campaign duration
                  </p>
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  value={formData.budget.amount}
                  onChange={(e) => updateBudget('amount', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg"
                  min={1}
                  step={5}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bid Strategy</label>
                <select
                  value={formData.budget.bidStrategy}
                  onChange={(e) => updateBudget('bidStrategy', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="lowest_cost">Lowest Cost (Automatic)</option>
                  <option value="cost_cap">Cost Cap</option>
                  <option value="bid_cap">Bid Cap</option>
                  <option value="target_cost">Target Cost</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={formData.budget.schedule.startDate}
                    onChange={(e) =>
                      updateBudget('schedule', {
                        ...formData.budget.schedule,
                        startDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={formData.budget.schedule.endDate}
                    onChange={(e) =>
                      updateBudget('schedule', {
                        ...formData.budget.schedule,
                        endDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Create Your Ad</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
                  <div className="flex gap-2">
                    {(['image', 'video', 'carousel', 'collection'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => updateCreative('format', fmt)}
                        className={`px-4 py-2 rounded-lg text-sm capitalize ${formData.creative.format === fmt ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                  <input
                    type="text"
                    value={formData.creative.headline}
                    onChange={(e) => updateCreative('headline', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Enter headline..."
                    maxLength={40}
                  />
                  <span className="text-xs text-gray-500">
                    {formData.creative.headline.length}/40
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.creative.description}
                    onChange={(e) => updateCreative('description', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={3}
                    placeholder="Enter description..."
                    maxLength={125}
                  />
                  <span className="text-xs text-gray-500">
                    {formData.creative.description.length}/125
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destination URL
                  </label>
                  <input
                    type="url"
                    value={formData.creative.destinationUrl}
                    onChange={(e) => updateCreative('destinationUrl', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Call to Action
                  </label>
                  <select
                    value={formData.creative.callToAction}
                    onChange={(e) => updateCreative('callToAction', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {[
                      'Learn More',
                      'Shop Now',
                      'Sign Up',
                      'Download',
                      'Get Offer',
                      'Book Now',
                      'Contact Us',
                    ].map((cta) => (
                      <option key={cta} value={cta}>
                        {cta}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-700 mb-4">Preview</h3>
                <div className="bg-white rounded-lg shadow p-4 max-w-xs mx-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-blue-200 rounded-full" />
                    <span className="text-sm font-medium">Your Brand</span>
                    <span className="text-xs text-gray-500">Sponsored</span>
                  </div>
                  <div className="bg-gray-200 rounded-lg h-40 flex items-center justify-center text-gray-500 mb-3">
                    {formData.creative.format === 'video' ? '▶ Video' : '🖼 Image'}
                  </div>
                  <h4 className="font-semibold text-sm">
                    {formData.creative.headline || 'Your headline here'}
                  </h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {formData.creative.description || 'Your description here'}
                  </p>
                  <button className="mt-3 w-full py-2 bg-blue-500 text-white text-sm rounded-lg">
                    {formData.creative.callToAction}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Review Campaign</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Enter campaign name..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700">Objective</h4>
                  <p className="text-sm text-gray-600 mt-1 capitalize">
                    {formData.objective || 'Not selected'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700">Budget</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    ${formData.budget.amount} {formData.budget.type}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700">Audience</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {formatNumber(formData.audience.estimatedReach)} estimated reach
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700">Placements</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {formData.placement.automatic
                      ? 'Automatic'
                      : formData.placement.platforms.join(', ')}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700">Schedule</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {formData.budget.schedule.startDate || 'Not set'} -{' '}
                    {formData.budget.schedule.endDate || 'Ongoing'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700">Creative</h4>
                  <p className="text-sm text-gray-600 mt-1 capitalize">
                    {formData.creative.format} - {formData.creative.headline || 'No headline'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          className={`px-6 py-2 rounded-lg font-medium ${currentStep === 0 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          Back
        </button>
        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Launch Campaign'}
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default CreateCampaignPage;
