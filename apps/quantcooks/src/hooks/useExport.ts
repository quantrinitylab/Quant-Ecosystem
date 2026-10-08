// ============================================================================
// QuantEdits - useExport Hook
// Export state backed by the real POST /api/exports API: jobs are queued on
// the backend and their status is polled from GET /api/exports/[id]/status.
// No simulated progress and no invented download URLs.
// ============================================================================

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { apiFetchRaw } from '@quant/api-client';

interface ExportSettings {
  format: 'mp4' | 'mov' | 'gif' | 'png' | 'jpg' | 'pdf' | 'svg';
  quality: number;
  resolution: { width: number; height: number; label: string };
  fps: number;
  audioBitrate: number;
  includeAudio: boolean;
  startTime: number;
  endTime: number;
  exportRange: 'full' | 'custom';
  watermark: string | null;
  metadata: Record<string, string>;
}

/** Mirrors the backend ExportStatus — the only statuses a real job can have. */
type ExportJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface ExportJob {
  id: string;
  projectId: string;
  projectName: string;
  settings: ExportSettings;
  status: ExportJobStatus;
  progress: number | null;
  startedAt: number;
  completedAt: number | null;
  outputUrl: string | null;
  error: string | null;
}

interface ExportPreset {
  id: string;
  name: string;
  platform: string;
  settings: Partial<ExportSettings>;
}

interface UseExportReturn {
  queue: ExportJob[];
  activeJob: ExportJob | null;
  isExporting: boolean;
  settings: ExportSettings;
  presets: ExportPreset[];
  estimatedSize: number;
  estimatedTime: number;
  updateSettings: (updates: Partial<ExportSettings>) => void;
  applyPreset: (presetId: string) => void;
  savePreset: (name: string, platform: string) => void;
  startExport: (projectId: string, projectName: string) => void;
  cancelExport: (jobId: string) => void;
  retryExport: (jobId: string) => void;
  removeFromQueue: (jobId: string) => void;
  clearCompleted: () => void;
  downloadOutput: (jobId: string) => void;
  batchExport: (projects: { id: string; name: string }[]) => void;
}

const DEFAULT_SETTINGS: ExportSettings = {
  format: 'mp4',
  quality: 85,
  resolution: { width: 1920, height: 1080, label: '1080p Full HD' },
  fps: 30,
  audioBitrate: 192,
  includeAudio: true,
  startTime: 0,
  endTime: 0,
  exportRange: 'full',
  watermark: null,
  metadata: {},
};

const DEFAULT_PRESETS: ExportPreset[] = [
  {
    id: 'qneon-reel',
    name: 'QuantNeon Reel',
    platform: 'QuantNeon',
    settings: {
      format: 'mp4',
      resolution: { width: 1080, height: 1920, label: '1080x1920' },
      quality: 85,
      fps: 30,
    },
  },
  {
    id: 'qtube-video',
    name: 'QuantTube Video',
    platform: 'QuantTube',
    settings: {
      format: 'mp4',
      resolution: { width: 1920, height: 1080, label: '1920x1080' },
      quality: 90,
      fps: 30,
    },
  },
  {
    id: 'qtube-short',
    name: 'QuantTube Shorts',
    platform: 'QuantTube',
    settings: {
      format: 'mp4',
      resolution: { width: 1080, height: 1920, label: '1080x1920' },
      quality: 85,
      fps: 30,
    },
  },
  {
    id: 'qmax-video',
    name: 'QuantMax Video',
    platform: 'QuantMax',
    settings: {
      format: 'mp4',
      resolution: { width: 1080, height: 1920, label: '1080x1920' },
      quality: 85,
      fps: 30,
    },
  },
  {
    id: 'web-gif',
    name: 'Web GIF',
    platform: 'Web',
    settings: {
      format: 'gif',
      resolution: { width: 480, height: 480, label: '480x480' },
      quality: 70,
      fps: 15,
      includeAudio: false,
    },
  },
];

interface QueueExportApiResponse {
  success: boolean;
  data?: {
    id: string;
    projectId: string;
    format: string;
    resolution: string;
    quality: string;
    status: ExportJobStatus;
    outputUrl: string | null;
    createdAt: string;
    completedAt: string | null;
  };
  error?: { code: string; message: string };
}

