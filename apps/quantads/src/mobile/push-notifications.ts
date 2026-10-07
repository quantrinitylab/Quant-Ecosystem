// QuantAds - Push Notifications Service
// Mobile push notification management for advertising platform

export interface NotificationChannel {
  id: string;
  name: string;
  importance: 'urgent' | 'high' | 'default' | 'low';
  sound: string | null;
  vibration: boolean;
  badge: boolean;
}

export interface NotificationPayload {
  id: string;
  channel: AdsNotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  deepLink: string;
  timestamp: number;
  groupKey: string;
  actions: NotificationAction[];
  campaignThumbnail?: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  requiresAuth?: boolean;
}

export type AdsNotificationChannel =
  | 'budget_alert'
  | 'campaign_status'
  | 'performance_milestone'
  | 'approval_required'
  | 'billing_issue'
  | 'bid_outperformed'
  | 'audience_insight'
  | 'policy_violation';

export interface ScheduledNotification {
  id: string;
  payload: NotificationPayload;
  triggerAt: number;
  repeatInterval?: 'daily' | 'weekly';
  cancelled: boolean;
}

export interface QuietHoursConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
  allowBudgetAlerts: boolean;
  allowPolicyViolations: boolean;
}

export class PushNotificationService {
  private channels: Map<AdsNotificationChannel, NotificationChannel> = new Map();
  private badgeCount: number = 0;
  private scheduledNotifications: ScheduledNotification[] = [];
  private quietHours: QuietHoursConfig = { enabled: false, startHour: 21, endHour: 8, allowBudgetAlerts: true, allowPolicyViolations: true };
  private groupedNotifications: Map<string, NotificationPayload[]> = new Map();
  private budgetThresholds: Map<string, number> = new Map();

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    const defaults: Array<[AdsNotificationChannel, NotificationChannel]> = [
      ['budget_alert', { id: 'budget_alert', name: 'Budget Alerts', importance: 'urgent', sound: 'budget_warning.wav', vibration: true, badge: true }],
      ['campaign_status', { id: 'campaign_status', name: 'Campaign Status', importance: 'high', sound: 'campaign_update.wav', vibration: true, badge: true }],
      ['performance_milestone', { id: 'performance_milestone', name: 'Performance', importance: 'default', sound: 'milestone.wav', vibration: false, badge: true }],
      ['approval_required', { id: 'approval_required', name: 'Approvals', importance: 'high', sound: 'approval_needed.wav', vibration: true, badge: true }],
      ['billing_issue', { id: 'billing_issue', name: 'Billing Issues', importance: 'urgent', sound: 'billing_alert.wav', vibration: true, badge: true }],
      ['bid_outperformed', { id: 'bid_outperformed', name: 'Bid Updates', importance: 'default', sound: null, vibration: false, badge: false }],
      ['audience_insight', { id: 'audience_insight', name: 'Audience Insights', importance: 'low', sound: null, vibration: false, badge: false }],
      ['policy_violation', { id: 'policy_violation', name: 'Policy Violations', importance: 'urgent', sound: 'violation_alert.wav', vibration: true, badge: true }],
    ];
    defaults.forEach(([key, channel]) => this.channels.set(key, channel));
  }

  public async routeDeepLink(payload: NotificationPayload): Promise<string> {
    const { channel, data } = payload;
    switch (channel) {
      case 'budget_alert': return `/ads/campaigns/${data.campaignId}/budget`;
      case 'campaign_status': return `/ads/campaigns/${data.campaignId}/overview`;
      case 'performance_milestone': return `/ads/campaigns/${data.campaignId}/analytics`;
      case 'approval_required': return `/ads/creatives/${data.creativeId}/review`;
      case 'billing_issue': return `/ads/billing/issues/${data.issueId}`;
      case 'bid_outperformed': return `/ads/campaigns/${data.campaignId}/bidding`;
      case 'audience_insight': return `/ads/audiences/${data.audienceId}/insights`;
      case 'policy_violation': return `/ads/campaigns/${data.campaignId}/policy/${data.violationId}`;
      default: return `/ads/dashboard`;
    }
  }

  public setBudgetThreshold(campaignId: string, threshold: number): void {
    this.budgetThresholds.set(campaignId, threshold);
  }

  public checkBudgetAlert(campaignId: string, currentSpend: number, totalBudget: number): NotificationPayload | null {
    const threshold = this.budgetThresholds.get(campaignId) || 0.8;
    const ratio = currentSpend / totalBudget;
    if (ratio >= threshold) {
      return {
        id: `budget_${campaignId}_${Date.now()}`,
        channel: 'budget_alert',
        title: 'Budget Alert',
        body: `Campaign spending at ${Math.round(ratio * 100)}% of budget ($${currentSpend.toFixed(2)}/$${totalBudget.toFixed(2)})`,
        data: { campaignId, currentSpend, totalBudget, ratio },
        deepLink: `/ads/campaigns/${campaignId}/budget`,
        timestamp: Date.now(),
        groupKey: `budget_${campaignId}`,
        actions: [{ id: 'pause', label: 'Pause Campaign', destructive: true }, { id: 'increase', label: 'Increase Budget' }],
      };
    }
    return null;
  }

  public updateBadgeCount(pendingApprovals: number, budgetAlerts: number, policyIssues: number): number {
    this.badgeCount = pendingApprovals + budgetAlerts + policyIssues;
    return this.badgeCount;
  }

  public getBadgeCount(): number {
    return this.badgeCount;
  }

  public groupNotification(notification: NotificationPayload): NotificationPayload[] {
    const { groupKey } = notification;
    if (!this.groupedNotifications.has(groupKey)) {
      this.groupedNotifications.set(groupKey, []);
    }
    this.groupedNotifications.get(groupKey)!.push(notification);
    return this.groupedNotifications.get(groupKey)!;
  }

  public schedulePerformanceReport(campaignId: string, triggerAt: number): ScheduledNotification {
    const payload: NotificationPayload = {
      id: `perf_report_${campaignId}`,
      channel: 'performance_milestone',
      title: 'Daily Performance Report',
      body: 'Your campaign performance summary is ready',
      data: { campaignId },
      deepLink: `/ads/campaigns/${campaignId}/analytics`,
      timestamp: Date.now(),
      groupKey: `perf_${campaignId}`,
      actions: [{ id: 'view', label: 'View Report' }],
    };
    const scheduled: ScheduledNotification = { id: `sched_${Date.now()}`, payload, triggerAt, repeatInterval: 'daily', cancelled: false };
    this.scheduledNotifications.push(scheduled);
    return scheduled;
  }

  public buildRichNotification(payload: NotificationPayload): NotificationPayload {
    const actions: NotificationAction[] = [];
    switch (payload.channel) {
      case 'approval_required':
        actions.push({ id: 'approve', label: 'Approve', requiresAuth: true }, { id: 'reject', label: 'Reject', destructive: true, requiresAuth: true }, { id: 'preview', label: 'Preview' });
        break;
      case 'budget_alert':
        actions.push({ id: 'pause', label: 'Pause', destructive: true, requiresAuth: true }, { id: 'increase_10', label: '+10% Budget', requiresAuth: true });
        break;
      case 'policy_violation':
        actions.push({ id: 'review', label: 'Review', requiresAuth: true }, { id: 'pause_creative', label: 'Pause Creative', destructive: true });
        break;
    }
    return { ...payload, actions };
  }

  public isInQuietHours(): boolean {
    if (!this.quietHours.enabled) return false;
    const hour = new Date().getHours();
    if (this.quietHours.startHour > this.quietHours.endHour) {
      return hour >= this.quietHours.startHour || hour < this.quietHours.endHour;
    }
    return hour >= this.quietHours.startHour && hour < this.quietHours.endHour;
  }

  public shouldDeliverNotification(payload: NotificationPayload): boolean {
    if (!this.isInQuietHours()) return true;
    if (payload.channel === 'budget_alert' && this.quietHours.allowBudgetAlerts) return true;
    if (payload.channel === 'policy_violation' && this.quietHours.allowPolicyViolations) return true;
    return false;
  }

  public setQuietHours(config: QuietHoursConfig): void {
    this.quietHours = config;
  }
}
