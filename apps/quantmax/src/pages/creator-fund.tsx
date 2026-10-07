// ============================================================================
// QuantMax - Creator Fund Dashboard
//
// HONESTY NOTE (2026-10-07): this page previously displayed fabricated
// financial data — hardcoded earnings, Math.random() daily charts, invented
// TXN... payout IDs, and made-up eligibility numbers. No Creator Fund backend
// exists yet (no earnings/payout/eligibility endpoints), so every section now
// renders an honest "not available yet" empty state. NEVER render invented
// money numbers here: wire real endpoints first, then replace the placeholders.
// ============================================================================

import React, { useState } from 'react';

type CreatorFundTab = 'overview' | 'videos' | 'payouts' | 'eligibility';

/**
 * Marks the Creator Fund program status. Set `launched: true` only when real
 * backend endpoints exist for earnings, video revenue, payouts, eligibility —
 * and switch each tab from EmptyState to real data loaders at that point.
 */
const CREATOR_FUND_LAUNCHED = false;

const CreatorFundEmptyState: React.FC<{
  icon: string;
  title: string;
  body: string;
}> = ({ icon, title, body }) => (
  <div className="cf-empty-state">
    <span className="cf-empty-icon" aria-hidden="true">{icon}</span>
    <h3 className="cf-empty-title">{title}</h3>
    <p className="cf-empty-body">{body}</p>
  </div>
);

const CreatorFundPage: React.FC = () => {
  const [activeTab, setActiveTab] =
    useState<CreatorFundTab>('overview');

  return (
    <div className="creator-fund-page">
      {/* Header */}
      <div className="cf-header">
        <h1 className="page-title">Creator Fund</h1>
      </div>

      {!CREATOR_FUND_LAUNCHED && (
        <div className="cf-launch-notice">
          <span aria-hidden="true">💡</span>
          <p>
            The Creator Fund hasn&apos;t launched yet. No earnings, payouts, or
            eligibility data exists — nothing here is estimated or projected.
          </p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="cf-tabs">
        {(['overview', 'videos', 'payouts', 'eligibility'] as const).map(tab => (
          <button
            key={tab}
            className={`cf-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="overview-section">
          <CreatorFundEmptyState
            icon="💰"
            title="No earnings yet"
            body="Your total and monthly earnings will appear here once the Creator Fund launches. We never show estimated or sample earnings."
          />
        </div>
      )}

      {/* Videos Tab */}
      {activeTab === 'videos' && (
        <div className="videos-section">
          <CreatorFundEmptyState
            icon="🎬"
            title="No video revenue data"
            body="Per-video views, revenue, and CPM will be listed here once the Creator Fund launches."
          />
        </div>
      )}

      {/* Payouts Tab */}
      {activeTab === 'payouts' && (
        <div className="payouts-section">
          <CreatorFundEmptyState
            icon="🏦"
            title="No payouts yet"
            body="Your payout history and schedule will appear here once the Creator Fund launches. Transaction IDs are only ever shown for real, processed payouts."
          />
        </div>
      )}

      {/* Eligibility Tab */}
      {activeTab === 'eligibility' && (
        <div className="eligibility-section">
          <CreatorFundEmptyState
            icon="✅"
            title="Eligibility not open"
            body="Creator Fund eligibility requirements haven't been published yet. When they are, your real follower, view, and account stats will be checked here."
          />
        </div>
      )}
    </div>
  );
};

export default CreatorFundPage;
