// ============================================================================
// QuantAds - AuctionViewer Component
// Real-time auction bid waterfall with dark mode and animations
// ============================================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface Bidder {
  id: string;
  name: string;
  bidAmount: number;
  maxBid: number;
  qualityScore: number;
  relevanceScore: number;
  effectiveBid: number;
  status: 'won' | 'lost' | 'pending' | 'filtered';
  responseTime: number;
  reason?: string;
}

interface AuctionRound {
  id: string;
  timestamp: string;
  placementId: string;
  placementName: string;
  floorPrice: number;
  winningBid: number;
  bidders: Bidder[];
  latency: number;
  auctionType: 'first_price' | 'second_price' | 'header_bidding';
  impressionId: string;
}

interface AuctionStats {
  totalAuctions: number;
  avgWinningBid: number;
  avgBidders: number;
  avgLatency: number;
  fillRate: number;
  winRate: number;
}

interface AuctionViewerProps {
  campaignId?: string;
  adGroupId?: string;
  realtime?: boolean;
  maxRounds?: number;
}

const AuctionViewer: React.FC<AuctionViewerProps> = ({
  campaignId,
  adGroupId,
  realtime = true,
  maxRounds = 20,
}) => {
  const [rounds, setRounds] = useState<AuctionRound[]>([]);
  const [stats, setStats] = useState<AuctionStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<AuctionRound | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(maxRounds) });
      if (campaignId) params.set('campaignId', campaignId);
      if (adGroupId) params.set('adGroupId', adGroupId);
      const response = await fetch(`/api/bidding/auctions?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load auction data');
      const data = await response.json();
      setRounds(data.auctions || []);
      setStats(data.stats || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load auctions';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [campaignId, adGroupId, maxRounds]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!realtime || paused) return;
    const protocol =
      typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
    const ws = new WebSocket(`${protocol}//${host}/ws/auctions`);
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onmessage = (event) => {
      try {
        const round: AuctionRound = JSON.parse(event.data);
        setRounds((prev) => [round, ...prev].slice(0, maxRounds));
      } catch {
        /* ignore parse errors */
      }
    };
    return () => {
      ws.close();
    };
  }, [realtime, paused, maxRounds]);

  const getBarWidth = (bid: number, maxBid: number): number => {
    return maxBid > 0 ? (bid / maxBid) * 100 : 0;
  };

  const formatCurrency = (n: number): string => `$${n.toFixed(3)}`;

  if (loading && rounds.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-app-color)]" />
        <span className="ml-3 text-[var(--quant-muted-foreground)]">Loading auctions...</span>
      </div>
    );
  }

  if (error && rounds.length === 0) {
    return (
      <div className="text-center p-8">
        <p className="text-[var(--quant-destructive)] mb-2">Failed to load auction data</p>
        <button
          onClick={fetchHistory}
          className="text-sm text-[var(--brand-app-color)] hover:underline min-h-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="text-center p-8 text-[var(--quant-muted-foreground)]">
        <div className="text-4xl mb-2">&#9889;</div>
        <p>No auction data available yet</p>
      </div>
    );
  }

  const maxBidInView = Math.max(
    ...rounds.flatMap((r) => r.bidders.map((b) => b.effectiveBid)),
    0.01,
  );

  return (
    <motion.div
      className="bg-[var(--quant-card)] rounded-xl shadow-sm border border-[var(--quant-border)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      <div className="p-4 border-b border-[var(--quant-border)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-[var(--quant-card-foreground)]">Auction Viewer</h3>
          {wsConnected && (
            <span className="flex items-center gap-1 text-xs text-[var(--quant-success)]">
              <span className="w-2 h-2 bg-[var(--quant-success)] rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs px-2 py-1 border border-[var(--quant-border)] rounded bg-[var(--quant-card)] text-[var(--quant-card-foreground)] min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
          >
            <option value="all">All</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
          <button
            onClick={() => setPaused(!paused)}
            className={`px-3 py-1 rounded text-xs min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${paused ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}
          >
            {paused ? '\u25B6 Resume' : '\u23F8 Pause'}
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 p-4 bg-[var(--quant-muted)] border-b border-[var(--quant-border)]">
          <div className="text-center">
            <p className="text-xs text-[var(--quant-muted-foreground)]">Auctions</p>
            <p className="font-bold text-sm text-[var(--quant-card-foreground)]">
              {stats.totalAuctions}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--quant-muted-foreground)]">Avg Bid</p>
            <p className="font-bold text-sm text-[var(--quant-card-foreground)]">
              {formatCurrency(stats.avgWinningBid)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--quant-muted-foreground)]">Avg Bidders</p>
            <p className="font-bold text-sm text-[var(--quant-card-foreground)]">
              {stats.avgBidders.toFixed(1)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--quant-muted-foreground)]">Avg Latency</p>
            <p className="font-bold text-sm text-[var(--quant-card-foreground)]">
              {stats.avgLatency}ms
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--quant-muted-foreground)]">Fill Rate</p>
            <p className="font-bold text-sm text-[var(--quant-card-foreground)]">
              {stats.fillRate}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--quant-muted-foreground)]">Win Rate</p>
            <p className="font-bold text-sm text-[var(--quant-card-foreground)]">
              {stats.winRate}%
            </p>
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--quant-border)] max-h-96 overflow-y-auto">
        {rounds.map((round) => (
          <div
            key={round.id}
            className="p-3 hover:bg-[var(--quant-muted)] cursor-pointer"
            onClick={() => setSelectedRound(selectedRound?.id === round.id ? null : round)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--quant-muted-foreground)]">
                  {new Date(round.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-xs bg-[var(--brand-app-color)]/10 text-[var(--brand-app-color)] px-2 py-0.5 rounded">
                  {round.placementName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--quant-muted-foreground)]">
                  {round.latency}ms
                </span>
                <span className="text-sm font-bold text-[var(--quant-success)]">
                  {formatCurrency(round.winningBid)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              {round.bidders
                .filter((b) => filterStatus === 'all' || b.status === filterStatus)
                .sort((a, b) => b.effectiveBid - a.effectiveBid)
                .map((bidder) => (
                  <div key={bidder.id} className="flex items-center gap-2">
                    <span className="text-xs w-20 truncate text-[var(--quant-card-foreground)]">
                      {bidder.name}
                    </span>
                    <div className="flex-1 h-5 bg-[var(--quant-muted)] rounded overflow-hidden relative">
                      <motion.div
                        className={`h-full rounded ${bidder.status === 'won' ? 'bg-[var(--quant-success)]' : bidder.status === 'filtered' ? 'bg-gray-300 dark:bg-gray-600' : 'bg-[var(--brand-app-color)]/60'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${getBarWidth(bidder.effectiveBid, maxBidInView)}%` }}
                        transition={{ type: 'spring', ...spring.snappy }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-[var(--quant-card-foreground)]">
                        {formatCurrency(bidder.effectiveBid)}
                      </span>
                    </div>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        bidder.status === 'won'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : bidder.status === 'lost'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {bidder.status}
                    </span>
                  </div>
                ))}
            </div>

            {selectedRound?.id === round.id && (
              <div className="mt-3 p-3 bg-[var(--quant-muted)] rounded-lg">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[var(--quant-muted-foreground)]">Floor Price:</span>{' '}
                    <span className="font-medium">{formatCurrency(round.floorPrice)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--quant-muted-foreground)]">Impression ID:</span>{' '}
                    <span className="font-mono">{round.impressionId.slice(0, 12)}...</span>
                  </div>
                  <div>
                    <span className="text-[var(--quant-muted-foreground)]">Bidders:</span>{' '}
                    <span className="font-medium">{round.bidders.length}</span>
                  </div>
                  <div>
                    <span className="text-[var(--quant-muted-foreground)]">Type:</span>{' '}
                    <span className="font-medium capitalize">
                      {round.auctionType.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default AuctionViewer;
