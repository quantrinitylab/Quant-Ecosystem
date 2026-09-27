import React from 'react';
import type { BentoItem } from '../../types';

export interface BentoFeatureGridProps {
  items: BentoItem[];
  className?: string;
}

export const BentoFeatureGrid: React.FC<BentoFeatureGridProps> = ({ items, className = '' }) => {
  const getSpanClass = (span: BentoItem['span'] = '1x1') => {
    switch (span) {
      case '2x1':
        return 'bento-span-2x1';
      case '1x2':
        return 'bento-span-1x2';
      case '2x2':
        return 'bento-span-2x2';
      case '1x1':
      default:
        return 'bento-span-1x1';
    }
  };

  return (
    <div className={`bento-feature-grid ${className}`} data-testid="bento-feature-grid">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={item.onClick}
          className={`bento-grid-item ${getSpanClass(item.span)} ${
            item.onClick ? 'bento-item-clickable' : ''
          } ${item.className || ''}`}
          data-testid={`bento-item-${item.id}`}
        >
          {/* Subtle gradient backdrop glow */}
          <div className="bento-item-glow" />

          <div className="bento-item-header">
            {item.icon && <div className="bento-item-icon-box">{item.icon}</div>}
            {item.badge && <span className="bento-item-badge">{item.badge}</span>}
          </div>

          <div className="bento-item-content">
            <h3 className="bento-item-title">{item.title}</h3>
            <p className="bento-item-desc">{item.description}</p>
          </div>

          {item.preview && <div className="bento-item-preview">{item.preview}</div>}
        </div>
      ))}
    </div>
  );
};
