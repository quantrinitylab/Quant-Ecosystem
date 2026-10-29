// ============================================================================
// QuantCooks Studio — Promo format picker modal (spec §4.3, checklist #32)
//
// A grid of format cards with filter chips. The modal is a picker, never
// a separate workflow: selecting a card hands the format to the parent,
// which writes it back into the composer chip AND the composer settings
// (ratio + duration + priced tier) — the modal and the composer can never
// disagree, because both render the one format state the parent holds.
// ============================================================================

import React, { useState } from 'react';
import {
  PROMO_FORMAT_FILTERS,
  promoFormatsForFilter,
  type PromoFormat,
  type PromoFormatCategory,
} from '../../lib/studio/promo';

export interface PromoFormatModalProps {
  open: boolean;
  selectedId?: string | null;
  onSelect: (format: PromoFormat) => void;
  onClose: () => void;
}

export const PromoFormatModal: React.FC<PromoFormatModalProps> = ({ open, selectedId, onSelect, onClose }) => {
  const [filter, setFilter] = useState<'All' | PromoFormatCategory>('All');

  if (!open) return null;
  const formats = promoFormatsForFilter(filter);

  return (
    <div className="studio-promo-format-modal" data-testid="promo-format-modal" role="dialog" aria-label="Choose an ad format">
      <div className="studio-promo-format-head">
        <h2>Choose a format</h2>
        <p>
          Picking a format writes it straight into your brief — the ratio, duration and price on Generate
          follow the card you choose.
        </p>
        <button type="button" data-testid="promo-format-close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="studio-promo-format-filters" aria-label="Filter formats">
        {PROMO_FORMAT_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            data-testid={`promo-format-filter-${f}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="studio-promo-format-grid">
        {formats.map((format) => (
          <button
            key={format.id}
            type="button"
            className="studio-promo-format-card"
            data-testid={`promo-format-card-${format.id}`}
            aria-pressed={selectedId === format.id}
            onClick={() => onSelect(format)}
          >
            <strong>{format.name}</strong>
            <span>{format.description}</span>
            <span>
              {format.ratio} · {format.durationSeconds}s · {format.platform}
            </span>
            {selectedId === format.id && <span className="studio-promo-format-selected">In your brief</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PromoFormatModal;
