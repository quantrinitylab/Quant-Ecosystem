// ============================================================================
// Moderation - Content Label Service
// Manages content labels and sensitive content warnings
// ============================================================================

import type { ContentLabelRecord, ContentLabelType, ContentWarningConfig } from '../types';

interface ContentLabelServiceConfig {
  warningConfigs: ContentWarningConfig[];
}

const DEFAULT_WARNING_CONFIGS: ContentWarningConfig[] = [
  {
    label: 'mature_content',
    requiresInterstitial: true,
    warningMessage: 'This content may contain mature themes.',
  },
  {
    label: 'graphic_violence',
    requiresInterstitial: true,
    warningMessage: 'This content contains graphic violence.',
  },
  {
    label: 'sensitive_topic',
    requiresInterstitial: false,
    warningMessage: 'This content discusses sensitive topics.',
  },
];

/**
 * ContentLabelService - Content labeling and warning management
 *
 * Manages application of content labels (ai_generated, mature_content, etc.)
 * and determines whether content requires interstitial warnings based on
 * configurable per-label policies.
 */
export class ContentLabelService {
  private config: ContentLabelServiceConfig;
  private labels: Map<string, ContentLabelRecord[]>; // contentId -> labels
  private counter: number = 0;

  constructor(config: Partial<ContentLabelServiceConfig> = {}) {
    this.config = {
      warningConfigs: config.warningConfigs || DEFAULT_WARNING_CONFIGS,
    };
    this.labels = new Map();
  }

  /** Apply a label to content */
  applyLabel(params: {
    contentId: string;
    label: ContentLabelType;
    appliedBy: string;
  }): ContentLabelRecord {
    const { contentId, label, appliedBy } = params;

    // Check for duplicate
    const existing = this.labels.get(contentId) || [];
    const duplicate = existing.find((l) => l.label === label);
    if (duplicate) return duplicate;

    this.counter++;
    const record: ContentLabelRecord = {
      id: `lbl_${Date.now()}_${this.counter}`,
      contentId,
      label,
      appliedBy,
      appliedAt: Date.now(),
    };

    existing.push(record);
    this.labels.set(contentId, existing);

    return record;
  }

  /** Remove a specific label from content */
  removeLabel(contentId: string, label: ContentLabelType): boolean {
    const existing = this.labels.get(contentId);
    if (!existing) return false;

    const index = existing.findIndex((l) => l.label === label);
    if (index === -1) return false;

    existing.splice(index, 1);
    if (existing.length === 0) {
      this.labels.delete(contentId);
    }

    return true;
  }

  /** Get all labels for content */
  getLabels(contentId: string): ContentLabelRecord[] {
    return this.labels.get(contentId) || [];
  }

  /** Determine if content should show a warning */
  shouldWarn(contentId: string): { warn: boolean; warnings: ContentWarningConfig[] } {
    const contentLabels = this.labels.get(contentId) || [];
    const warnings: ContentWarningConfig[] = [];

    for (const labelRecord of contentLabels) {
      const warningConfig = this.config.warningConfigs.find(
        (wc) => wc.label === labelRecord.label && wc.requiresInterstitial,
      );
      if (warningConfig) {
        warnings.push(warningConfig);
      }
    }

    return {
      warn: warnings.length > 0,
      warnings,
    };
  }

  /** Check if content has a specific label */
  hasLabel(contentId: string, label: ContentLabelType): boolean {
    const existing = this.labels.get(contentId) || [];
    return existing.some((l) => l.label === label);
  }
}
