import type { CrisisResource } from '../types.js';

const DEFAULT_RESOURCES: CrisisResource[] = [
  { region: 'US', name: '988 Suicide & Crisis Lifeline', phone: '988', available247: true },
  { region: 'US', name: 'Crisis Text Line', phone: 'Text HOME to 741741', available247: true },
  { region: 'UK', name: 'Samaritans', phone: '116 123', available247: true },
  { region: 'UK', name: 'SHOUT', phone: 'Text SHOUT to 85258', available247: true },
  { region: 'IN', name: 'Vandrevala Foundation', phone: '1860-2662-345', available247: true },
  { region: 'IN', name: 'iCall', phone: '9152987821', available247: false },
  { region: 'GLOBAL', name: 'Befrienders Worldwide', phone: 'befrienders.org', available247: true },
];

const CRISIS_KEYWORDS = [
  'suicide',
  'kill myself',
  'end it all',
  'no reason to live',
  'self-harm',
  'want to die',
  'hopeless',
  'giving up',
];

export class CrisisResources {
  private resources: CrisisResource[] = [...DEFAULT_RESOURCES];
  private interventionHooks: Array<(keyword: string) => void> = [];

  getResourcesByRegion(region: string): CrisisResource[] {
    return this.resources.filter((r) => r.region === region || r.region === 'GLOBAL');
  }

  getAllResources(): CrisisResource[] {
    return [...this.resources];
  }

  addResource(resource: CrisisResource): void {
    this.resources.push(resource);
  }

  detectCrisis(text: string): { detected: boolean; keyword: string | null } {
    const lower = text.toLowerCase();
    for (const keyword of CRISIS_KEYWORDS) {
      if (lower.includes(keyword)) {
        for (const hook of this.interventionHooks) {
          hook(keyword);
        }
        return { detected: true, keyword };
      }
    }
    return { detected: false, keyword: null };
  }

  onIntervention(hook: (keyword: string) => void): void {
    this.interventionHooks.push(hook);
  }

  isEmergencyApp(appId: string): boolean {
    const emergencyApps = ['emergency', 'phone', 'sos', '911', '112', '999'];
    return emergencyApps.includes(appId.toLowerCase());
  }

  neverBlock(appId: string): boolean {
    return this.isEmergencyApp(appId);
  }
}
