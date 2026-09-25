import React, { useState, useEffect } from 'react';
import { vfsService } from '../services/vfs-bridge';
import type { VfsTelemetry } from '../types';

export function VfsSyncBadge(): React.ReactElement {
  const [telemetry, setTelemetry] = useState<VfsTelemetry>(() => vfsService.getTelemetry());
  const [isOpen, setIsOpen] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);

  useEffect(() => {
    return vfsService.subscribe((updated) => {
      setTelemetry(updated);
    });
  }, []);

  const handleReindex = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReindexing(true);
    await vfsService.triggerFastCdcReindex();
    setIsReindexing(false);
  };

  const handleFlush = (e: React.MouseEvent) => {
    e.stopPropagation();
    vfsService.flushL1Cache();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const statusClass =
    telemetry.status === 'SYNCHRONIZED'
      ? 'status-synced'
      : telemetry.status === 'SYNCING'
        ? 'status-syncing'
        : telemetry.status === 'ERROR'
          ? 'status-error'
          : 'status-offline';

  return (
    <div className="vfs-badge-wrapper">
      <button
        className={`vfs-badge ${statusClass}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Local FastCDC 64KB CAS Virtual Drive Telemetry"
        aria-label="VFS status badge"
      >
        <span className="vfs-pulse-dot" />
        <span className="vfs-status-label">{telemetry.statusText}</span>
      </button>

      {isOpen && (
        <div className="vfs-telemetry-popover">
          <div className="popover-header">
            <span className="popover-title">
              <span>⚡</span> FastCDC 64KB CAS Virtual Drive
            </span>
            <span className="stat-label">MOUNT: {telemetry.mountPoint}</span>
          </div>

          <div className="popover-grid">
            <div className="popover-stat-box">
              <div className="stat-label">Virtual Address Space</div>
              <div className="stat-value">{formatBytes(telemetry.virtualSizeBytes)}</div>
            </div>

            <div className="popover-stat-box">
              <div className="stat-label">Physical Disk Footprint</div>
              <div className="stat-value highlight-cyan">
                {formatBytes(telemetry.physicalDiskSizeBytes)}
              </div>
            </div>

            <div className="popover-stat-box">
              <div className="stat-label">Dedup Multiplier</div>
              <div className="stat-value highlight-green">{telemetry.dedupRatio}x Saved</div>
            </div>

            <div className="popover-stat-box">
              <div className="stat-label">CAS Gear Slicing</div>
              <div className="stat-value">64KB FastCDC</div>
            </div>
          </div>

          <div className="popover-footer-actions">
            <button className="popover-btn" onClick={handleReindex} disabled={isReindexing}>
              {isReindexing ? 'Reindexing CAS...' : 'Force Reindex'}
            </button>
            <button className="popover-btn" onClick={handleFlush}>
              Flush L1 Cache
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
