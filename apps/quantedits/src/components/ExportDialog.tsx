// ============================================================================
// QuantEdits - Export Dialog Component
// Export settings, format selection, quality, and progress
// ============================================================================

import { useState } from 'react';
import type { ExportConfig, ExportJob, ExportFormat, ExportQuality } from '../types';

interface ExportDialogProps {
  isOpen: boolean;
  job: ExportJob | null;
  projectWidth: number;
  projectHeight: number;
  onExport: (config: ExportConfig) => void;
  onCancel: () => void;
  onClose: () => void;
}

const FORMATS: { value: ExportFormat; label: string; type: string }[] = [
  { value: 'mp4', label: 'MP4 (H.264)', type: 'video' },
  { value: 'mov', label: 'MOV (ProRes)', type: 'video' },
  { value: 'webm', label: 'WebM (VP9)', type: 'video' },
  { value: 'gif', label: 'GIF', type: 'video' },
  { value: 'png', label: 'PNG', type: 'image' },
  { value: 'jpg', label: 'JPEG', type: 'image' },
  { value: 'webp', label: 'WebP', type: 'image' },
  { value: 'pdf', label: 'PDF', type: 'document' },
];

const QUALITIES: { value: ExportQuality; label: string }[] = [
  { value: 'draft', label: 'Draft (Fast)' },
  { value: 'standard', label: 'Standard (720p)' },
  { value: 'high', label: 'High (1080p)' },
  { value: 'ultra', label: 'Ultra (1440p)' },
  { value: '4k', label: '4K (2160p)' },
  { value: '8k', label: '8K (4320p)' },
];

export function ExportDialog({
  isOpen,
  job,
  projectWidth,
  projectHeight,
  onExport,
  onCancel,
  onClose,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [quality, setQuality] = useState<ExportQuality>('high');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Export dialog"
    >
      <div className="w-full max-w-md bg-gray-900 text-white rounded-lg shadow-xl p-6">
        <h2 className="text-lg font-bold mb-4">Export</h2>

        {job ? (
          <div className="space-y-4">
            {/* Progress bar */}
            <div
              className="w-full h-3 bg-gray-700 rounded overflow-hidden"
              role="progressbar"
              aria-valuenow={job.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Export progress"
            >
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-300 capitalize">
              {job.status} - {job.progress}%
            </p>

            {job.status === 'completed' && job.outputUrl && (
              <a
                href={job.outputUrl}
                className="inline-block px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium min-h-[44px] leading-[44px] text-center"
                aria-label="Download exported file"
              >
                Download
              </a>
            )}

            <div className="flex gap-2 pt-2">
              {job.status !== 'completed' && job.status !== 'failed' && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-sm font-medium min-h-[44px]"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Format */}
            <div className="flex flex-col gap-1">
              <label htmlFor="export-format" className="text-sm font-medium text-gray-300">
                Format
              </label>
              <select
                id="export-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white text-sm min-h-[44px]"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Quality */}
            <div className="flex flex-col gap-1">
              <label htmlFor="export-quality" className="text-sm font-medium text-gray-300">
                Quality
              </label>
              <select
                id="export-quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value as ExportQuality)}
                className="px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white text-sm min-h-[44px]"
              >
                {QUALITIES.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Resolution */}
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-300">Resolution</span>
              <span className="text-sm text-gray-400">
                {projectWidth} x {projectHeight}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  onExport({ format, quality, width: projectWidth, height: projectHeight })
                }
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium min-h-[44px]"
              >
                Export
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExportDialog;
