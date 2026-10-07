// ============================================================================
// QuantChat - Read Receipts Component
// Status indicator with checkmarks and tooltip for read-by information
// ============================================================================

import React, { useState } from 'react';
import type { DeliveryStatus } from '../services/read-receipts.service';

export interface ReadByInfo {
  name: string;
  timestamp: number;
}

export interface ReadReceiptsProps {
  status: DeliveryStatus;
  readBy?: ReadByInfo[];
  showTooltip?: boolean;
}

export const ReadReceipts: React.FC<ReadReceiptsProps> = ({
  status,
  readBy,
  showTooltip = false,
}) => {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const getStatusIcon = (): string => {
    switch (status) {
      case 'sending':
        return '\u23F3'; // hourglass
      case 'sent':
        return '\u2713'; // single check
      case 'delivered':
        return '\u2713\u2713'; // double check
      case 'read':
        return '\u2713\u2713'; // double check (blue styled)
      case 'failed':
        return '\u26A0'; // warning
      default:
        return '';
    }
  };

  const getStatusLabel = (): string => {
    switch (status) {
      case 'sending':
        return 'Sending';
      case 'sent':
        return 'Sent';
      case 'delivered':
        return 'Delivered';
      case 'read':
        return 'Read';
      case 'failed':
        return 'Failed to send';
      default:
        return '';
    }
  };

  const formatTimestamp = (ts: number): string => {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleMouseEnter = () => {
    if (showTooltip && readBy && readBy.length > 0) {
      setTooltipVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setTooltipVisible(false);
  };

  return (
    <span
      className={`read-receipts read-receipts--${status}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={getStatusLabel()}
      role="status"
    >
      <span className="read-receipts__icon">{getStatusIcon()}</span>

      {tooltipVisible && readBy && readBy.length > 0 && (
        <div className="read-receipts__tooltip" role="tooltip">
          <div className="read-receipts__tooltip-header">Read by</div>
          <ul className="read-receipts__tooltip-list">
            {readBy.map((reader) => (
              <li key={reader.name} className="read-receipts__tooltip-item">
                <span className="read-receipts__reader-name">{reader.name}</span>
                <span className="read-receipts__reader-time">
                  {formatTimestamp(reader.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
};

export default ReadReceipts;