const BACKEND_FORMATS = ['mp4', 'webm', 'mov', 'gif', 'png', 'jpg'] as const;

function mapFormat(format: ExportSettings['format']): string | null {
  return (BACKEND_FORMATS as readonly string[]).includes(format) ? format : null;
}

function mapResolution(resolution: ExportSettings['resolution']): string {
  const h = resolution.height;
  if (h >= 2160) return '4k';
  if (h >= 1080) return '1080p';
  if (h >= 720) return '720p';
  return 'original';
}

function mapQuality(quality: number): string {
  if (quality >= 95) return 'lossless';
  if (quality >= 70) return 'high';
  if (quality >= 40) return 'medium';
  return 'low';
}

export function useExport(): UseExportReturn {
  const [queue, setQueue] = useState<ExportJob[]>([]);
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);
  const [presets, setPresets] = useState<ExportPreset[]>(DEFAULT_PRESETS);
  const pollRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    const refs = pollRefs.current;
    return () => {
      refs.forEach((interval) => clearInterval(interval));
      refs.clear();
    };
  }, []);

  const activeJob = useMemo(
    () => queue.find((j) => j.status === 'QUEUED' || j.status === 'PROCESSING') || null,
    [queue],
  );
  const isExporting = useMemo(
    () => queue.some((j) => j.status === 'QUEUED' || j.status === 'PROCESSING'),
    [queue],
  );

  const estimatedSize = useMemo(() => {
    const pixels = settings.resolution.width * settings.resolution.height;
    const baseBitrate = (pixels / (1920 * 1080)) * (settings.quality / 100);
    const duration = settings.exportRange === 'full' ? 60 : settings.endTime - settings.startTime;
    if (settings.format === 'mp4' || settings.format === 'mov')
      return baseBitrate * duration * 8 * 1024 * 1024;
    if (settings.format === 'gif') return baseBitrate * duration * 4 * 1024 * 1024;
    return pixels * (settings.quality / 25);
  }, [settings]);

  const estimatedTime = useMemo(() => {
    const pixels = settings.resolution.width * settings.resolution.height;
    const complexityFactor = pixels / (1920 * 1080);
    const duration = settings.exportRange === 'full' ? 60 : settings.endTime - settings.startTime;
    return Math.ceil(duration * complexityFactor * 0.5);
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<ExportSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) setSettings((prev) => ({ ...prev, ...preset.settings }));
    },
    [presets],
  );

  const savePreset = useCallback(
    (name: string, platform: string) => {
      const newPreset: ExportPreset = {
        id: `preset-${Date.now()}`,
        name,
        platform,
        settings: { ...settings },
      };
      setPresets((prev) => [...prev, newPreset]);
    },
    [settings],
  );

  const stopPolling = useCallback((jobId: string) => {
    const interval = pollRefs.current.get(jobId);
    if (interval) {
      clearInterval(interval);
      pollRefs.current.delete(jobId);
    }
  }, []);

  const pollJobStatus = useCallback(
    (jobId: string) => {
      stopPolling(jobId);
      const interval = setInterval(async () => {
        try {
          const res = await apiFetchRaw(`/api/exports/${encodeURIComponent(jobId)}/status`);
          const payload = (await res.json().catch(() => null)) as QueueExportApiResponse | null;
          if (!res.ok || !payload?.success || !payload.data) {
            throw new Error(
              payload?.error?.message || `Status check failed (HTTP ${res.status})`,
            );
          }
          const data = payload.data;
          setQueue((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: data.status,
                    outputUrl: data.outputUrl,
                    completedAt: data.completedAt ? Date.parse(data.completedAt) : null,
                    error: data.status === 'FAILED' ? 'Export failed on the server' : null,
                  }
                : j,
            ),
          );
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            stopPolling(jobId);
          }
        } catch (err) {
          stopPolling(jobId);
          setQueue((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: 'FAILED' as const,
                    error: err instanceof Error ? err.message : 'Status check failed',
                  }
                : j,
            ),
          );
        }
      }, 2000);
      pollRefs.current.set(jobId, interval);
    },
    [stopPolling],
  );

  const startExport = useCallback(
    (projectId: string, projectName: string) => {
      const format = mapFormat(settings.format);
      if (!format) {
        const failedJob: ExportJob = {
          id: `export-${Date.now()}`,
          projectId,
          projectName,
          settings: { ...settings },
          status: 'FAILED',
          progress: null,
          startedAt: Date.now(),
          completedAt: Date.now(),
          outputUrl: null,
          error: `Format "${settings.format}" is not supported by the export service`,
        };
        setQueue((prev) => [...prev, failedJob]);
        return;
      }
      const run = async () => {
        try {
          const res = await apiFetchRaw('/api/exports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              format,
              resolution: mapResolution(settings.resolution),
              quality: mapQuality(settings.quality),
            }),
          });
          const payload = (await res.json().catch(() => null)) as QueueExportApiResponse | null;
          if (!res.ok || !payload?.success || !payload.data) {
            throw new Error(
              payload?.error?.message || `Export request failed (HTTP ${res.status})`,
            );
          }
          const job: ExportJob = {
            id: payload.data.id,
            projectId,
            projectName,
            settings: { ...settings },
            status: payload.data.status,
            progress: null,
            startedAt: Date.parse(payload.data.createdAt),
            completedAt: null,
            outputUrl: payload.data.outputUrl,
            error: null,
          };
          setQueue((prev) => [...prev, job]);
          pollJobStatus(job.id);
        } catch (err) {
          const failedJob: ExportJob = {
            id: `export-${Date.now()}`,
            projectId,
            projectName,
            settings: { ...settings },
            status: 'FAILED',
            progress: null,
            startedAt: Date.now(),
            completedAt: Date.now(),
            outputUrl: null,
            error: err instanceof Error ? err.message : 'Export request failed',
          };
          setQueue((prev) => [...prev, failedJob]);
        }
      };
      void run();
    },
    [settings, pollJobStatus],
  );

  const cancelExport = useCallback(
    (jobId: string) => {
      const run = async () => {
        stopPolling(jobId);
        try {
          const res = await apiFetchRaw(`/api/exports/${encodeURIComponent(jobId)}/cancel`, {
            method: 'POST',
          });
          const payload = (await res.json().catch(() => null)) as QueueExportApiResponse | null;
          if (!res.ok || !payload?.success || !payload.data) {
            throw new Error(
              payload?.error?.message || `Cancel request failed (HTTP ${res.status})`,
            );
          }
          setQueue((prev) =>
            prev.map((j) => (j.id === jobId ? { ...j, status: payload.data!.status } : j)),
          );
        } catch (err) {
          setQueue((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? { ...j, error: err instanceof Error ? err.message : 'Cancel failed' }
                : j,
            ),
          );
        }
      };
      void run();
    },
    [stopPolling],
  );

  const retryExport = useCallback(
    (jobId: string) => {
      const job = queue.find((j) => j.id === jobId);
      if (job) startExport(job.projectId, job.projectName);
    },
    [queue, startExport],
  );

  const removeFromQueue = useCallback(
    (jobId: string) => {
      stopPolling(jobId);
      setQueue((prev) => prev.filter((j) => j.id !== jobId));
    },
    [stopPolling],
  );

  const clearCompleted = useCallback(() => {
    setQueue((prev) => {
      prev
        .filter((j) => j.status === 'COMPLETED' || j.status === 'FAILED')
        .forEach((j) => stopPolling(j.id));
      return prev.filter((j) => j.status !== 'COMPLETED' && j.status !== 'FAILED');
    });
  }, [stopPolling]);

  const downloadOutput = useCallback(
    (jobId: string) => {
      const job = queue.find((j) => j.id === jobId);
      // Only real server-issued output URLs are downloadable; nothing is invented.
      if (job?.outputUrl) {
        window.open(job.outputUrl, '_blank', 'noopener');
      }
    },
    [queue],
  );

  const batchExport = useCallback(
    (projects: { id: string; name: string }[]) => {
      projects.forEach((project, index) => {
        setTimeout(() => startExport(project.id, project.name), index * 500);
      });
    },
    [startExport],
  );

  return {
    queue,
    activeJob,
    isExporting,
    settings,
    presets,
    estimatedSize,
    estimatedTime,
    updateSettings,
    applyPreset,
    savePreset,
    startExport,
    cancelExport,
    retryExport,
    removeFromQueue,
    clearCompleted,
    downloadOutput,
    batchExport,
  };
}

export default useExport;
