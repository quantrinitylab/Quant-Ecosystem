// ============================================================================
// QuantEdits - Export Page
// Format selector, quality, resolution, platform presets, export queue
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface ExportJob {
  id: string;
  projectId: string;
  projectName: string;
  format: ExportFormat;
  quality: number;
  resolution: Resolution;
  status: 'queued' | 'rendering' | 'encoding' | 'complete' | 'failed';
  progress: number;
  startedAt: string;
  estimatedSize: number;
  outputUrl: string | null;
  error: string | null;
}

interface Resolution {
  width: number;
  height: number;
  label: string;
}

type ExportFormat = 'mp4' | 'mov' | 'gif' | 'png' | 'jpg' | 'pdf' | 'svg';

interface PlatformPreset {
  id: string;
  name: string;
  platform: string;
  format: ExportFormat;
  resolution: Resolution;
  quality: number;
  maxDuration: number;
  maxSize: number;
}

interface ExportPageProps {
  projectId: string;
  projectName: string;
  duration: number;
}

const RESOLUTIONS: Resolution[] = [
  { width: 1280, height: 720, label: '720p HD' },
  { width: 1920, height: 1080, label: '1080p Full HD' },
  { width: 2560, height: 1440, label: '1440p 2K' },
  { width: 3840, height: 2160, label: '2160p 4K' },
];

const PLATFORM_PRESETS: PlatformPreset[] = [
  { id: 'qneon-reel', name: 'QuantNeon Reels', platform: 'QuantNeon', format: 'mp4', resolution: { width: 1080, height: 1920, label: '1080x1920' }, quality: 85, maxDuration: 90, maxSize: 100 * 1024 * 1024 },
  { id: 'qtube-video', name: 'QuantTube Video', platform: 'QuantTube', format: 'mp4', resolution: { width: 1920, height: 1080, label: '1920x1080' }, quality: 90, maxDuration: 3600, maxSize: 2048 * 1024 * 1024 },
  { id: 'qtube-short', name: 'QuantTube Shorts', platform: 'QuantTube', format: 'mp4', resolution: { width: 1080, height: 1920, label: '1080x1920' }, quality: 85, maxDuration: 60, maxSize: 50 * 1024 * 1024 },
  { id: 'qneon-story', name: 'QuantNeon Stories', platform: 'QuantNeon', format: 'mp4', resolution: { width: 1080, height: 1920, label: '1080x1920' }, quality: 80, maxDuration: 15, maxSize: 30 * 1024 * 1024 },
  { id: 'qmax-video', name: 'QuantMax Video', platform: 'QuantMax', format: 'mp4', resolution: { width: 1080, height: 1920, label: '1080x1920' }, quality: 85, maxDuration: 180, maxSize: 150 * 1024 * 1024 },
];

const FORMAT_INFO: Record<ExportFormat, { label: string; icon: string; videoOnly: boolean }> = {
  mp4: { label: 'MP4 (H.264)', icon: '🎬', videoOnly: true },
  mov: { label: 'MOV (ProRes)', icon: '🎥', videoOnly: true },
  gif: { label: 'GIF (Animated)', icon: '🌀', videoOnly: true },
  png: { label: 'PNG (Lossless)', icon: '🖼', videoOnly: false },
  jpg: { label: 'JPG (Compressed)', icon: '📸', videoOnly: false },
  pdf: { label: 'PDF (Document)', icon: '📄', videoOnly: false },
  svg: { label: 'SVG (Vector)', icon: '✏️', videoOnly: false },
};

