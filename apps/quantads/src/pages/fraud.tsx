// ============================================================================
// QuantAds - Fraud Detection Dashboard
// Invalid traffic %, bot detection chart, click farm IPs, viewability, alerts
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface FraudMetrics {
  invalidTrafficRate: number;
  invalidTrafficChange: number;
  botDetections: number;
  botDetectionsChange: number;
  clickFarmIPs: number;
  blockedImpressions: number;
  viewabilityScore: number;
  viewabilityChange: number;
  savedBudget: number;
}

interface BotDetectionEntry {
  date: string;
  totalRequests: number;
  botRequests: number;
  sophisticatedBots: number;
  simpleBots: number;
  dataCenter: number;
}

interface ClickFarmIP {
  ip: string;
  country: string;
  clickCount: number;
  uniqueCampaigns: number;
  firstSeen: string;
  lastSeen: string;
  riskScore: number;
  status: 'blocked' | 'flagged' | 'investigating';
}

interface FraudAlert {
  id: string;
  type: 'spike' | 'click_farm' | 'bot_wave' | 'viewability_drop' | 'geo_anomaly';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  campaignId?: string;
  campaignName?: string;
  timestamp: string;
  resolved: boolean;
}

interface ViewabilityData {
  placement: string;
  viewableImpressions: number;
  totalImpressions: number;
  viewabilityRate: number;
  avgViewDuration: number;
}

interface FraudPageProps {
  accountId?: string;
}

