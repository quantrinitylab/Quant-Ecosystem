export interface LogEntry {
  id: string;
  agentId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class AgentLogger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 10000;

  log(agentId: string, level: LogEntry['level'], message: string, metadata?: Record<string, any>) {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      level,
      message,
      timestamp: new Date(),
      metadata,
    };

    this.logs.push(entry);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      // This is the low-level console sink for the agent logger; it intentionally
      // writes formatted output to stdout in non-production environments.
      // eslint-disable-next-line no-console
      console.log(`[${agentId}] [${level.toUpperCase()}] ${message}`);
    }
  }

  getLogs(agentId?: string, level?: LogEntry['level'], limit: number = 100): LogEntry[] {
    let filtered = this.logs;

    if (agentId) {
      filtered = filtered.filter((log) => log.agentId === agentId);
    }

    if (level) {
      filtered = filtered.filter((log) => log.level === level);
    }

    return filtered.slice(-limit);
  }

  clearLogs(agentId?: string) {
    if (agentId) {
      this.logs = this.logs.filter((log) => log.agentId !== agentId);
    } else {
      this.logs = [];
    }
  }
}

export const agentLogger = new AgentLogger();
