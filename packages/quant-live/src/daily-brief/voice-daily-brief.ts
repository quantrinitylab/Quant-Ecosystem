export interface BriefDataItem {
  id: string;
  title: string;
  description: string;
  priority: number;
  dueAt?: number;
}

export interface DataSource {
  appId: string;
  fetchItems(userId: string): Promise<BriefDataItem[]>;
}

export interface VoiceBriefSection {
  type: string;
  title: string;
  spoken: string;
  itemCount: number;
  urgency: number;
}

export interface VoiceBrief {
  userId: string;
  generatedAt: number;
  greeting: string;
  sections: VoiceBriefSection[];
  closingRemarks: string;
  estimatedDurationSec: number;
  suggestedAutomations: string[];
}

export class VoiceDailyBrief {
  async generate(userId: string, sources: DataSource[]): Promise<VoiceBrief> {
    const allItems: { appId: string; items: BriefDataItem[] }[] = [];

    for (const source of sources) {
      const items = await source.fetchItems(userId);
      allItems.push({ appId: source.appId, items });
    }

    const sections: VoiceBriefSection[] = allItems
      .filter((group) => group.items.length > 0)
      .map((group) => {
        const avgUrgency =
          group.items.reduce((sum, item) => sum + item.priority, 0) / group.items.length;
        const topItems = group.items.sort((a, b) => b.priority - a.priority).slice(0, 3);
        const spoken = topItems.map((item) => item.title).join('. ');

        return {
          type: group.appId,
          title: `${group.appId} updates`,
          spoken: `From ${group.appId}: ${spoken}.`,
          itemCount: group.items.length,
          urgency: avgUrgency,
        };
      });

    const prioritized = this.prioritize(sections);
    const greeting = this.generateGreeting(userId);
    const closingRemarks = this.generateClosing(prioritized);
    const wordsTotal =
      greeting.split(' ').length +
      prioritized.reduce((acc, s) => acc + s.spoken.split(' ').length, 0) +
      closingRemarks.split(' ').length;
    const estimatedDurationSec = Math.ceil(wordsTotal / 2.5);

    return {
      userId,
      generatedAt: Date.now(),
      greeting,
      sections: prioritized,
      closingRemarks,
      estimatedDurationSec,
      suggestedAutomations: [],
    };
  }

  toVoiceScript(brief: VoiceBrief): string {
    const parts = [brief.greeting];
    for (const section of brief.sections) {
      parts.push(section.spoken);
    }
    parts.push(brief.closingRemarks);
    return parts.join(' ');
  }

  prioritize(sections: VoiceBriefSection[]): VoiceBriefSection[] {
    return [...sections].sort((a, b) => b.urgency - a.urgency);
  }

  suggestAutomations(patterns: { app: string; action: string; frequency: number }[]): string[] {
    return patterns
      .filter((p) => p.frequency >= 3)
      .map((p) => `You frequently ${p.action} in ${p.app}. Want me to automate that?`);
  }

  private generateGreeting(_userId: string): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning. Here is your daily brief.';
    if (hour < 18) return 'Good afternoon. Here is your daily brief.';
    return 'Good evening. Here is your daily brief.';
  }

  private generateClosing(sections: VoiceBriefSection[]): string {
    const totalItems = sections.reduce((acc, s) => acc + s.itemCount, 0);
    if (totalItems === 0) {
      return 'You have nothing urgent today. Enjoy your day!';
    }
    return `That covers ${totalItems} items across ${sections.length} apps. Have a productive day!`;
  }
}
