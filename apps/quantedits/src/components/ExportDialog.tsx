// ============================================================================
// QuantEdits - Export Dialog Component
// Export settings, format selection, quality, and progress
// ============================================================================

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

export function ExportDialog({ isOpen, job, projectWidth, projectHeight, onExport, onCancel, onClose }: ExportDialogProps) {
  if (!isOpen) return null;

  return {
    type: 'div',
    className: 'export-dialog-overlay',
    children: [{
      type: 'div',
      className: 'export-dialog',
      children: [
        { type: 'h2', text: 'Export' },
        job ? {
          type: 'div', className: 'export-progress', children: [
            { type: 'div', className: 'progress-bar', children: [
              { type: 'div', className: 'progress-fill', style: { width: `${job.progress}%` } },
            ]},
            { type: 'p', text: `${job.status} - ${job.progress}%` },
            job.status === 'completed' ? { type: 'a', href: job.outputUrl, text: 'Download' } : null,
            job.status !== 'completed' && job.status !== 'failed' ? { type: 'button', text: 'Cancel', onClick: onCancel } : null,
            { type: 'button', text: 'Close', onClick: onClose },
          ],
        } : {
          type: 'div', className: 'export-settings', children: [
            { type: 'div', className: 'setting-group', children: [
              { type: 'label', text: 'Format' },
              { type: 'select', children: FORMATS.map(f => ({ type: 'option', value: f.value, text: f.label })) },
            ]},
            { type: 'div', className: 'setting-group', children: [
              { type: 'label', text: 'Quality' },
              { type: 'select', children: QUALITIES.map(q => ({ type: 'option', value: q.value, text: q.label })) },
            ]},
            { type: 'div', className: 'setting-group', children: [
              { type: 'label', text: 'Resolution' },
              { type: 'span', text: `${projectWidth} x ${projectHeight}` },
            ]},
            { type: 'div', className: 'dialog-actions', children: [
              { type: 'button', text: 'Cancel', onClick: onClose, className: 'btn-secondary' },
              { type: 'button', text: 'Export', onClick: () => onExport({ format: 'mp4', quality: 'high', width: projectWidth, height: projectHeight }), className: 'btn-primary' },
            ]},
          ],
        },
      ],
    }],
  };
}

export default ExportDialog;
