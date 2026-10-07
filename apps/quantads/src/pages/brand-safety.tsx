// ============================================================================
// QuantAds - Brand Safety Page
// Keyword blocklist, content category toggles, placement exclusions, inventory
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface BlocklistEntry {
  id: string;
  keyword: string;
  matchType: 'exact' | 'phrase' | 'broad';
  blockedImpressions: number;
  addedAt: string;
  isActive: boolean;
}

interface ContentCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  riskLevel: 'safe' | 'low' | 'medium' | 'high';
  impressionsBlocked: number;
}

interface PlacementExclusion {
  id: string;
  type: 'domain' | 'app' | 'channel' | 'page';
  value: string;
  reason: string;
  blockedSince: string;
  impressionsBlocked: number;
}

interface InventoryFilter {
  type: 'standard' | 'limited' | 'full';
  name: string;
  description: string;
  estimatedReach: number;
}

interface BrandSafetyScore {
  overall: number;
  contentSafety: number;
  adPlacement: number;
  contextualRelevance: number;
  lastUpdated: string;
}

interface BrandSafetyPageProps {
  accountId?: string;
}

const DEFAULT_CATEGORIES: ContentCategory[] = [
  {
    id: 'adult',
    name: 'Adult Content',
    description: 'Explicit sexual content and nudity',
    icon: '🔞',
    enabled: false,
    riskLevel: 'high',
    impressionsBlocked: 0,
  },
  {
    id: 'violence',
    name: 'Violence & Gore',
    description: 'Graphic violence and disturbing imagery',
    icon: '⚔️',
    enabled: false,
    riskLevel: 'high',
    impressionsBlocked: 0,
  },
  {
    id: 'hate_speech',
    name: 'Hate Speech',
    description: 'Discriminatory and hateful content',
    icon: '🚫',
    enabled: false,
    riskLevel: 'high',
    impressionsBlocked: 0,
  },
  {
    id: 'drugs',
    name: 'Drugs & Alcohol',
    description: 'Drug use and promotion',
    icon: '💊',
    enabled: false,
    riskLevel: 'high',
    impressionsBlocked: 0,
  },
  {
    id: 'gambling',
    name: 'Gambling',
    description: 'Online gambling and betting',
    icon: '🎰',
    enabled: true,
    riskLevel: 'medium',
    impressionsBlocked: 0,
  },
  {
    id: 'politics',
    name: 'Political Content',
    description: 'Controversial political content',
    icon: '🏛️',
    enabled: true,
    riskLevel: 'medium',
    impressionsBlocked: 0,
  },
  {
    id: 'news_negative',
    name: 'Negative News',
    description: 'Tragedy, disasters, and conflicts',
    icon: '📰',
    enabled: true,
    riskLevel: 'medium',
    impressionsBlocked: 0,
  },
  {
    id: 'profanity',
    name: 'Profanity',
    description: 'Strong language and profanity',
    icon: '🤬',
    enabled: true,
    riskLevel: 'low',
    impressionsBlocked: 0,
  },
  {
    id: 'controversy',
    name: 'Controversial Topics',
    description: 'Debatable and sensitive topics',
    icon: '💬',
    enabled: true,
    riskLevel: 'low',
    impressionsBlocked: 0,
  },
  {
    id: 'ugc',
    name: 'User Generated Content',
    description: 'Unmoderated user content',
    icon: '👤',
    enabled: true,
    riskLevel: 'low',
    impressionsBlocked: 0,
  },
];

const INVENTORY_TYPES: InventoryFilter[] = [
  {
    type: 'limited',
    name: 'Limited Inventory',
    description: 'Only premium, brand-safe environments',
    estimatedReach: 45,
  },
  {
    type: 'standard',
    name: 'Standard Inventory',
    description: 'Balanced safety and reach',
    estimatedReach: 75,
  },
  {
    type: 'full',
    name: 'Full Inventory',
    description: 'Maximum reach across all placements',
    estimatedReach: 100,
  },
];

