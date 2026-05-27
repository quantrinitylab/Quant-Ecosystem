// ============================================================================
// Daily Brief Generator
// ============================================================================

import type {
  BriefItem,
  BriefSection,
  BriefSectionType,
  DailyBrief,
  DataProvider,
  BriefPriority,
} from './types';
import { PriorityScorer } from './priority-scorer';
import { AnomalyDetector } from './anomaly-detector';

export class DailyBriefGenerator {
  private providers: Map<string, DataProvider> = new Map();
  private priorityScorer: PriorityScorer;
  private anomalyDetector: AnomalyDetector;
  private counter = 0;

  constructor() {
    this.priorityScorer = new PriorityScorer();
    this.anomalyDetector = new AnomalyDetector();
  }

  registerProvider(provider: DataProvider): void {
    this.providers.set(provider.name, provider);
  }

  unregisterProvider(name: string): boolean {
    return this.providers.delete(name);
  }

  async generate(userId: string): Promise<DailyBrief> {
    const allItems: BriefItem[] = [];

    for (const [, provider] of this.providers) {
      const items = await provider.fetchItems(userId);
      allItems.push(...items);
    }

    const sections = this.buildSections(allItems);
    const anomalies = this.anomalyDetector.detect(allItems);

    if (anomalies.length > 0) {
      const anomalyItems: BriefItem[] = anomalies.map((a) => ({
        id: a.id,
        title: a.type.replace(/_/g, ' '),
        description: a.description,
        sourceApp: 'system',
        priority: this.severityToPriority(a.severity),
      }));

      sections.push({
        type: 'anomalies',
        title: 'Anomalies Detected',
        items: anomalyItems,
        urgency: Math.max(...anomalies.map((a) => a.severity)),
      });
    }

    // Sort sections by urgency descending
    sections.sort((a, b) => b.urgency - a.urgency);

    const overallPriority = this.computeOverallPriority(sections);

    return {
      id: `brief_${Date.now()}_${++this.counter}`,
      userId,
      generatedAt: Date.now(),
      sections,
      overallPriority,
    };
  }

  private buildSections(items: BriefItem[]): BriefSection[] {
    const sectionMap = new Map<BriefSectionType, BriefItem[]>();

    for (const item of items) {
      const sectionType = this.classifyItem(item);
      const existing = sectionMap.get(sectionType) ?? [];
      existing.push(item);
      sectionMap.set(sectionType, existing);
    }

    const sections: BriefSection[] = [];
    for (const [type, sectionItems] of sectionMap) {
      const scored = sectionItems.map((item) => ({
        item,
        score: this.priorityScorer.score(item),
      }));
      scored.sort((a, b) => b.score - a.score);

      const urgency = scored.length > 0 ? (scored[0]?.score ?? 0) : 0;

      sections.push({
        type,
        title: this.sectionTitle(type),
        items: scored.map((s) => s.item),
        urgency,
      });
    }

    return sections;
  }

  private classifyItem(item: BriefItem): BriefSectionType {
    if (item.dueAt != null) {
      return 'deadlines';
    }
    if (item.sourceApp === 'quantchat' || item.sourceApp === 'quantmail') {
      return 'messages';
    }
    if (item.sourceApp === 'quantcalendar') {
      return 'meetings';
    }
    return 'tasks';
  }

  private sectionTitle(type: BriefSectionType): string {
    const titles: Record<BriefSectionType, string> = {
      deadlines: 'Upcoming Deadlines',
      messages: 'Important Messages',
      meetings: 'Meetings Today',
      tasks: 'Tasks',
      anomalies: 'Anomalies Detected',
      insights: 'Insights',
    };
    return titles[type];
  }

  private severityToPriority(severity: number): BriefPriority {
    if (severity >= 9) return 'critical';
    if (severity >= 7) return 'high';
    if (severity >= 4) return 'medium';
    return 'low';
  }

  private computeOverallPriority(sections: BriefSection[]): BriefPriority {
    const maxUrgency = sections.reduce((max, s) => Math.max(max, s.urgency), 0);
    if (maxUrgency >= 9) return 'critical';
    if (maxUrgency >= 7) return 'high';
    if (maxUrgency >= 4) return 'medium';
    return 'low';
  }
}
