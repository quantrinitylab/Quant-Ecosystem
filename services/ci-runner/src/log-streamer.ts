export interface LogEntry {
  timestamp: number;
  stream: 'stdout' | 'stderr';
  line: string;
}

export class LogStreamer {
  private buffers = new Map<string, LogEntry[]>();

  startStreaming(jobId: string): void {
    this.buffers.set(jobId, []);
  }

  appendLog(jobId: string, line: string, stream: 'stdout' | 'stderr'): void {
    const buffer = this.buffers.get(jobId);
    if (!buffer) {
      throw new Error(`No active stream for job ${jobId}`);
    }
    buffer.push({ timestamp: Date.now(), stream, line });
  }

  getFullLog(jobId: string): { stdout: string; stderr: string } {
    const buffer = this.buffers.get(jobId);
    if (!buffer) {
      throw new Error(`No stream found for job ${jobId}`);
    }

    const stdout = buffer
      .filter((entry) => entry.stream === 'stdout')
      .map((entry) => entry.line)
      .join('\n');

    const stderr = buffer
      .filter((entry) => entry.stream === 'stderr')
      .map((entry) => entry.line)
      .join('\n');

    return { stdout, stderr };
  }

  endStreaming(jobId: string): { stdout: string; stderr: string; totalLines: number } {
    const buffer = this.buffers.get(jobId);
    if (!buffer) {
      throw new Error(`No stream found for job ${jobId}`);
    }

    const result = this.getFullLog(jobId);
    const totalLines = buffer.length;
    this.buffers.delete(jobId);

    return { ...result, totalLines };
  }
}
