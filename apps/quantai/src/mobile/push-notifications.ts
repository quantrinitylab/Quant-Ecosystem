// QuantAI - Push Notifications Service
// Mobile push notification management for AI/ML platform

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
  channel: AINotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  deepLink: string;
  timestamp: number;
  groupKey: string;
  actions: NotificationAction[];
  progressPercent?: number;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  requiresAuth?: boolean;
}

export type AINotificationChannel =
  | 'training_complete'
  | 'training_failed'
  | 'model_deployed'
  | 'inference_ready'
  | 'dataset_processed'
  | 'experiment_result'
  | 'gpu_quota_warning'
  | 'collaboration_invite';

export interface ScheduledNotification {
  id: string;
  payload: NotificationPayload;
  triggerAt: number;
  repeatInterval?: 'hourly' | 'daily';
  cancelled: boolean;
}

export interface QuietHoursConfig {
  enabled: boolean;
  startHour: number;
  endHour: number;
  allowTrainingFailures: boolean;
  allowGPUAlerts: boolean;
}

export class PushNotificationService {
  private channels: Map<AINotificationChannel, NotificationChannel> = new Map();
  private badgeCount: number = 0;
  private scheduledNotifications: ScheduledNotification[] = [];
  private quietHours: QuietHoursConfig = { enabled: false, startHour: 22, endHour: 7, allowTrainingFailures: true, allowGPUAlerts: true };
  private groupedNotifications: Map<string, NotificationPayload[]> = new Map();
  private trainingJobs: Map<string, number> = new Map();

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    const defaults: Array<[AINotificationChannel, NotificationChannel]> = [
      ['training_complete', { id: 'training_complete', name: 'Training Complete', importance: 'high', sound: 'training_done.wav', vibration: true, badge: true }],
      ['training_failed', { id: 'training_failed', name: 'Training Failed', importance: 'urgent', sound: 'error_alert.wav', vibration: true, badge: true }],
      ['model_deployed', { id: 'model_deployed', name: 'Model Deployed', importance: 'high', sound: 'deploy_success.wav', vibration: true, badge: true }],
      ['inference_ready', { id: 'inference_ready', name: 'Inference Ready', importance: 'default', sound: 'ready.wav', vibration: false, badge: true }],
      ['dataset_processed', { id: 'dataset_processed', name: 'Dataset Ready', importance: 'default', sound: 'data_ready.wav', vibration: false, badge: true }],
      ['experiment_result', { id: 'experiment_result', name: 'Experiment Results', importance: 'high', sound: 'experiment.wav', vibration: true, badge: true }],
      ['gpu_quota_warning', { id: 'gpu_quota_warning', name: 'GPU Quota', importance: 'urgent', sound: 'quota_warning.wav', vibration: true, badge: true }],
      ['collaboration_invite', { id: 'collaboration_invite', name: 'Collaboration', importance: 'default', sound: 'invite.wav', vibration: true, badge: true }],
    ];
    defaults.forEach(([key, channel]) => this.channels.set(key, channel));
  }

  public async routeDeepLink(payload: NotificationPayload): Promise<string> {
    const { channel, data } = payload;
    switch (channel) {
      case 'training_complete': return `/ai/models/${data.modelId}/training/${data.runId}/results`;
      case 'training_failed': return `/ai/models/${data.modelId}/training/${data.runId}/logs`;
      case 'model_deployed': return `/ai/deployments/${data.deploymentId}`;
      case 'inference_ready': return `/ai/inference/${data.endpointId}/test`;
      case 'dataset_processed': return `/ai/datasets/${data.datasetId}`;
      case 'experiment_result': return `/ai/experiments/${data.experimentId}/results`;
      case 'gpu_quota_warning': return `/ai/resources/gpu-usage`;
      case 'collaboration_invite': return `/ai/projects/${data.projectId}/collaborate`;
      default: return `/ai/dashboard`;
    }
  }

  public trackTrainingProgress(jobId: string, progress: number): NotificationPayload | null {
    this.trainingJobs.set(jobId, progress);
    if (progress >= 100) {
      return {
        id: `training_done_${jobId}`,
        channel: 'training_complete',
        title: 'Training Complete',
        body: `Model training job ${jobId} has finished successfully`,
        data: { modelId: jobId.split('_')[0], runId: jobId },
        deepLink: `/ai/models/${jobId}/results`,
        timestamp: Date.now(),
        groupKey: `training_${jobId}`,
        actions: [{ id: 'view_results', label: 'View Results' }, { id: 'deploy', label: 'Deploy Model' }],
        progressPercent: 100,
      };
    }
    return null;
  }

  public updateBadgeCount(completedJobs: number, failedJobs: number, pendingInvites: number): number {
    this.badgeCount = completedJobs + failedJobs + pendingInvites;
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

  public scheduleGPUReport(triggerAt: number): ScheduledNotification {
    const payload: NotificationPayload = {
      id: `gpu_report_${Date.now()}`,
      channel: 'gpu_quota_warning',
      title: 'GPU Usage Report',
      body: 'Your daily GPU usage summary is ready',
      data: {},
      deepLink: `/ai/resources/gpu-usage`,
      timestamp: Date.now(),
      groupKey: 'gpu_reports',
      actions: [{ id: 'view', label: 'View Report' }],
    };
    const scheduled: ScheduledNotification = { id: `sched_${Date.now()}`, payload, triggerAt, repeatInterval: 'daily', cancelled: false };
    this.scheduledNotifications.push(scheduled);
    return scheduled;
  }

  public buildRichNotification(payload: NotificationPayload): NotificationPayload {
    const actions: NotificationAction[] = [];
    switch (payload.channel) {
      case 'training_complete':
        actions.push({ id: 'view_metrics', label: 'View Metrics' }, { id: 'deploy', label: 'Deploy', requiresAuth: true }, { id: 'compare', label: 'Compare' });
        break;
      case 'training_failed':
        actions.push({ id: 'view_logs', label: 'View Logs' }, { id: 'retry', label: 'Retry', requiresAuth: true });
        break;
      case 'collaboration_invite':
        actions.push({ id: 'accept', label: 'Accept' }, { id: 'decline', label: 'Decline', destructive: true });
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
    if (payload.channel === 'training_failed' && this.quietHours.allowTrainingFailures) return true;
    if (payload.channel === 'gpu_quota_warning' && this.quietHours.allowGPUAlerts) return true;
    return false;
  }

  public setQuietHours(config: QuietHoursConfig): void {
    this.quietHours = config;
  }
}
