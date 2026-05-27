// ============================================================================
// Anomaly Detector - Detects unusual patterns
// ============================================================================

import type { Anomaly, BriefItem } from './types';

export class AnomalyDetector {
  private messageThreshold = 50;
  private counter = 0;

  setMessageThreshold(threshold: number): void {
    this.messageThreshold = threshold;
  }

  detect(items: BriefItem[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    const missedDeadlines = this.detectMissedDeadlines(items);
    anomalies.push(...missedDeadlines);

    const messageSpike = this.detectMessageSpike(items);
    anomalies.push(...messageSpike);

    const overdueTasks = this.detectOverdueTasks(items);
    anomalies.push(...overdueTasks);

    return anomalies;
  }

  private detectMissedDeadlines(items: BriefItem[]): Anomaly[] {
    const now = Date.now();
    const missed = items.filter((item) => item.dueAt != null && item.dueAt < now);

    return missed.map((item) => ({
      id: `anomaly_${Date.now()}_${++this.counter}`,
      type: 'missed_deadline' as const,
      description: `Missed deadline: ${item.title}`,
      severity: 8,
      detectedAt: now,
      context: { itemId: item.id, title: item.title },
    }));
  }

  private detectMessageSpike(items: BriefItem[]): Anomaly[] {
    const messageItems = items.filter(
      (item) => item.sourceApp === 'quantchat' || item.sourceApp === 'quantmail',
    );

    if (messageItems.length > this.messageThreshold) {
      return [
        {
          id: `anomaly_${Date.now()}_${++this.counter}`,
          type: 'message_spike' as const,
          description: `Unusual message volume: ${messageItems.length} messages detected`,
          severity: 6,
          detectedAt: Date.now(),
          context: { count: String(messageItems.length), threshold: String(this.messageThreshold) },
        },
      ];
    }

    return [];
  }

  private detectOverdueTasks(items: BriefItem[]): Anomaly[] {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const overdue = items.filter(
      (item) => item.dueAt != null && item.dueAt < now - oneDayMs && item.priority !== 'low',
    );

    return overdue.map((item) => ({
      id: `anomaly_${Date.now()}_${++this.counter}`,
      type: 'overdue_task' as const,
      description: `Overdue high-priority task: ${item.title}`,
      severity: 7,
      detectedAt: now,
      context: { itemId: item.id, title: item.title },
    }));
  }
}
