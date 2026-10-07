'use client';

// The lens catalog and config type live in a pure (non-JSX) module so they can
// be imported by `LensRenderer.ts` and by tests without a JSX transform. They
// are re-exported here to preserve the existing public import path.
export { AR_LENSES } from './lenses';
export type { ARLensConfig } from './lenses';
import type { ARLensConfig } from './lenses';
import { AR_LENSES } from './lenses';

interface ARLensCarouselProps {
  activeLens: ARLensConfig | null;
  onLensSelect: (lens: ARLensConfig | null) => void;
}

/**
 * ARLensCarousel — horizontally scrollable lens picker with 7 lens options.
 * Uses Tailwind overflow-x-auto with scroll-snap for smooth scrolling.
 * Tapping a lens selects it; tapping again deselects.
 */
export function ARLensCarousel({ activeLens, onLensSelect }: ARLensCarouselProps) {
  return (
    <div className="w-full px-2">
      <div
        className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory py-2 px-2 no-scrollbar"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {AR_LENSES.map((lens) => {
          const isActive = activeLens?.id === lens.id;
          return (
            <button
              key={lens.id}
              onClick={() => onLensSelect(isActive ? null : lens)}
              className={`
                flex-shrink-0 snap-center flex flex-col items-center gap-1
                transition-all duration-200
              `}
              aria-label={`Select ${lens.name} lens`}
              aria-pressed={isActive}
            >
              {/* Thumbnail circle */}
              <div
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center text-2xl
                  border-2 transition-all duration-200
                  ${
                    isActive
                      ? 'border-white scale-110 shadow-lg shadow-white/30'
                      : 'border-white/30 hover:border-white/60'
                  }
                `}
                style={{
                  backgroundColor: isActive ? lens.color : `${lens.color}44`,
                }}
              >
                {lens.emoji}
              </div>
              {/* Lens name */}
              <span
                className={`
                  text-[10px] font-medium text-center w-16 truncate
                  ${isActive ? 'text-white' : 'text-white/60'}
                `}
              >
                {lens.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
