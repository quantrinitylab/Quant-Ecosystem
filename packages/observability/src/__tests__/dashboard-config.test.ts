import { describe, it, expect } from 'vitest';
import { DashboardConfigGenerator } from '../dashboard-config.js';

describe('DashboardConfigGenerator', () => {
  const generator = new DashboardConfigGenerator();

  it('generateServiceDashboard returns valid structure with panels', () => {
    const dashboard = generator.generateServiceDashboard('quantmail');

    expect(dashboard.title).toContain('quantmail');
    expect(dashboard.uid).toBe('quantmail-service');
    expect(dashboard.panels).toBeDefined();
    expect(dashboard.panels.length).toBeGreaterThan(0);
    expect(dashboard.tags).toContain('quantmail');
    expect(dashboard.editable).toBe(true);
    expect(dashboard.refresh).toBeDefined();
  });

  it('panels have correct types (graph, stat, gauge)', () => {
    const dashboard = generator.generateServiceDashboard('quantube');
    const types = dashboard.panels.map((p) => p.type);

    expect(types).toContain('graph');
    expect(types).toContain('stat');
    expect(types).toContain('gauge');
  });

  it('generateOverviewDashboard includes all services', () => {
    const services = ['quantmail', 'quantube', 'quantsync'];
    const dashboard = generator.generateOverviewDashboard(services);

    expect(dashboard.title).toContain('Overview');
    expect(dashboard.uid).toBe('services-overview');

    // Each service should have panels referencing it
    for (const service of services) {
      const servicePanel = dashboard.panels.find((p) => p.title.includes(service));
      expect(servicePanel).toBeDefined();
    }
  });

  it('panels have correct gridPos layout (x, y, w, h)', () => {
    const dashboard = generator.generateServiceDashboard('quantdocs');

    for (const panel of dashboard.panels) {
      expect(panel.gridPos).toBeDefined();
      expect(typeof panel.gridPos.x).toBe('number');
      expect(typeof panel.gridPos.y).toBe('number');
      expect(typeof panel.gridPos.w).toBe('number');
      expect(typeof panel.gridPos.h).toBe('number');
      expect(panel.gridPos.x).toBeGreaterThanOrEqual(0);
      expect(panel.gridPos.y).toBeGreaterThanOrEqual(0);
      expect(panel.gridPos.w).toBeGreaterThan(0);
      expect(panel.gridPos.h).toBeGreaterThan(0);
    }
  });
});
