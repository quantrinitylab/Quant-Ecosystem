// ============================================================================
// QuantMax - Safety Overlay Component
// Safety/report overlay with quick actions
// ============================================================================

import type { ReportReason } from '../types';

interface SafetyOverlayProps {
  isVisible: boolean;
  targetUserId: string;
  onReport: (reason: ReportReason, description: string) => void;
  onBlock: () => void;
  onClose: () => void;
  onEmergency: () => void;
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam or Scam' },
  { value: 'inappropriate', label: 'Inappropriate Content' },
  { value: 'harassment', label: 'Harassment or Bullying' },
  { value: 'catfish', label: 'Fake Profile / Catfish' },
  { value: 'underage', label: 'Appears Underage' },
  { value: 'violence', label: 'Violence or Threats' },
  { value: 'other', label: 'Other' },
];

export function SafetyOverlay({ isVisible, targetUserId, onReport, onBlock, onClose, onEmergency }: SafetyOverlayProps) {
  if (!isVisible) return null;

  return {
    type: 'div',
    className: 'safety-overlay',
    children: [{
      type: 'div',
      className: 'safety-panel',
      children: [
        { type: 'h2', text: 'Safety Center' },
        { type: 'p', text: 'Your safety is our priority. What would you like to do?' },
        { type: 'div', className: 'quick-actions', children: [
          { type: 'button', text: 'Block User', onClick: onBlock, className: 'btn-block' },
          { type: 'button', text: 'Emergency', onClick: onEmergency, className: 'btn-emergency' },
        ]},
        { type: 'h3', text: 'Report' },
        { type: 'div', className: 'report-reasons', children: REPORT_REASONS.map(reason => ({
          type: 'button',
          className: 'report-reason-btn',
          text: reason.label,
          onClick: () => onReport(reason.value, reason.label),
        }))},
        { type: 'button', text: 'Cancel', onClick: onClose, className: 'btn-cancel' },
      ],
    }],
  };
}

export default SafetyOverlay;
