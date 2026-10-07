// ============================================================================
// QuantSync - Verification Page
// Badge types, application form, requirements checklist, status tracker
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface VerificationStatus {
  hasApplied: boolean;
  status: 'none' | 'pending' | 'approved' | 'rejected';
  badgeType?: 'blue' | 'gold' | 'gray';
  appliedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

interface VerificationRequirements {
  minFollowers: number;
  minPosts: number;
  accountAge: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  noViolations: boolean;
}

interface UserEligibility {
  followers: number;
  posts: number;
  accountAgeDays: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  violationsCount: number;
  meetsRequirements: boolean;
}

type BadgeType = 'blue' | 'gold' | 'gray';

const BADGE_INFO: Record<
  BadgeType,
  { label: string; description: string; icon: string; color: string }
> = {
  blue: {
    label: 'Individual',
    description: 'For notable individuals, creators, and public figures',
    icon: '✓',
    color: 'text-blue-500 bg-blue-50',
  },
  gold: {
    label: 'Organization',
    description: 'For businesses, brands, and official organizations',
    icon: '✓',
    color: 'text-yellow-600 bg-yellow-50',
  },
  gray: {
    label: 'Government',
    description: 'For government officials and institutions',
    icon: '✓',
    color: 'text-gray-600 bg-gray-100',
  },
};

const VerificationPage: React.FC = () => {
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    hasApplied: false,
    status: 'none',
  });
  const [eligibility, setEligibility] = useState<UserEligibility | null>(null);
  const [requirements, setRequirements] = useState<VerificationRequirements | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeType>('blue');
  const [applicationReason, setApplicationReason] = useState<string>('');
  const [links, setLinks] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [category, setCategory] = useState<string>('creator');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, eligRes, reqRes] = await Promise.all([
        fetch('/api/verification/status'),
        fetch('/api/verification/eligibility'),
        fetch('/api/verification/requirements'),
      ]);
      if (statusRes.ok) setVerificationStatus(await statusRes.json());
      if (eligRes.ok) setEligibility(await eligRes.json());
      if (reqRes.ok) setRequirements(await reqRes.json());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = useCallback(async () => {
    if (!applicationReason.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/verification/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badgeType: selectedBadge,
          reason: applicationReason,
          links: links.filter((l) => l.trim()),
          category,
        }),
      });
      if (!res.ok) throw new Error('Application failed');
      setVerificationStatus({
        hasApplied: true,
        status: 'pending',
        appliedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedBadge, applicationReason, links, category]);

  const addLink = useCallback(() => {
    setLinks((prev) => [...prev, '']);
  }, []);

  const updateLink = useCallback((idx: number, value: string) => {
    setLinks((prev) => prev.map((l, i) => (i === idx ? value : l)));
  }, []);

  const removeLink = useCallback((idx: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error && !eligibility) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load verification</div>
        <button onClick={fetchData} className="px-6 py-2 bg-blue-500 text-white rounded-full">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen p-4 bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <h1 className="text-2xl font-bold mb-6">Verification</h1>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-4">Badge Types</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.entries(BADGE_INFO) as [BadgeType, (typeof BADGE_INFO)['blue']][]).map(
            ([type, info]) => (
              <div
                key={type}
                className={`border rounded-xl p-4 cursor-pointer transition-all ${selectedBadge === type ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}`}
                onClick={() => setSelectedBadge(type)}
              >
                <div
                  className={`w-10 h-10 rounded-full ${info.color} flex items-center justify-center text-lg font-bold mb-3`}
                >
                  {info.icon}
                </div>
                <h3 className="font-bold text-sm mb-1">{info.label}</h3>
                <p className="text-xs text-gray-600">{info.description}</p>
              </div>
            ),
          )}
        </div>
      </section>

      {verificationStatus.status === 'approved' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-lg font-bold text-green-700">You are verified!</h3>
          <p className="text-sm text-green-600 mt-1">Badge type: {verificationStatus.badgeType}</p>
          {verificationStatus.reviewedAt && (
            <p className="text-xs text-gray-500 mt-2">
              Approved on {new Date(verificationStatus.reviewedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {verificationStatus.status === 'pending' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
          <h3 className="font-bold text-yellow-700 mb-2">Application Under Review</h3>
          <p className="text-sm text-yellow-600">
            Your application is being reviewed. This usually takes 3-5 business days.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">
                ✓
              </div>
              <span className="text-xs">Submitted</span>
            </div>
            <div className="h-0.5 w-8 bg-yellow-300" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-yellow-400 text-white flex items-center justify-center text-xs animate-pulse">
                ⋯
              </div>
              <span className="text-xs">In Review</span>
            </div>
            <div className="h-0.5 w-8 bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-xs">
                ?
              </div>
              <span className="text-xs text-gray-400">Decision</span>
            </div>
          </div>
          {verificationStatus.appliedAt && (
            <p className="text-xs text-gray-500 mt-3">
              Applied {new Date(verificationStatus.appliedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {verificationStatus.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
          <h3 className="font-bold text-red-700 mb-2">Application Not Approved</h3>
          <p className="text-sm text-red-600">
            {verificationStatus.rejectionReason ||
              'Your application did not meet the requirements at this time.'}
          </p>
          <p className="text-xs text-gray-500 mt-2">You can reapply in 30 days.</p>
        </div>
      )}

      {eligibility && requirements && (
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">Requirements Checklist</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${eligibility.followers >= requirements.minFollowers ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {eligibility.followers >= requirements.minFollowers ? '✓' : '✕'}
              </span>
              <div className="flex-1">
                <span className="text-sm">Minimum {requirements.minFollowers} followers</span>
                <span className="text-xs text-gray-500 ml-2">
                  (you have {eligibility.followers})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${eligibility.posts >= requirements.minPosts ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {eligibility.posts >= requirements.minPosts ? '✓' : '✕'}
              </span>
              <div className="flex-1">
                <span className="text-sm">Minimum {requirements.minPosts} posts</span>
                <span className="text-xs text-gray-500 ml-2">(you have {eligibility.posts})</span>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${eligibility.accountAgeDays >= requirements.accountAge ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {eligibility.accountAgeDays >= requirements.accountAge ? '✓' : '✕'}
              </span>
              <div className="flex-1">
                <span className="text-sm">Account at least {requirements.accountAge} days old</span>
                <span className="text-xs text-gray-500 ml-2">
                  ({eligibility.accountAgeDays} days)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${eligibility.emailVerified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {eligibility.emailVerified ? '✓' : '✕'}
              </span>
              <span className="text-sm">Email verified</span>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${eligibility.phoneVerified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {eligibility.phoneVerified ? '✓' : '✕'}
              </span>
              <span className="text-sm">Phone verified</span>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${eligibility.violationsCount === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {eligibility.violationsCount === 0 ? '✓' : '✕'}
              </span>
              <span className="text-sm">No recent violations</span>
            </div>
          </div>
        </section>
      )}

      {verificationStatus.status === 'none' || verificationStatus.status === 'rejected' ? (
        <section>
          <h2 className="text-lg font-bold mb-4">Apply for Verification</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="creator">Content Creator</option>
                <option value="journalist">Journalist</option>
                <option value="athlete">Athlete</option>
                <option value="entertainer">Entertainer</option>
                <option value="business">Business</option>
                <option value="government">Government</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Why should you be verified?</label>
              <textarea
                value={applicationReason}
                onChange={(e) => setApplicationReason(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 min-h-[100px]"
                placeholder="Explain why you deserve verification..."
                maxLength={500}
              />
              <span className="text-xs text-gray-400">{applicationReason.length}/500</span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Supporting links (news articles, official website, etc.)
              </label>
              {links.map((link, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => updateLink(idx, e.target.value)}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                  {links.length > 1 && (
                    <button onClick={() => removeLink(idx)} className="text-red-500">
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addLink} className="text-blue-500 text-sm">
                + Add link
              </button>
            </div>
            <button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !applicationReason.trim() ||
                (eligibility != null && !eligibility.meetsRequirements)
              }
              className="w-full py-3 bg-blue-500 text-white rounded-full font-medium disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
            {eligibility && !eligibility.meetsRequirements && (
              <p className="text-xs text-red-500 text-center">
                You do not meet all requirements yet.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default VerificationPage;
