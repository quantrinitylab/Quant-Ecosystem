// ============================================================================
// QuantTube - Transcoding Progress Component
// Video transcoding status with quality levels (360p/720p/1080p/4K)
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface QualityLevel {
  id: string;
  label: string;
  resolution: string;
  bitrate: string;
  progress: number;
  status: 'queued' | 'processing' | 'complete' | 'error';
  estimatedTime: number | null;
  fileSize: string | null;
}

interface TranscodingJob {
  id: string;
  videoId: string;
  videoTitle: string;
  uploadedAt: string;
  totalProgress: number;
  qualityLevels: QualityLevel[];
  status: 'initializing' | 'transcoding' | 'complete' | 'failed';
  thumbnailsGenerated: number;
  thumbnailsTotal: number;
  hlsPackaged: boolean;
}

interface TranscodingProgressProps {
  jobId: string;
  onComplete?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
}

const MOCK_JOB: TranscodingJob = {
  id: 'tj-001',
  videoId: 'v-123',
  videoTitle: 'React 19 Tutorial - Whats New',
  uploadedAt: '2024-01-15T10:30:00Z',
  totalProgress: 67,
  qualityLevels: [
    { id: 'q360', label: '360p', resolution: '640x360', bitrate: '800 kbps', progress: 100, status: 'complete', estimatedTime: null, fileSize: '45 MB' },
    { id: 'q720', label: '720p', resolution: '1280x720', bitrate: '2.5 Mbps', progress: 100, status: 'complete', estimatedTime: null, fileSize: '120 MB' },
    { id: 'q1080', label: '1080p', resolution: '1920x1080', bitrate: '5 Mbps', progress: 68, status: 'processing', estimatedTime: 180, fileSize: null },
    { id: 'q4k', label: '4K', resolution: '3840x2160', bitrate: '15 Mbps', progress: 0, status: 'queued', estimatedTime: 600, fileSize: null },
  ],
  status: 'transcoding',
  thumbnailsGenerated: 8,
  thumbnailsTotal: 12,
  hlsPackaged: false,
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

const TranscodingProgress: React.FC<TranscodingProgressProps> = ({ jobId, onComplete, onRetry }) => {
  const [job, setJob] = useState<TranscodingJob>(MOCK_JOB);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean>(true);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loadJob = async () => {
      try {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 400));
        setJob(MOCK_JOB);
        setLoading(false);
      } catch (err) {
        setError('Failed to load transcoding status');
        setLoading(false);
      }
    };
    loadJob();
  }, [jobId]);

  useEffect(() => {
    if (job.status === 'transcoding') {
      progressTimerRef.current = setInterval(() => {
        setJob(prev => {
          const updatedLevels = prev.qualityLevels.map(level => {
            if (level.status === 'processing' && level.progress < 100) {
              const newProgress = Math.min(level.progress + Math.random() * 5, 100);
              return {
                ...level,
                progress: newProgress,
                status: newProgress >= 100 ? 'complete' as const : 'processing' as const,
                fileSize: newProgress >= 100 ? '240 MB' : null,
              };
            }
            return level;
          });
          const allComplete = updatedLevels.every(l => l.status === 'complete');
          const totalProgress = Math.round(updatedLevels.reduce((sum, l) => sum + l.progress, 0) / updatedLevels.length);
          return {
            ...prev,
            qualityLevels: updatedLevels,
            totalProgress,
            status: allComplete ? 'complete' : 'transcoding',
          };
        });
      }, 1000);
      return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
    }
  }, [job.status]);

  useEffect(() => {
    if (job.status === 'complete' && onComplete) {
      onComplete(job.id);
    }
  }, [job.status, job.id, onComplete]);

  const handleRetry = useCallback(() => {
    if (onRetry) onRetry(jobId);
    setJob(prev => ({ ...prev, status: 'transcoding' }));
  }, [jobId, onRetry]);

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'complete': return '✓';
      case 'processing': return '⟳';
      case 'error': return '!';
      default: return '○';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'complete': return 'text-green-400';
      case 'processing': return 'text-blue-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 text-center">
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={handleRetry} className="mt-2 text-blue-400 text-sm hover:text-blue-300">Retry</button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800/50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${job.status === 'complete' ? 'bg-green-500' : job.status === 'failed' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`} />
          <div>
            <p className="text-white text-sm font-medium">{job.videoTitle}</p>
            <p className="text-gray-400 text-xs capitalize">{job.status}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-white text-sm font-medium">{job.totalProgress}%</span>
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Total Progress Bar */}
      <div className="h-1 bg-gray-800">
        <div
          className={`h-full transition-all duration-500 ${job.status === 'complete' ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${job.totalProgress}%` }}
        />
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Quality Levels */}
          <div className="space-y-3">
            {job.qualityLevels.map(level => (
              <div key={level.id} className="flex items-center space-x-3">
                <span className={`text-lg ${getStatusColor(level.status)}`}>{getStatusIcon(level.status)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-white text-sm font-medium">{level.label}</span>
                      <span className="text-gray-500 text-xs">{level.resolution}</span>
                      <span className="text-gray-600 text-xs">{level.bitrate}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {level.fileSize && <span className="text-gray-400 text-xs">{level.fileSize}</span>}
                      {level.estimatedTime && level.status === 'processing' && (
                        <span className="text-gray-500 text-xs">~{formatTime(level.estimatedTime)} left</span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        level.status === 'complete' ? 'bg-green-500' :
                        level.status === 'processing' ? 'bg-blue-500' :
                        level.status === 'error' ? 'bg-red-500' : 'bg-gray-600'
                      }`}
                      style={{ width: `${level.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Additional Info */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-800">
            <div className="flex items-center space-x-4 text-xs text-gray-400">
              <span>Thumbnails: {job.thumbnailsGenerated}/{job.thumbnailsTotal}</span>
              <span>HLS: {job.hlsPackaged ? '✓ Ready' : 'Pending'}</span>
            </div>
            {job.status === 'failed' && (
              <button onClick={handleRetry} className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
                Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscodingProgress;
