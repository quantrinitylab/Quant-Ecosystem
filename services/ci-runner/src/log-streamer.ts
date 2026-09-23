export interface LogEntry {
  seq: number;
  timestamp: number;
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface RedisLogPublisher {
  publish(channel: string, message: string): Promise<number> | number;
}

export interface LogBatchPayload {
  buildId: string;
  jobId: string;
  seq: number;
  entries: LogEntry[];
  isEnd?: boolean;
}

export interface LogStreamerOptions {
  redisPublisher?: RedisLogPublisher | null;
  batchThrottleMs?: number; // default: 50ms
  maxBatchBytes?: number; // default: 4096 (4KB)
  maxLinesPerJob?: number; // default: 10,000 lines (ring buffer)
  maxBytesPerJob?: number; // default: 10 * 1024 * 1024 (10MB)
}

interface JobStreamState {
  jobId: string;
  buildId: string;
  channel: string;
  buffer: LogEntry[];
  totalBytes: number;
  seqCounter: number;
  batchSeqCounter: number;
  pendingBatch: LogEntry[];
  pendingBatchBytes: number;
  flushTimer: NodeJS.Timeout | null;
}

export class LogStreamer {
  private options: Required<LogStreamerOptions>;
  private streams = new Map<string, JobStreamState>();

  constructor(options: LogStreamerOptions = {}) {
    this.options = {
      redisPublisher: options.redisPublisher ?? null,
      batchThrottleMs: options.batchThrottleMs ?? 50,
      maxBatchBytes: options.maxBatchBytes ?? 4096, // 4KB boundary
      maxLinesPerJob: options.maxLinesPerJob ?? 10000, // Ring buffer limit
      maxBytesPerJob: options.maxBytesPerJob ?? 10 * 1024 * 1024, // 10MB limit
    };
  }

  /**
   * Starts a streaming buffer for a given job/build.
   */
  startStreaming(jobId: string, customBuildId?: string): void {
    // Clear any existing stream state
    if (this.streams.has(jobId)) {
      this.clearTimer(this.streams.get(jobId)!);
    }

    const buildId = customBuildId ?? this.extractBuildId(jobId);
    const channel = `channel:ci:build:${buildId}:logs`;

    this.streams.set(jobId, {
      jobId,
      buildId,
      channel,
      buffer: [],
      totalBytes: 0,
      seqCounter: 0,
      batchSeqCounter: 0,
      pendingBatch: [],
      pendingBatchBytes: 0,
      flushTimer: null,
    });
  }

  /**
   * Appends a log line to the stream.
   * Batches stdout/stderr with a 50ms throttle or 4KB boundary,
   * and publishes to Redis PubSub with strictly monotonic sequence IDs.
   * Enforces a bounded ring buffer (10,000 lines / 10MB) to prevent heap exhaustion.
   */
  appendLog(jobId: string, line: string, stream: 'stdout' | 'stderr'): LogEntry {
    const state = this.streams.get(jobId);
    if (!state) {
      throw new Error(`No active stream for job ${jobId}`);
    }

    const lineBytes = Buffer.byteLength(line, 'utf8') + 32; // Include metadata overhead
    state.seqCounter += 1;

    const entry: LogEntry = {
      seq: state.seqCounter,
      timestamp: Date.now(),
      stream,
      line,
    };

    // Bounded ring buffer enforcement (drop oldest if exceeded)
    while (
      state.buffer.length >= this.options.maxLinesPerJob ||
      state.totalBytes + lineBytes > this.options.maxBytesPerJob
    ) {
      const dropped = state.buffer.shift();
      if (!dropped) break;
      state.totalBytes -= Buffer.byteLength(dropped.line, 'utf8') + 32;
    }

    state.buffer.push(entry);
    state.totalBytes += lineBytes;

    // Add to pending batch for PubSub publication
    state.pendingBatch.push(entry);
    state.pendingBatchBytes += lineBytes;

    if (this.options.redisPublisher) {
      if (state.pendingBatchBytes >= this.options.maxBatchBytes) {
        // 4KB boundary reached -> flush immediately
        void this.flushBatch(state);
      } else if (!state.flushTimer) {
        // 50ms throttle timer
        state.flushTimer = setTimeout(() => {
          void this.flushBatch(state);
        }, this.options.batchThrottleMs);
      }
    }

    return entry;
  }

  /**
   * Immediately flushes any pending batch for the given job.
   */
  async flush(jobId: string): Promise<void> {
    const state = this.streams.get(jobId);
    if (state) {
      await this.flushBatch(state);
    }
  }

  /**
   * Internal batch publisher to Redis PubSub with monotonically increasing sequence IDs.
   */
  private async flushBatch(state: JobStreamState, isEnd = false): Promise<void> {
    this.clearTimer(state);

    if (state.pendingBatch.length === 0 && !isEnd) {
      return;
    }

    const entriesToPublish = [...state.pendingBatch];
    state.pendingBatch = [];
    state.pendingBatchBytes = 0;

    if (this.options.redisPublisher) {
      state.batchSeqCounter += 1;
      const payload: LogBatchPayload = {
        buildId: state.buildId,
        jobId: state.jobId,
        seq: state.batchSeqCounter,
        entries: entriesToPublish,
        isEnd,
      };

      try {
        await this.options.redisPublisher.publish(state.channel, JSON.stringify(payload));
      } catch {
        // Non-blocking log publication failure
      }
    }
  }

  /**
   * Returns current full log stdout and stderr.
   */
  getFullLog(jobId: string): { stdout: string; stderr: string } {
    const state = this.streams.get(jobId);
    if (!state) {
      throw new Error(`No stream found for job ${jobId}`);
    }

    const stdout = state.buffer
      .filter((entry) => entry.stream === 'stdout')
      .map((entry) => entry.line)
      .join('\n');

    const stderr = state.buffer
      .filter((entry) => entry.stream === 'stderr')
      .map((entry) => entry.line)
      .join('\n');

    return { stdout, stderr };
  }

  /**
   * Ends streaming for a job, flushes final logs with isEnd = true,
   * clears timers, and frees buffer memory.
   */
  endStreaming(jobId: string): { stdout: string; stderr: string; totalLines: number } {
    const state = this.streams.get(jobId);
    if (!state) {
      throw new Error(`No stream found for job ${jobId}`);
    }

    // Flush any pending logs and publish terminal payload
    void this.flushBatch(state, true);

    const result = this.getFullLog(jobId);
    const totalLines = state.buffer.length;

    this.clearTimer(state);
    this.streams.delete(jobId);

    return { ...result, totalLines };
  }

  /**
   * Cleans up all pending timers on shutdown.
   */
  close(): void {
    for (const state of this.streams.values()) {
      this.clearTimer(state);
    }
    this.streams.clear();
  }

  private clearTimer(state: JobStreamState): void {
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
  }

  private extractBuildId(jobId: string): string {
    const lastDash = jobId.lastIndexOf('-');
    if (lastDash > 0) {
      return jobId.slice(0, lastDash);
    }
    return jobId;
  }
}
