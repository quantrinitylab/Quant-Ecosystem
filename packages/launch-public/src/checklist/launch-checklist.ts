import type { LaunchChecklist, LaunchGate } from '../types.js';

const TEMPLATES: Record<string, string[]> = {
  ios: [
    'pen-test-clean',
    'nps-gte-40',
    'app-store-approved',
    'privacy-policy',
    'screenshots-ready',
  ],
  android: [
    'pen-test-clean',
    'nps-gte-40',
    'play-store-approved',
    'privacy-policy',
    'screenshots-ready',
  ],
  web: ['pen-test-clean', 'nps-gte-40', 'ssl-configured', 'cdn-ready', 'seo-audit'],
};

export class LaunchChecklistManager {
  private gates: Map<string, LaunchGate> = new Map();
  private deadlines = new Map<string, number>();

  constructor(template?: string) {
    const preset =
      template && TEMPLATES[template]
        ? TEMPLATES[template]
        : ['pen-test-clean', 'nps-gte-40', 'd30-gte-25', 'zero-p0-incidents', 'app-store-approved'];
    preset.forEach((name) => this.gates.set(name, { name, required: true, passed: false }));
  }

  addGate(name: string, required: boolean, dependsOn?: string[]): void {
    this.gates.set(name, { name, required, passed: false, dependsOn });
  }

  passGate(name: string): boolean {
    const g = this.gates.get(name);
    if (!g) return false;
    if (g.dependsOn) {
      for (const dep of g.dependsOn) {
        const depGate = this.gates.get(dep);
        if (!depGate || !depGate.passed) return false;
      }
    }
    g.passed = true;
    return true;
  }

  failGate(name: string): void {
    const g = this.gates.get(name);
    if (g) g.passed = false;
  }

  setDeadline(name: string, deadline: number): void {
    this.deadlines.set(name, deadline);
  }

  isOverdue(name: string): boolean {
    const deadline = this.deadlines.get(name);
    if (!deadline) return false;
    const g = this.gates.get(name);
    if (!g || g.passed) return false;
    return Date.now() > deadline;
  }

  getOverdueGates(): string[] {
    const overdue: string[] = [];
    for (const [name] of this.gates) {
      if (this.isOverdue(name)) overdue.push(name);
    }
    return overdue;
  }

  getStatus(): LaunchChecklist {
    const gates = [...this.gates.values()];
    const allHardGatesPassed = gates.filter((g) => g.required).every((g) => g.passed);
    return { gates, allHardGatesPassed, readyToLaunch: allHardGatesPassed };
  }

  isReadyToLaunch(): boolean {
    return this.getStatus().readyToLaunch;
  }

  getGate(name: string): LaunchGate | null {
    return this.gates.get(name) ?? null;
  }
}