const ExportPage: React.FC<ExportPageProps> = ({ projectId, projectName, duration }) => {
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [quality, setQuality] = useState(85);
  const [resolution, setResolution] = useState<Resolution>(RESOLUTIONS[1]);
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [useCustomRes, setUseCustomRes] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [exportQueue, setExportQueue] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(30);
  const [audioBitrate, setAudioBitrate] = useState(192);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(duration);
  const [exportRange, setExportRange] = useState<'full' | 'range'>('full');

  const estimatedSize = useMemo(() => {
    const res = useCustomRes ? { width: customWidth, height: customHeight } : resolution;
    const pixels = res.width * res.height;
    const bitrate = (pixels / (1920 * 1080)) * quality * 0.1;
    const exportDuration = exportRange === 'full' ? duration : endTime - startTime;
    if (format === 'mp4' || format === 'mov') return bitrate * exportDuration * 1024 * 1024 / 8;
    if (format === 'gif') return bitrate * exportDuration * 512 * 1024 / 8;
    return pixels * (quality / 100) * (format === 'png' ? 4 : 1);
  }, [format, quality, resolution, customWidth, customHeight, useCustomRes, duration, exportRange, startTime, endTime]);

  const handleApplyPreset = useCallback((presetId: string) => {
    const preset = PLATFORM_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setFormat(preset.format);
      setQuality(preset.quality);
      setResolution(preset.resolution);
      setUseCustomRes(false);
      setSelectedPreset(presetId);
    }
  }, []);

  const handleStartExport = useCallback(() => {
    const job: ExportJob = {
      id: `export-${Date.now()}`,
      projectId,
      projectName,
      format,
      quality,
      resolution: useCustomRes ? { width: customWidth, height: customHeight, label: `${customWidth}x${customHeight}` } : resolution,
      status: 'queued',
      progress: 0,
      startedAt: new Date().toISOString(),
      estimatedSize,
      outputUrl: null,
      error: null,
    };
    setExportQueue(prev => [...prev, job]);

    setTimeout(() => {
      setExportQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'rendering' } : j));
    }, 500);

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        clearInterval(interval);
        setExportQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'complete', progress: 100, outputUrl: `/exports/${job.id}.${format}` } : j));
      } else {
        const status = progress > 70 ? 'encoding' : 'rendering';
        setExportQueue(prev => prev.map(j => j.id === job.id ? { ...j, progress: Math.min(99, progress), status } : j));
      }
    }, 800);
  }, [projectId, projectName, format, quality, resolution, useCustomRes, customWidth, customHeight, estimatedSize]);

  const handleCancelExport = useCallback((jobId: string) => {
    setExportQueue(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const handleDownload = useCallback((job: ExportJob) => {
    if (job.outputUrl) console.log(`Downloading: ${job.outputUrl}`);
  }, []);

  const formatSize = useCallback((bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }, []);

  return (
    <div className="export-page">
      <header className="export-header">
        <h1>Export Project</h1>
        <p className="project-info">{projectName} - {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}</p>
      </header>

      <div className="export-content">
        <div className="export-settings">
          <section className="settings-section">
            <h3>Platform Presets</h3>
            <div className="presets-grid">
              {PLATFORM_PRESETS.map(preset => (
                <button key={preset.id} className={`preset-card ${selectedPreset === preset.id ? 'active' : ''}`} onClick={() => handleApplyPreset(preset.id)}>
                  <span className="preset-platform">{preset.platform}</span>
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-specs">{preset.resolution.label} - {preset.format.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>Format</h3>
            <div className="format-grid">
              {(Object.entries(FORMAT_INFO) as [ExportFormat, typeof FORMAT_INFO[ExportFormat]][]).map(([fmt, info]) => (
                <button key={fmt} className={`format-option ${format === fmt ? 'active' : ''}`} onClick={() => { setFormat(fmt); setSelectedPreset(null); }}>
                  <span className="format-icon">{info.icon}</span>
                  <span className="format-label">{info.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>Quality</h3>
            <div className="quality-control">
              <input type="range" min={10} max={100} value={quality} onChange={(e) => { setQuality(parseInt(e.target.value)); setSelectedPreset(null); }} className="quality-slider" />
              <div className="quality-labels">
                <span>Low</span>
                <span className="quality-value">{quality}%</span>
                <span>Max</span>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>Resolution</h3>
            <div className="resolution-options">
              {RESOLUTIONS.map(res => (
                <button key={res.label} className={`res-option ${!useCustomRes && resolution.label === res.label ? 'active' : ''}`} onClick={() => { setResolution(res); setUseCustomRes(false); setSelectedPreset(null); }}>
                  {res.label}
                </button>
              ))}
              <button className={`res-option ${useCustomRes ? 'active' : ''}`} onClick={() => setUseCustomRes(true)}>Custom</button>
            </div>
            {useCustomRes && (
              <div className="custom-resolution">
                <input type="number" value={customWidth} onChange={(e) => setCustomWidth(parseInt(e.target.value))} placeholder="Width" />
                <span>x</span>
                <input type="number" value={customHeight} onChange={(e) => setCustomHeight(parseInt(e.target.value))} placeholder="Height" />
              </div>
            )}
          </section>

          {(format === 'mp4' || format === 'mov' || format === 'gif') && (
            <section className="settings-section">
              <h3>Video Settings</h3>
              <div className="setting-row">
                <label>Frame Rate</label>
                <select value={fps} onChange={(e) => setFps(parseInt(e.target.value))}>
                  <option value={24}>24 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </div>
              <div className="setting-row">
                <label>Include Audio</label>
                <input type="checkbox" checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} />
              </div>
              {includeAudio && (
                <div className="setting-row">
                  <label>Audio Bitrate</label>
                  <select value={audioBitrate} onChange={(e) => setAudioBitrate(parseInt(e.target.value))}>
                    <option value={128}>128 kbps</option>
                    <option value={192}>192 kbps</option>
                    <option value={320}>320 kbps</option>
                  </select>
                </div>
              )}
              <div className="setting-row">
                <label>Export Range</label>
                <select value={exportRange} onChange={(e) => setExportRange(e.target.value as 'full' | 'range')}>
                  <option value="full">Full Duration</option>
                  <option value="range">Custom Range</option>
                </select>
              </div>
              {exportRange === 'range' && (
                <div className="range-inputs">
                  <input type="number" value={startTime} onChange={(e) => setStartTime(parseFloat(e.target.value))} placeholder="Start (s)" min={0} max={duration} />
                  <span>to</span>
                  <input type="number" value={endTime} onChange={(e) => setEndTime(parseFloat(e.target.value))} placeholder="End (s)" min={0} max={duration} />
                </div>
              )}
            </section>
          )}

          <section className="settings-section">
            <h3>Watermark</h3>
            <label className="watermark-toggle">
              <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
              Add Watermark
            </label>
            {watermark && (
              <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="Watermark text..." className="watermark-input" />
            )}
          </section>

          <div className="export-summary">
            <div className="summary-item"><span>Estimated Size:</span><strong>{formatSize(estimatedSize)}</strong></div>
            <div className="summary-item"><span>Format:</span><strong>{format.toUpperCase()}</strong></div>
            <div className="summary-item"><span>Resolution:</span><strong>{useCustomRes ? `${customWidth}x${customHeight}` : resolution.label}</strong></div>
          </div>

          <button className="export-btn" onClick={handleStartExport} disabled={loading}>
            Export Now
          </button>
        </div>

        <div className="export-queue">
          <h3>Export Queue ({exportQueue.length})</h3>
          {exportQueue.length === 0 ? (
            <div className="queue-empty">
              <p>No exports in queue</p>
            </div>
          ) : (
            <div className="queue-list">
              {exportQueue.map(job => (
                <div key={job.id} className={`queue-item status-${job.status}`}>
                  <div className="queue-item-header">
                    <span className="job-name">{job.projectName}.{job.format}</span>
                    <span className={`job-status ${job.status}`}>{job.status}</span>
                  </div>
                  {(job.status === 'rendering' || job.status === 'encoding') && (
                    <div className="job-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                      </div>
                      <span className="progress-text">{Math.round(job.progress)}%</span>
                    </div>
                  )}
                  <div className="queue-item-meta">
                    <span>{job.resolution.label}</span>
                    <span>{formatSize(job.estimatedSize)}</span>
                  </div>
                  <div className="queue-item-actions">
                    {job.status === 'complete' && (
                      <button className="download-btn" onClick={() => handleDownload(job)}>Download</button>
                    )}
                    {(job.status === 'queued' || job.status === 'rendering' || job.status === 'encoding') && (
                      <button className="cancel-btn" onClick={() => handleCancelExport(job.id)}>Cancel</button>
                    )}
                    {job.status === 'failed' && (
                      <span className="error-msg">{job.error || 'Export failed'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportPage;
