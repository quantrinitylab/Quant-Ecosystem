// ============================================================================
// QuantSync - Creator Analytics Page
// Impressions, engagement charts, top posts, follower growth, demographics
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface AnalyticsOverview {
  impressions: number;
  impressionsChange: number;
  engagementRate: number;
  engagementChange: number;
  followers: number;
  followersChange: number;
  profileVisits: number;
  profileVisitsChange: number;
}

interface DailyMetric {
  date: string;
  impressions: number;
  engagements: number;
  followers: number;
}

interface TopPost {
  id: string;
  content: string;
  impressions: number;
  engagements: number;
  likes: number;
  reposts: number;
  replies: number;
  createdAt: string;
}

interface DemographicData {
  ageGroups: { range: string; percentage: number }[];
  locations: { country: string; percentage: number }[];
  genders: { type: string; percentage: number }[];
}

interface PostingHeatmap {
  day: string;
  hours: { hour: number; engagement: number }[];
}

type DateRange = '7d' | '14d' | '30d' | '90d';

const AnalyticsPage: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [demographics, setDemographics] = useState<DemographicData | null>(null);
  const [heatmap, setHeatmap] = useState<PostingHeatmap[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'posts' | 'audience'>('overview');

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ range: dateRange });
      const [overviewRes, metricsRes, postsRes, demoRes, heatmapRes] = await Promise.all([
        fetch(`/api/analytics/overview?${params.toString()}`),
        fetch(`/api/analytics/metrics?${params.toString()}`),
        fetch(`/api/analytics/top-posts?${params.toString()}`),
        fetch(`/api/analytics/demographics`),
        fetch(`/api/analytics/heatmap?${params.toString()}`),
      ]);
      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (metricsRes.ok) setDailyMetrics((await metricsRes.json()).metrics || []);
      if (postsRes.ok) setTopPosts((await postsRes.json()).posts || []);
      if (demoRes.ok) setDemographics(await demoRes.json());
      if (heatmapRes.ok) setHeatmap((await heatmapRes.json()).heatmap || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const getChangeColor = (change: number): string => {
    if (change > 0) return 'text-green-500';
    if (change < 0) return 'text-red-500';
    return 'text-gray-500';
  };

  const getMaxValue = (metrics: DailyMetric[], key: keyof DailyMetric): number => {
    return Math.max(...metrics.map((m) => Number(m[key]) || 0), 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        <span className="ml-3 text-gray-500">Loading analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load analytics</div>
        <button onClick={fetchAnalytics} className="px-6 py-2 bg-blue-500 text-white rounded-full">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto min-h-screen p-4 bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          {(['7d', '14d', '30d', '90d'] as DateRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1 rounded-full text-sm ${dateRange === range ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {range}
            </button>
          ))}
        </div>
      </header>

      <div className="flex gap-2 mb-6">
        {(['overview', 'posts', 'audience'] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-4 py-2 rounded-lg text-sm capitalize ${activeSection === section ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {section}
          </button>
        ))}
      </div>

      {activeSection === 'overview' && overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 border">
              <p className="text-sm text-gray-500">Impressions</p>
              <p className="text-2xl font-bold">{formatNumber(overview.impressions)}</p>
              <p className={`text-xs ${getChangeColor(overview.impressionsChange)}`}>
                {overview.impressionsChange > 0 ? '+' : ''}
                {overview.impressionsChange}%
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border">
              <p className="text-sm text-gray-500">Engagement Rate</p>
              <p className="text-2xl font-bold">{overview.engagementRate.toFixed(1)}%</p>
              <p className={`text-xs ${getChangeColor(overview.engagementChange)}`}>
                {overview.engagementChange > 0 ? '+' : ''}
                {overview.engagementChange}%
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border">
              <p className="text-sm text-gray-500">Followers</p>
              <p className="text-2xl font-bold">{formatNumber(overview.followers)}</p>
              <p className={`text-xs ${getChangeColor(overview.followersChange)}`}>
                {overview.followersChange > 0 ? '+' : ''}
                {overview.followersChange}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 border">
              <p className="text-sm text-gray-500">Profile Visits</p>
              <p className="text-2xl font-bold">{formatNumber(overview.profileVisits)}</p>
              <p className={`text-xs ${getChangeColor(overview.profileVisitsChange)}`}>
                {overview.profileVisitsChange > 0 ? '+' : ''}
                {overview.profileVisitsChange}%
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border mb-6">
            <h3 className="font-bold mb-4">Impressions Over Time</h3>
            <div className="h-48 flex items-end gap-1">
              {dailyMetrics.map((metric, idx) => {
                const maxImpressions = getMaxValue(dailyMetrics, 'impressions');
                const height = (metric.impressions / maxImpressions) * 100;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute -top-8 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">
                      {metric.impressions.toLocaleString()} on {metric.date}
                    </div>
                    <div
                      className="w-full bg-blue-400 rounded-t hover:bg-blue-500 transition-colors"
                      style={{ height: `${height}%`, minHeight: '2px' }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>{dailyMetrics[0]?.date || ''}</span>
              <span>{dailyMetrics[dailyMetrics.length - 1]?.date || ''}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border mb-6">
            <h3 className="font-bold mb-4">Follower Growth</h3>
            <div className="h-32 flex items-end gap-1">
              {dailyMetrics.map((metric, idx) => {
                const maxFollowers = getMaxValue(dailyMetrics, 'followers');
                const height = (metric.followers / maxFollowers) * 100;
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-green-400 rounded-t hover:bg-green-500"
                    style={{ height: `${height}%`, minHeight: '2px' }}
                  />
                );
              })}
            </div>
          </div>

          {heatmap.length > 0 && (
            <div className="bg-white rounded-xl p-4 border">
              <h3 className="font-bold mb-4">Best Posting Times</h3>
              <div className="grid grid-cols-25 gap-0.5">
                <div className="col-span-1" />
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="text-center text-xs text-gray-400">
                    {i}
                  </div>
                ))}
                {heatmap.map((day) => (
                  <React.Fragment key={day.day}>
                    <div className="text-xs text-gray-500 pr-1">{day.day.slice(0, 3)}</div>
                    {day.hours.map((h) => {
                      const intensity = Math.min(h.engagement / 100, 1);
                      return (
                        <div
                          key={h.hour}
                          className="w-full aspect-square rounded-sm"
                          style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                          title={`${day.day} ${h.hour}:00 - ${h.engagement} engagements`}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeSection === 'posts' && (
        <div className="space-y-3">
          <h3 className="font-bold text-lg">Top Posts</h3>
          {topPosts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No post data available for this period.
            </div>
          ) : (
            topPosts.map((post) => (
              <div key={post.id} className="bg-white rounded-xl p-4 border">
                <p className="text-sm text-gray-900 mb-3 line-clamp-2">{post.content}</p>
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold">{formatNumber(post.impressions)}</p>
                    <p className="text-xs text-gray-500">Views</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{formatNumber(post.engagements)}</p>
                    <p className="text-xs text-gray-500">Engagements</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{formatNumber(post.likes)}</p>
                    <p className="text-xs text-gray-500">Likes</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{formatNumber(post.reposts)}</p>
                    <p className="text-xs text-gray-500">Reposts</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{formatNumber(post.replies)}</p>
                    <p className="text-xs text-gray-500">Replies</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(post.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {activeSection === 'audience' && demographics && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-4 border">
            <h3 className="font-bold mb-4">Age Distribution</h3>
            {demographics.ageGroups.map((group) => (
              <div key={group.range} className="flex items-center gap-3 mb-2">
                <span className="text-sm w-16">{group.range}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full flex items-center px-2"
                    style={{ width: `${group.percentage}%` }}
                  >
                    <span className="text-xs text-white font-medium">{group.percentage}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl p-4 border">
            <h3 className="font-bold mb-4">Top Locations</h3>
            {demographics.locations.map((loc) => (
              <div
                key={loc.country}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <span className="text-sm">{loc.country}</span>
                <span className="text-sm font-medium">{loc.percentage}%</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl p-4 border">
            <h3 className="font-bold mb-4">Gender</h3>
            <div className="flex gap-4">
              {demographics.genders.map((g) => (
                <div key={g.type} className="flex-1 text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold">{g.percentage}%</p>
                  <p className="text-xs text-gray-500 capitalize">{g.type}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;
