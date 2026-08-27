'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { IconChart } from './icons';

interface EmailAnalyticsProps {
  emails: Array<{
    receivedAt?: string | Date;
    isRead: boolean;
    category?: string;
    from?: { email?: string };
  }>;
}

/**
 * Personal Email Analytics Dashboard — shows your email behavior patterns.
 * Gmail has no equivalent. Shows:
 * - Emails per day (last 7 days bar chart)
 * - Response rate
 * - Peak activity hours
 * - Category distribution
 */
export function EmailAnalytics({ emails }: EmailAnalyticsProps) {
  const stats = useMemo(() => {
    if (!emails || emails.length === 0) return null;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Emails per day (last 7 days)
    const dailyCounts: number[] = Array(7).fill(0);
    const dayLabels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dayLabels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
    }

    // Peak hours
    const hourCounts: number[] = Array(24).fill(0);

    // Category distribution
    const categories: Record<string, number> = {};

    for (const email of emails) {
      if (!email.receivedAt) continue;
      const date = new Date(email.receivedAt);

      if (date >= sevenDaysAgo) {
        const dayIdx = 6 - Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
        if (dayIdx >= 0 && dayIdx < 7) dailyCounts[dayIdx]++;
      }

      hourCounts[date.getHours()]++;

      const cat = email.category || 'primary';
      categories[cat] = (categories[cat] || 0) + 1;
    }

    const maxDaily = Math.max(...dailyCounts, 1);
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const readRate = Math.round((emails.filter((e) => e.isRead).length / emails.length) * 100);

    // Top sender
    const senderCounts: Record<string, number> = {};
    for (const email of emails) {
      const sender = email.from?.email || 'unknown';
      senderCounts[sender] = (senderCounts[sender] || 0) + 1;
    }
    const topSender = Object.entries(senderCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      totalEmails: emails.length,
      dailyCounts,
      dayLabels,
      maxDaily,
      peakHour,
      readRate,
      categories,
      topSender: topSender ? { email: topSender[0], count: topSender[1] } : null,
      avgPerDay: Math.round(dailyCounts.reduce((a, b) => a + b, 0) / 7),
    };
  }, [emails]);

  if (!stats) return null;

  return (
    <motion.div
      className="email-analytics"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <header className="analytics-header">
        <span className="analytics-icon inline-flex" aria-hidden="true">
          <IconChart size={13} />
        </span>
        <strong>Your Email Pulse</strong>
        <span className="analytics-period">Last 7 days</span>
      </header>

      {/* Mini bar chart */}
      <div className="analytics-chart">
        {stats.dailyCounts.map((count, idx) => (
          <div key={idx} className="analytics-bar-col">
            <div
              className="analytics-bar"
              style={{ height: `${(count / stats.maxDaily) * 100}%` }}
              title={`${stats.dayLabels[idx]}: ${count} emails`}
            />
            <span className="analytics-bar-label">{stats.dayLabels[idx]}</span>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="analytics-stats">
        <div className="analytics-stat">
          <span className="analytics-stat-value">{stats.avgPerDay}</span>
          <span className="analytics-stat-label">avg/day</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{stats.readRate}%</span>
          <span className="analytics-stat-label">read rate</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{stats.peakHour}:00</span>
          <span className="analytics-stat-label">peak hour</span>
        </div>
        <div className="analytics-stat">
          <span className="analytics-stat-value">{stats.totalEmails}</span>
          <span className="analytics-stat-label">total</span>
        </div>
      </div>

      {stats.topSender && (
        <p className="analytics-insight">
          Top sender: <strong>{stats.topSender.email}</strong> ({stats.topSender.count} emails)
        </p>
      )}
    </motion.div>
  );
}
