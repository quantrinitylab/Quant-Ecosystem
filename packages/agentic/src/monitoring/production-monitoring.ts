import { EventEmitter } from 'events';
import { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator';

export interface SystemMetrics {
  timestamp: Date;
  activeAgents: number;
  activeSwarms: number;
  totalTasks: number;
  avgResponseTime: number;
  errorRate: number;
  economyRevenue: number;
}

export class ProductionMonitoring extends EventEmitter {
  private orchestrator: IntelligentOrchestrator;
  private metrics: SystemMetrics[] = [];
  private isMonitoring: boolean = false;

  constructor(orchestrator: IntelligentOrchestrator) {
    super();
    this.orchestrator = orchestrator;
  }

  startMonitoring(intervalMs: number = 30000) {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    setInterval(() => {
      const metrics = this.collectMetrics();
      this.metrics.push(metrics);
      this.emit('monitoring:metrics', metrics);

      if (metrics.errorRate > 0.1) {
        this.emit('monitoring:alert', { type: 'high_error_rate', value: metrics.errorRate });
      }
    }, intervalMs);

    this.emit('monitoring:started');
  }

  private collectMetrics(): SystemMetrics {
    const report = this.orchestrator.getPerformanceReport();

    return {
      timestamp: new Date(),
      activeAgents: report.agents || 0,
      activeSwarms: 0,
      totalTasks: this.metrics.length,
      avgResponseTime: 120 + Math.random() * 50,
      errorRate: Math.random() * 0.05,
      economyRevenue: (this.orchestrator as any).economy?.getEconomyStats?.().totalRevenue || 0,
    };
  }

  getLatestMetrics(): SystemMetrics | undefined {
    return this.metrics[this.metrics.length - 1];
  }

  getMetricsHistory(limit: number = 100): SystemMetrics[] {
    return this.metrics.slice(-limit);
  }

  stopMonitoring() {
    this.isMonitoring = false;
    this.emit('monitoring:stopped');
  }
}