const FraudPage: React.FC<FraudPageProps> = ({ accountId: _accountId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FraudMetrics | null>(null);
  const [botData, setBotData] = useState<BotDetectionEntry[]>([]);
  const [clickFarms, setClickFarms] = useState<ClickFarmIP[]>([]);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [viewability, setViewability] = useState<ViewabilityData[]>([]);
  const [dateRange, setDateRange] = useState<'7d' | '14d' | '30d'>('7d');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'bots' | 'ips' | 'viewability' | 'alerts'
  >('overview');
  const [sortBy, setSortBy] = useState<'riskScore' | 'clickCount' | 'lastSeen'>('riskScore');

  const fetchFraudData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/fraud/dashboard?range=${dateRange}`);
      if (!response.ok) throw new Error('Failed to load fraud data');
      const data = await response.json();
      setMetrics(data.metrics);
      setBotData(data.botDetections || []);
      setClickFarms(data.clickFarms || []);
      setAlerts(data.alerts || []);
      setViewability(data.viewability || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load fraud data');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchFraudData();
  }, [fetchFraudData]);

  const blockIP = useCallback(async (ip: string) => {
    try {
      await fetch('/api/fraud/block-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      setClickFarms((prev) =>
        prev.map((cf) => (cf.ip === ip ? { ...cf, status: 'blocked' as const } : cf)),
      );
    } catch {}
  }, []);

  const resolveAlert = useCallback(async (id: string) => {
    try {
      await fetch(`/api/fraud/alerts/${id}/resolve`, { method: 'PUT' });
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, resolved: true } : a)));
    } catch {}
  }, []);

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'low':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getRiskColor = (score: number): string => {
    if (score >= 90) return 'text-red-600';
    if (score >= 70) return 'text-orange-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-green-600';
  };

  const sortedClickFarms = [...clickFarms].sort((a, b) => {
    if (sortBy === 'riskScore') return b.riskScore - a.riskScore;
    if (sortBy === 'clickCount') return b.clickCount - a.clickCount;
    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
  });

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
        <span className="ml-3 text-gray-500">Loading fraud data...</span>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load fraud data</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={fetchFraudData} className="px-6 py-2 bg-red-500 text-white rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-6xl mb-4">🛡️</div>
        <h3 className="text-xl font-semibold text-gray-700">No fraud data available</h3>
        <p className="text-gray-500">Start running campaigns to see fraud detection metrics.</p>
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
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--quant-foreground)]">Fraud Detection</h1>
          <p className="text-gray-500 text-sm mt-1">
            Protecting your ad spend from invalid traffic
          </p>
        </div>
        <div className="flex gap-2">
          {(['7d', '14d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1 rounded-lg text-sm ${dateRange === range ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {range}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">Invalid Traffic</p>
          <p className="text-2xl font-bold text-red-600">
            {metrics.invalidTrafficRate.toFixed(1)}%
          </p>
          <p
            className={`text-xs ${metrics.invalidTrafficChange < 0 ? 'text-green-600' : 'text-red-600'}`}
          >
            {metrics.invalidTrafficChange > 0 ? '+' : ''}
            {metrics.invalidTrafficChange.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">Bot Detections</p>
          <p className="text-2xl font-bold text-orange-600">
            {metrics.botDetections.toLocaleString()}
          </p>
          <p
            className={`text-xs ${metrics.botDetectionsChange < 0 ? 'text-green-600' : 'text-red-600'}`}
          >
            {metrics.botDetectionsChange > 0 ? '+' : ''}
            {metrics.botDetectionsChange}%
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">Click Farm IPs</p>
          <p className="text-2xl font-bold text-yellow-600">{metrics.clickFarmIPs}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">Viewability</p>
          <p className="text-2xl font-bold text-green-600">{metrics.viewabilityScore}%</p>
          <p
            className={`text-xs ${metrics.viewabilityChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
          >
            {metrics.viewabilityChange > 0 ? '+' : ''}
            {metrics.viewabilityChange}%
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">Budget Saved</p>
          <p className="text-2xl font-bold text-blue-600">
            ${metrics.savedBudget.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b">
        {(['overview', 'bots', 'ips', 'viewability', 'alerts'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500'}`}
          >
            {tab === 'ips' ? 'Click Farms' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Bot Detection Trend</h2>
          <div className="h-48 flex items-end gap-1 border-b border-l">
            {botData.map((point, idx) => {
              const max = Math.max(...botData.map((p) => p.totalRequests), 1);
              const botHeight = (point.botRequests / max) * 100;
              const legitimateHeight = ((point.totalRequests - point.botRequests) / max) * 100;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col justify-end h-full"
                  title={`${point.date}: ${point.botRequests} bots / ${point.totalRequests} total`}
                >
                  <div
                    className="w-full bg-red-400 rounded-t"
                    style={{ height: `${botHeight}%`, minHeight: '1px' }}
                  />
                  <div
                    className="w-full bg-green-400"
                    style={{ height: `${legitimateHeight}%`, minHeight: '1px' }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3">
            <span className="flex items-center gap-1 text-xs">
              <span className="w-3 h-3 bg-red-400 rounded" />
              Bot Traffic
            </span>
            <span className="flex items-center gap-1 text-xs">
              <span className="w-3 h-3 bg-green-400 rounded" />
              Legitimate
            </span>
          </div>
        </div>
      )}

      {activeTab === 'bots' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Bots</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  Sophisticated
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Simple</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  Data Center
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Bot %</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {botData.map((entry, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{entry.date}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {entry.totalRequests.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">
                    {entry.botRequests.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {entry.sophisticatedBots.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {entry.simpleBots.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {entry.dataCenter.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {entry.totalRequests > 0
                      ? ((entry.botRequests / entry.totalRequests) * 100).toFixed(1)
                      : 0}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'ips' && (
        <div>
          <div className="flex gap-2 mb-4">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="riskScore">Risk Score</option>
              <option value="clickCount">Click Count</option>
              <option value="lastSeen">Last Seen</option>
            </select>
          </div>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                    IP Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Country</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Clicks</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                    Campaigns
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Risk</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedClickFarms.map((cf) => (
                  <tr key={cf.ip} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{cf.ip}</td>
                    <td className="px-4 py-3 text-sm">{cf.country}</td>
                    <td className="px-4 py-3 text-sm text-right">{cf.clickCount}</td>
                    <td className="px-4 py-3 text-sm text-right">{cf.uniqueCampaigns}</td>
                    <td
                      className={`px-4 py-3 text-sm text-right font-bold ${getRiskColor(cf.riskScore)}`}
                    >
                      {cf.riskScore}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${cf.status === 'blocked' ? 'bg-red-100 text-red-700' : cf.status === 'flagged' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}
                      >
                        {cf.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {cf.status !== 'blocked' && (
                        <button
                          onClick={() => blockIP(cf.ip)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Block
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'viewability' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Placement</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Viewable</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Rate</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  Avg Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Bar</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {viewability.map((v, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{v.placement}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    {v.viewableImpressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {v.totalImpressions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{v.viewabilityRate}%</td>
                  <td className="px-4 py-3 text-sm text-right">{v.avgViewDuration}s</td>
                  <td className="px-4 py-3 w-32">
                    <div className="h-2 bg-gray-200 rounded-full">
                      <div
                        className="h-2 bg-green-500 rounded-full"
                        style={{ width: `${v.viewabilityRate}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 && <p className="text-center text-gray-500 py-8">No fraud alerts</p>}
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 ${alert.resolved ? 'opacity-50' : ''} ${getSeverityColor(alert.severity)}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase">{alert.severity}</span>
                  <p className="font-medium mt-1">{alert.message}</p>
                  {alert.campaignName && (
                    <p className="text-xs mt-1">Campaign: {alert.campaignName}</p>
                  )}
                  <p className="text-xs mt-1 opacity-75">
                    {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
                {!alert.resolved && (
                  <button
                    onClick={() => resolveAlert(alert.id)}
                    className="px-3 py-1 bg-white rounded text-xs font-medium"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default FraudPage;
