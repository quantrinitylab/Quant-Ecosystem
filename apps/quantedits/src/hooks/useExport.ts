// ============================================================================
// QuantEdits - useExport Hook
// Export state: render queue, format/quality/resolution, progress, batch export
// ============================================================================

import { useState, useCallback, useMemo, useRef } from 'react';

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

interface ExportJob {
  id: string;
  projectId: string;
  projectName: string;
  settings: ExportSettings;
  status: 'queued' | 'preparing' | 'rendering' | 'encoding' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  currentFrame: number;
  totalFrames: number;
  startedAt: number;
  completedAt: number | null;
  estimatedTimeRemaining: number;
  outputUrl: string | null;
  outputSize: number;
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
  { id: 'qneon-reel', name: 'QuantNeon Reel', platform: 'QuantNeon', settings: { format: 'mp4', resolution: { width: 1080, height: 1920, label: '1080x1920' }, quality: 85, fps: 30 } },
  { id: 'qtube-video', name: 'QuantTube Video', platform: 'QuantTube', settings: { format: 'mp4', resolution: { width: 1920, height: 1080, label: '1920x1080' }, quality: 90, fps: 30 } },
  { id: 'qtube-short', name: 'QuantTube Short', platform: 'QuantTube', settings: { format: 'mp4', resolution: { width: 1080, height: 1920, label: '1080x1920' }, quality: 85, fps: 30 } },
  { id: 'qmax-video', name: 'QuantMax Video', platform: 'QuantMax', settings: { format: 'mp4', resolution: { width: 1080, height: 1920, label: '1080x1920' }, quality: 85, fps: 30 } },
  { id: 'web-gif', name: 'Web GIF', platform: 'Web', settings: { format: 'gif', resolution: { width: 480, height: 480, label: '480x480' }, quality: 70, fps: 15, includeAudio: false } },
  { id: 'print-pdf', name: 'Print Quality', platform: 'Print', settings: { format: 'pdf', resolution: { width: 3508, height: 2480, label: 'A4 300dpi' }, quality: 100 } },
];

export function useExport(): UseExportReturn {
  const [queue, setQueue] = useState<ExportJob[]>([]);
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);
  const [presets, setPresets] = useState<ExportPreset[]>(DEFAULT_PRESETS);
  const intervalRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const activeJob = useMemo(() => queue.find(j => j.status === 'rendering' || j.status === 'encoding' || j.status === 'preparing') || null, [queue]);
  const isExporting = useMemo(() => queue.some(j => ['queued', 'preparing', 'rendering', 'encoding'].includes(j.status)), [queue]);

  const estimatedSize = useMemo(() => {
    const pixels = settings.resolution.width * settings.resolution.height;
    const baseBitrate = (pixels / (1920 * 1080)) * (settings.quality / 100);
    const duration = settings.exportRange === 'full' ? 60 : settings.endTime - settings.startTime;
    if (settings.format === 'mp4' || settings.format === 'mov') return baseBitrate * duration * 8 * 1024 * 1024;
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
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) setSettings(prev => ({ ...prev, ...preset.settings }));
  }, [presets]);

  const savePreset = useCallback((name: string, platform: string) => {
    const newPreset: ExportPreset = { id: `preset-${Date.now()}`, name, platform, settings: { ...settings } };
    setPresets(prev => [...prev, newPreset]);
  }, [settings]);

  const simulateExport = useCallback((jobId: string) => {
    let progress = 0;
    const totalFrames = settings.fps * (settings.exportRange === 'full' ? 60 : settings.endTime - settings.startTime);
    setQueue(prev => prev.map(j => j.id === jobId ? { ...j, status: 'preparing' as const, totalFrames } : j));

    setTimeout(() => {
      setQueue(prev => prev.map(j => j.id === jobId ? { ...j, status: 'rendering' as const } : j));
      const interval = setInterval(() => {
        progress += Math.random() * 8 + 2;
        const currentFrame = Math.floor((progress / 100) * totalFrames);
        if (progress >= 85) {
          setQueue(prev => prev.map(j => j.id === jobId ? { ...j, status: 'encoding' as const, progress: Math.min(99, progress), currentFrame } : j));
        } else {
          setQueue(prev => prev.map(j => j.id === jobId ? { ...j, progress: Math.min(99, progress), currentFrame, estimatedTimeRemaining: Math.ceil((100 - progress) * 0.3) } : j));
        }
        if (progress >= 100) {
          clearInterval(interval);
          intervalRefs.current.delete(jobId);
          setQueue(prev => prev.map(j => j.id === jobId ? { ...j, status: 'complete' as const, progress: 100, completedAt: Date.now(), outputUrl: `/exports/${jobId}.${settings.format}`, outputSize: estimatedSize, currentFrame: totalFrames, estimatedTimeRemaining: 0 } : j));
        }
      }, 500);
      intervalRefs.current.set(jobId, interval);
    }, 1000);
  }, [settings, estimatedSize]);

  const startExport = useCallback((projectId: string, projectName: string) => {
    const job: ExportJob = {
      id: `export-${Date.now()}`, projectId, projectName, settings: { ...settings }, status: 'queued', progress: 0, currentFrame: 0, totalFrames: 0, startedAt: Date.now(), completedAt: null, estimatedTimeRemaining: estimatedTime, outputUrl: null, outputSize: 0, error: null,
    };
    setQueue(prev => [...prev, job]);
    simulateExport(job.id);
  }, [settings, estimatedTime, simulateExport]);

  const cancelExport = useCallback((jobId: string) => {
    const interval = intervalRefs.current.get(jobId);
    if (interval) { clearInterval(interval); intervalRefs.current.delete(jobId); }
    setQueue(prev => prev.map(j => j.id === jobId ? { ...j, status: 'cancelled' as const } : j));
  }, []);

  const retryExport = useCallback((jobId: string) => {
    const job = queue.find(j => j.id === jobId);
    if (job) {
      setQueue(prev => prev.map(j => j.id === jobId ? { ...j, status: 'queued', progress: 0, error: null } : j));
      simulateExport(jobId);
    }
  }, [queue, simulateExport]);

  const removeFromQueue = useCallback((jobId: string) => {
    const interval = intervalRefs.current.get(jobId);
    if (interval) { clearInterval(interval); intervalRefs.current.delete(jobId); }
    setQueue(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(j => j.status !== 'complete' && j.status !== 'cancelled'));
  }, []);

  const downloadOutput = useCallback((jobId: string) => {
    const job = queue.find(j => j.id === jobId);
    if (job?.outputUrl) console.log(`Downloading: ${job.outputUrl}`);
  }, [queue]);

  const batchExport = useCallback((projects: { id: string; name: string }[]) => {
    projects.forEach((project, index) => {
      setTimeout(() => startExport(project.id, project.name), index * 500);
    });
  }, [startExport]);

  return {
    queue, activeJob, isExporting, settings, presets, estimatedSize, estimatedTime,
    updateSettings, applyPreset, savePreset, startExport, cancelExport, retryExport,
    removeFromQueue, clearCompleted, downloadOutput, batchExport,
  };
}

export default useExport;
