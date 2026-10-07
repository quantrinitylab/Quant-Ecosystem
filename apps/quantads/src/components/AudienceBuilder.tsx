// ============================================================================
// QuantAds - AudienceBuilder Component
// Visual audience targeting builder with spring animations
// ============================================================================

'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import type { TargetingConfig } from '../types';

interface AudienceBuilderProps {
  targeting?: TargetingConfig;
  onChange?: (targeting: TargetingConfig) => void;
  estimatedReach?: number;
  isLoading?: boolean;
  error?: string | null;
}

export function AudienceBuilder({
  targeting,
  onChange: _onChange,
  estimatedReach = 0,
  isLoading = false,
  error = null,
}: AudienceBuilderProps) {
  const defaultTargeting: TargetingConfig = targeting || {
    demographics: {
      ageMin: 18,
      ageMax: 65,
      genders: ['all'],
      languages: ['en'],
      educationLevels: [],
      incomeRanges: [],
    },
    interests: [],
    behaviors: [],
    locations: [],
    devices: {
      platforms: ['ios', 'android', 'web', 'desktop'],
      osVersions: [],
      deviceTypes: ['mobile', 'tablet', 'desktop'],
      connectionTypes: ['all'],
    },
    custom: [],
    exclusions: [],
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-app-color)]" />
        <span className="ml-3 text-[var(--quant-muted-foreground)]">Loading targeting...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-[var(--quant-destructive)] mb-2">{error}</p>
      </div>
    );
  }

  return (
    <motion.div
      className="flex flex-col gap-6 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6 shadow-sm"
      role="form"
      aria-label="Audience targeting builder"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      {/* Reach Estimate */}
      <div className="rounded-lg bg-[var(--brand-app-color)]/10 p-4">
        <h4 className="mb-1 text-sm font-semibold text-[var(--quant-card-foreground)]">
          Estimated Audience Size
        </h4>
        <span className="text-2xl font-bold text-[var(--brand-app-color)]" aria-live="polite">
          {formatReach(estimatedReach)}
        </span>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--quant-muted)]"
          role="progressbar"
          aria-label="Audience reach gauge"
          aria-valuenow={Math.min((estimatedReach / 10000000) * 100, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            className="h-full rounded-full bg-[var(--brand-app-color)]"
            animate={{ width: `${Math.min((estimatedReach / 10000000) * 100, 100)}%` }}
            transition={{ type: 'spring', ...spring.snappy }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-[var(--quant-muted-foreground)]">
          <span>Specific</span>
          <span>Broad</span>
        </div>
      </div>

      {/* Demographics */}
      <section aria-labelledby="demographics-heading">
        <h3
          id="demographics-heading"
          className="mb-3 text-sm font-semibold text-[var(--quant-card-foreground)]"
        >
          Demographics
        </h3>
        <div className="mb-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-[var(--quant-muted-foreground)]">
            Age Range
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={13}
              max={65}
              defaultValue={defaultTargeting.demographics.ageMin}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--quant-muted)] accent-[var(--brand-app-color)]"
              aria-label="Age range slider"
            />
            <span className="min-w-[80px] text-center text-xs font-medium text-[var(--quant-card-foreground)]">
              {defaultTargeting.demographics.ageMin} - {defaultTargeting.demographics.ageMax}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-[var(--quant-muted-foreground)]">Gender</label>
          <div className="flex gap-2">
            {(['all', 'male', 'female', 'other'] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={`min-h-[44px] rounded-lg border px-4 py-2 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
                  defaultTargeting.demographics.genders.includes(g)
                    ? 'border-[var(--brand-app-color)] bg-[var(--brand-app-color)]/10 text-[var(--brand-app-color)]'
                    : 'border-[var(--quant-border)] bg-[var(--quant-card)] text-[var(--quant-muted-foreground)] hover:border-[var(--brand-app-color)]/50'
                }`}
                aria-pressed={defaultTargeting.demographics.genders.includes(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Interests */}
      <section aria-labelledby="interests-heading">
        <h3
          id="interests-heading"
          className="mb-3 text-sm font-semibold text-[var(--quant-card-foreground)]"
        >
          Interests
        </h3>
        <input
          type="text"
          placeholder="Search interests..."
          className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-card)] px-3 py-2 text-sm text-[var(--quant-card-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-app-color)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-app-color)]"
          aria-label="Search interests"
        />
        {defaultTargeting.interests.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {defaultTargeting.interests.map((interest) => (
              <span
                key={interest}
                className="inline-flex items-center rounded-full bg-[var(--brand-app-color)]/10 px-3 py-1 text-xs font-medium text-[var(--brand-app-color)]"
              >
                {interest}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Locations */}
      <section aria-labelledby="locations-heading">
        <h3
          id="locations-heading"
          className="mb-3 text-sm font-semibold text-[var(--quant-card-foreground)]"
        >
          Locations
        </h3>
        <input
          type="text"
          placeholder="Search countries, cities..."
          className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-card)] px-3 py-2 text-sm text-[var(--quant-card-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-app-color)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-app-color)]"
          aria-label="Search locations"
        />
        {defaultTargeting.locations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {defaultTargeting.locations.map((loc) => (
              <span
                key={loc.value}
                className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              >
                {loc.value}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Devices & Platforms */}
      <section aria-labelledby="devices-heading">
        <h3
          id="devices-heading"
          className="mb-3 text-sm font-semibold text-[var(--quant-card-foreground)]"
        >
          Devices &amp; Platforms
        </h3>
        <div className="flex flex-wrap gap-2">
          {(['ios', 'android', 'web', 'desktop'] as const).map((platform) => (
            <button
              key={platform}
              type="button"
              className={`min-h-[44px] rounded-lg border px-4 py-2 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${
                defaultTargeting.devices.platforms.includes(platform)
                  ? 'border-[var(--brand-app-color)] bg-[var(--brand-app-color)]/10 text-[var(--brand-app-color)]'
                  : 'border-[var(--quant-border)] bg-[var(--quant-card)] text-[var(--quant-muted-foreground)] hover:border-[var(--brand-app-color)]/50'
              }`}
              aria-pressed={defaultTargeting.devices.platforms.includes(platform)}
            >
              {platform}
            </button>
          ))}
        </div>
      </section>
    </motion.div>
  );
}

function formatReach(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M people`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K people`;
  return `${n} people`;
}

export default AudienceBuilder;