const BrandSafetyPage: React.FC<BrandSafetyPageProps> = ({ accountId: _accountId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [categories, setCategories] = useState<ContentCategory[]>(DEFAULT_CATEGORIES);
  const [exclusions, setExclusions] = useState<PlacementExclusion[]>([]);
  const [inventoryType, setInventoryType] = useState<'limited' | 'standard' | 'full'>('standard');
  const [safetyScore, setSafetyScore] = useState<BrandSafetyScore | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'keywords' | 'categories' | 'exclusions' | 'inventory'
  >('overview');
  const [newKeyword, setNewKeyword] = useState<string>('');
  const [newMatchType, setNewMatchType] = useState<'exact' | 'phrase' | 'broad'>('phrase');
  const [newExclusionValue, setNewExclusionValue] = useState<string>('');
  const [newExclusionType, setNewExclusionType] = useState<'domain' | 'app' | 'channel'>('domain');
  const [saving, setSaving] = useState<boolean>(false);

  const fetchBrandSafety = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/brand-safety');
      if (!response.ok) throw new Error('Failed to load brand safety settings');
      const data = await response.json();
      setBlocklist(data.blocklist || []);
      if (data.categories) setCategories(data.categories);
      setExclusions(data.exclusions || []);
      setInventoryType(data.inventoryType || 'standard');
      setSafetyScore(data.score || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load brand safety data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrandSafety();
  }, [fetchBrandSafety]);

  const addKeyword = useCallback(async () => {
    if (!newKeyword.trim()) return;
    setSaving(true);
    try {
      const response = await fetch('/api/brand-safety/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: newKeyword.trim(), matchType: newMatchType }),
      });
      if (!response.ok) throw new Error('Failed to add keyword');
      const entry = await response.json();
      setBlocklist((prev) => [entry, ...prev]);
      setNewKeyword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [newKeyword, newMatchType]);

  const removeKeyword = useCallback(async (id: string) => {
    await fetch(`/api/brand-safety/keywords/${id}`, { method: 'DELETE' });
    setBlocklist((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const toggleCategory = useCallback(
    async (id: string) => {
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
      try {
        const cat = categories.find((c) => c.id === id);
        await fetch(`/api/brand-safety/categories/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !cat?.enabled }),
        });
      } catch {}
    },
    [categories],
  );

  const addExclusion = useCallback(async () => {
    if (!newExclusionValue.trim()) return;
    setSaving(true);
    try {
      const response = await fetch('/api/brand-safety/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newExclusionType,
          value: newExclusionValue.trim(),
          reason: 'Manual exclusion',
        }),
      });
      if (!response.ok) throw new Error('Failed to add exclusion');
      const exclusion = await response.json();
      setExclusions((prev) => [exclusion, ...prev]);
      setNewExclusionValue('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [newExclusionValue, newExclusionType]);

  const removeExclusion = useCallback(async (id: string) => {
    await fetch(`/api/brand-safety/exclusions/${id}`, { method: 'DELETE' });
    setExclusions((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateInventoryType = useCallback(async (type: 'limited' | 'standard' | 'full') => {
    setInventoryType(type);
    await fetch('/api/brand-safety/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
  }, []);

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        <span className="ml-3 text-gray-500">Loading brand safety...</span>
      </div>
    );
  }

  if (error && !safetyScore) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Brand Safety Error</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={fetchBrandSafety} className="px-6 py-2 bg-blue-500 text-white rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div
      className="max-w-7xl mx-auto p-6 min-h-screen"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--quant-foreground)]">Brand Safety</h1>
        <p className="text-gray-500 text-sm mt-1">
          Protect your brand reputation across all ad placements
        </p>
      </header>

      {safetyScore && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border p-5 text-center">
            <p className="text-xs text-gray-500">Overall Score</p>
            <p className={`text-3xl font-bold ${getScoreColor(safetyScore.overall)}`}>
              {safetyScore.overall}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5 text-center">
            <p className="text-xs text-gray-500">Content Safety</p>
            <p className={`text-3xl font-bold ${getScoreColor(safetyScore.contentSafety)}`}>
              {safetyScore.contentSafety}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5 text-center">
            <p className="text-xs text-gray-500">Ad Placement</p>
            <p className={`text-3xl font-bold ${getScoreColor(safetyScore.adPlacement)}`}>
              {safetyScore.adPlacement}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5 text-center">
            <p className="text-xs text-gray-500">Contextual Relevance</p>
            <p className={`text-3xl font-bold ${getScoreColor(safetyScore.contextualRelevance)}`}>
              {safetyScore.contextualRelevance}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b">
        {(['overview', 'keywords', 'categories', 'exclusions', 'inventory'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 ${activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Quick Stats</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Blocked Keywords</span>
                <span className="font-medium">{blocklist.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Active Categories</span>
                <span className="font-medium">
                  {categories.filter((c) => c.enabled).length}/{categories.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Placement Exclusions</span>
                <span className="font-medium">{exclusions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Inventory Type</span>
                <span className="font-medium capitalize">{inventoryType}</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Risk Categories Blocked</h2>
            <div className="space-y-2">
              {categories
                .filter((c) => !c.enabled)
                .map((c) => (
                  <div key={c.id} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                    <span>{c.icon}</span>
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="ml-auto text-xs text-red-600">Blocked</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'keywords' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="Add keyword..."
              className="flex-1 max-w-sm px-3 py-2 border rounded-lg"
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
            />
            <select
              value={newMatchType}
              onChange={(e) => setNewMatchType(e.target.value as any)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="exact">Exact</option>
              <option value="phrase">Phrase</option>
              <option value="broad">Broad</option>
            </select>
            <button
              onClick={addKeyword}
              disabled={saving || !newKeyword.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {blocklist.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No blocked keywords. Add keywords to block ads from appearing near specific content.
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                      Keyword
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                      Match Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                      Blocked
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {blocklist.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{entry.keyword}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded capitalize">
                          {entry.matchType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {entry.blockedImpressions.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeKeyword(entry.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`bg-white rounded-xl shadow-sm border p-4 ${!cat.enabled ? 'border-red-200 bg-red-50/30' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <div>
                    <h3 className="font-medium">{cat.name}</h3>
                    <p className="text-xs text-gray-500">{cat.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${cat.enabled ? 'bg-green-500' : 'bg-red-500'}`}
                >
                  <div
                    className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${cat.enabled ? 'translate-x-6' : 'translate-x-0.5'}`}
                  />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${cat.riskLevel === 'high' ? 'bg-red-100 text-red-700' : cat.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
                >
                  {cat.riskLevel} risk
                </span>
                {cat.impressionsBlocked > 0 && (
                  <span className="text-xs text-gray-500">
                    {cat.impressionsBlocked.toLocaleString()} blocked
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'exclusions' && (
        <div>
          <div className="flex gap-2 mb-4">
            <select
              value={newExclusionType}
              onChange={(e) => setNewExclusionType(e.target.value as any)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="domain">Domain</option>
              <option value="app">App</option>
              <option value="channel">Channel</option>
            </select>
            <input
              type="text"
              value={newExclusionValue}
              onChange={(e) => setNewExclusionValue(e.target.value)}
              placeholder="Enter domain, app, or channel..."
              className="flex-1 max-w-md px-3 py-2 border rounded-lg"
            />
            <button
              onClick={addExclusion}
              disabled={saving}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {exclusions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No placement exclusions configured</div>
          ) : (
            <div className="space-y-2">
              {exclusions.map((excl) => (
                <div
                  key={excl.id}
                  className="bg-white rounded-lg border p-3 flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded capitalize mr-2">
                      {excl.type}
                    </span>
                    <span className="font-medium text-sm">{excl.value}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {excl.impressionsBlocked.toLocaleString()} blocked
                    </span>
                  </div>
                  <button
                    onClick={() => removeExclusion(excl.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {INVENTORY_TYPES.map((inv) => (
            <button
              key={inv.type}
              onClick={() => updateInventoryType(inv.type)}
              className={`w-full text-left p-6 rounded-xl border-2 transition-all ${inventoryType === inv.type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{inv.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{inv.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-600">{inv.estimatedReach}%</p>
                  <p className="text-xs text-gray-500">reach</p>
                </div>
              </div>
              <div className="mt-3 h-2 bg-gray-200 rounded-full">
                <div
                  className="h-2 bg-blue-500 rounded-full"
                  style={{ width: `${inv.estimatedReach}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default BrandSafetyPage;
