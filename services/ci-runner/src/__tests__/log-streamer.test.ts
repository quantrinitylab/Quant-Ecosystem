import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogStreamer, type RedisLogPublisher } from '../log-streamer.js';

describe('LogStreamer & Redis PubSub Streaming Pipeline (Task W34-04)', () => {
  let streamer: LogStreamer;
  let mockRedis: RedisLogPublisher;
  let publishedMessages: Array<{ channel: string; message: string }>;

  beforeEach(() => {
    publishedMessages = [];
    mockRedis = {
      publish: vi.fn(async (channel: string, message: string) => {
        publishedMessages.push({ channel, message });
        return 1;
      }),
    };
    streamer = new LogStreamer({ redisPublisher: mockRedis });
  });

  afterEach(() => {
    streamer.close();
  });

  describe('startStreaming & In-Memory Log Capture', () => {
    it('initializes a log buffer for a job', () => {
      streamer.startStreaming('job-1');
      const log = streamer.getFullLog('job-1');
      expect(log.stdout).toBe('');
      expect(log.stderr).toBe('');
    });
  });

  describe('appendLog & Monotonic Sequence IDs', () => {
    it('appends stdout lines to the buffer', () => {
      streamer.startStreaming('job-1');
      streamer.appendLog('job-1', 'line 1', 'stdout');
      streamer.appendLog('job-1', 'line 2', 'stdout');

      const log = streamer.getFullLog('job-1');
      expect(log.stdout).toBe('line 1\nline 2');
    });

    it('attaches strictly monotonic sequence IDs to emitted entries', () => {
      streamer.startStreaming('job-1');
      const e1 = streamer.appendLog('job-1', 'first line', 'stdout');
      const e2 = streamer.appendLog('job-1', 'second line', 'stdout');
      const e3 = streamer.appendLog('job-1', 'third line', 'stderr');

      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
      expect(e3.seq).toBe(3);
    });

    it('appends stderr lines to the buffer', () => {
      streamer.startStreaming('job-1');
      streamer.appendLog('job-1', 'error 1', 'stderr');
      streamer.appendLog('job-1', 'error 2', 'stderr');

      const log = streamer.getFullLog('job-1');
      expect(log.stderr).toBe('error 1\nerror 2');
    });

    it('separates stdout and stderr', () => {
      streamer.startStreaming('job-1');
      streamer.appendLog('job-1', 'out line', 'stdout');
      streamer.appendLog('job-1', 'err line', 'stderr');
      streamer.appendLog('job-1', 'out line 2', 'stdout');

      const log = streamer.getFullLog('job-1');
      expect(log.stdout).toBe('out line\nout line 2');
      expect(log.stderr).toBe('err line');
    });

    it('throws if job is not streaming', () => {
      expect(() => streamer.appendLog('nonexistent', 'line', 'stdout')).toThrow(
        'No active stream for job nonexistent',
      );
    });
  });

  describe('getFullLog', () => {
    it('throws if job has no stream', () => {
      expect(() => streamer.getFullLog('nonexistent')).toThrow(
        'No stream found for job nonexistent',
      );
    });
  });

  describe('endStreaming', () => {
    it('returns full log and total lines then removes buffer', () => {
      streamer.startStreaming('job-1');
      streamer.appendLog('job-1', 'line 1', 'stdout');
      streamer.appendLog('job-1', 'line 2', 'stdout');
      streamer.appendLog('job-1', 'err', 'stderr');

      const result = streamer.endStreaming('job-1');

      expect(result.stdout).toBe('line 1\nline 2');
      expect(result.stderr).toBe('err');
      expect(result.totalLines).toBe(3);

      expect(() => streamer.getFullLog('job-1')).toThrow();
    });

    it('throws if job has no stream', () => {
      expect(() => streamer.endStreaming('nonexistent')).toThrow(
        'No stream found for job nonexistent',
      );
    });
  });

  describe('Redis PubSub Batching, Throttling & Bounded Ring Buffer', () => {
    it('publishes batched logs to Redis channel channel:ci:build:${buildId}:logs after throttle', async () => {
      vi.useFakeTimers();

      streamer.startStreaming('build-100-compile');
      streamer.appendLog('build-100-compile', 'Starting compilation...', 'stdout');
      streamer.appendLog('build-100-compile', 'Compiling packages...', 'stdout');

      expect(mockRedis.publish).not.toHaveBeenCalled();

      // Advance by 50ms (default batchThrottleMs)
      await vi.advanceTimersByTimeAsync(50);

      expect(mockRedis.publish).toHaveBeenCalledTimes(1);
      const { channel, message } = publishedMessages[0]!;
      expect(channel).toBe('channel:ci:build:build-100:logs');

      const payload = JSON.parse(message);
      expect(payload.buildId).toBe('build-100');
      expect(payload.seq).toBe(1);
      expect(payload.entries).toHaveLength(2);
      expect(payload.entries[0].line).toBe('Starting compilation...');
      expect(payload.entries[1].line).toBe('Compiling packages...');

      vi.useRealTimers();
    });

    it('immediately flushes when batch boundary reaches 4KB', async () => {
      streamer.startStreaming('build-200-test');

      // Generate a string that exceeds 4KB (4096 bytes)
      const largeLine = 'X'.repeat(4100);
      streamer.appendLog('build-200-test', largeLine, 'stdout');

      // Should flush immediately without waiting for 50ms timer
      expect(mockRedis.publish).toHaveBeenCalled();
      const { channel, message } = publishedMessages[0]!;
      expect(channel).toBe('channel:ci:build:build-200:logs');

      const payload = JSON.parse(message);
      expect(payload.buildId).toBe('build-200');
      expect(payload.entries[0].line).toBe(largeLine);
    });

    it('emits terminal batch with isEnd: true upon endStreaming', async () => {
      streamer.startStreaming('build-300-job');
      streamer.appendLog('build-300-job', 'Finalizing...', 'stdout');
      streamer.endStreaming('build-300-job');

      const lastMessage = publishedMessages[publishedMessages.length - 1];
      expect(lastMessage).toBeDefined();
      expect(lastMessage!.channel).toBe('channel:ci:build:build-300:logs');

      const payload = JSON.parse(lastMessage!.message);
      expect(payload.isEnd).toBe(true);
    });

    it('enforces bounded ring buffer (maxLinesPerJob) to prevent heap exhaustion', () => {
      const smallStreamer = new LogStreamer({ maxLinesPerJob: 5 });
      smallStreamer.startStreaming('bounded-job');

      for (let i = 1; i <= 8; i++) {
        smallStreamer.appendLog('bounded-job', `line ${i}`, 'stdout');
      }

      const log = smallStreamer.getFullLog('bounded-job');
      // Should retain only the latest 5 lines (lines 4 to 8)
      expect(log.stdout).toBe('line 4\nline 5\nline 6\nline 7\nline 8');
    });
  });
});
