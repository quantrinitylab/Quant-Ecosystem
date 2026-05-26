import { describe, it, expect } from 'vitest';
import { LogStreamer } from '../log-streamer.js';

describe('LogStreamer', () => {
  let streamer: LogStreamer;

  beforeEach(() => {
    streamer = new LogStreamer();
  });

  describe('startStreaming', () => {
    it('initializes a log buffer for a job', () => {
      streamer.startStreaming('job-1');
      const log = streamer.getFullLog('job-1');
      expect(log.stdout).toBe('');
      expect(log.stderr).toBe('');
    });
  });

  describe('appendLog', () => {
    it('appends stdout lines to the buffer', () => {
      streamer.startStreaming('job-1');
      streamer.appendLog('job-1', 'line 1', 'stdout');
      streamer.appendLog('job-1', 'line 2', 'stdout');

      const log = streamer.getFullLog('job-1');
      expect(log.stdout).toBe('line 1\nline 2');
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
});
